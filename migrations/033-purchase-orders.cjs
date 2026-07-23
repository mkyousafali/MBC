require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  console.log('Connected. Creating purchase orders system...');

  // 1. Purchase Orders table
  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      po_number TEXT NOT NULL UNIQUE,
      supplier_id UUID REFERENCES supplier_master(id),
      po_type TEXT NOT NULL DEFAULT 'general' CHECK (po_type IN ('general', 'supplier_specific')),
      po_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled')),
      total_amount NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  console.log('purchase_orders table created.');

  // 2. Purchase Order Items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      unit_name TEXT NOT NULL,
      unit_short_code TEXT,
      conversion_factor NUMERIC(10,4) DEFAULT 1,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
      unit_price NUMERIC(12,2) DEFAULT 0,
      total_price NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  console.log('purchase_order_items table created.');

  // 3. PO number sequence
  await client.query(`
    CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1
  `);
  console.log('po_number_seq created.');

  // 4. RPC: Create Purchase Order
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_create_purchase_order(
      p_supplier_id UUID DEFAULT NULL,
      p_po_type TEXT DEFAULT 'general',
      p_notes TEXT DEFAULT NULL,
      p_items JSON DEFAULT '[]'::JSON,
      p_created_by TEXT DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_po_id UUID;
      v_po_number TEXT;
      v_item JSON;
      v_total NUMERIC(12,2) := 0;
    BEGIN
      -- Generate PO number
      v_po_number := 'PO-' || lpad(nextval('po_number_seq')::TEXT, 6, '0');
      
      -- Create PO
      INSERT INTO purchase_orders (po_number, supplier_id, po_type, notes, created_by)
      VALUES (v_po_number, p_supplier_id, p_po_type, p_notes, p_created_by)
      RETURNING id INTO v_po_id;

      -- Insert items
      FOR v_item IN SELECT * FROM json_array_elements(p_items)
      LOOP
        INSERT INTO purchase_order_items (
          purchase_order_id, product_id, unit_name, unit_short_code,
          conversion_factor, quantity, unit_price, total_price
        ) VALUES (
          v_po_id,
          (v_item->>'product_id')::UUID,
          v_item->>'unit_name',
          v_item->>'unit_short_code',
          COALESCE((v_item->>'conversion_factor')::NUMERIC, 1),
          COALESCE((v_item->>'quantity')::NUMERIC, 1),
          COALESCE((v_item->>'unit_price')::NUMERIC, 0),
          COALESCE((v_item->>'quantity')::NUMERIC, 1) * COALESCE((v_item->>'unit_price')::NUMERIC, 0)
        );
        v_total := v_total + (COALESCE((v_item->>'quantity')::NUMERIC, 1) * COALESCE((v_item->>'unit_price')::NUMERIC, 0));
      END LOOP;

      -- Update total
      UPDATE purchase_orders SET total_amount = v_total WHERE id = v_po_id;

      RETURN json_build_object('success', TRUE, 'po_id', v_po_id, 'po_number', v_po_number, 'total_amount', v_total);
    END;
    $$
  `);
  console.log('rpc_create_purchase_order created.');

  // 5. RPC: Get products by supplier (for supplier-specific tab)
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_products_by_supplier(
      p_supplier_id UUID
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          SELECT 
            p.id, p.product_code, p.product_name, p.product_type,
            p.gst_percentage,
            (SELECT json_agg(json_build_object(
              'unit_name', pu.unit_name,
              'unit_short_code', pu.unit_short_code,
              'is_base_unit', pu.is_base_unit,
              'conversion_factor', pu.conversion_factor,
              'purchase_price', pu.purchase_price,
              'selling_price', pu.selling_price,
              'mrp', pu.mrp
            ) ORDER BY pu.is_base_unit DESC, pu.unit_name)
            FROM product_units pu WHERE pu.product_id = p.id
            ) AS units
          FROM products p
          WHERE p.default_supplier_id = p_supplier_id
            AND p.is_active = TRUE
          ORDER BY p.product_name
        ) t
      );
    END;
    $$
  `);
  console.log('rpc_get_products_by_supplier created.');

  // 6. RPC: Search products (for general tab product search popup)
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_search_products_for_po(
      p_search TEXT DEFAULT NULL,
      p_limit INT DEFAULT 20
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          SELECT 
            p.id, p.product_code, p.product_name, p.product_type,
            p.gst_percentage,
            pc.category_name,
            (SELECT json_agg(json_build_object(
              'unit_name', pu.unit_name,
              'unit_short_code', pu.unit_short_code,
              'is_base_unit', pu.is_base_unit,
              'conversion_factor', pu.conversion_factor,
              'purchase_price', pu.purchase_price,
              'selling_price', pu.selling_price,
              'mrp', pu.mrp
            ) ORDER BY pu.is_base_unit DESC, pu.unit_name)
            FROM product_units pu WHERE pu.product_id = p.id
            ) AS units
          FROM products p
          LEFT JOIN product_categories pc ON pc.id = p.category_id
          WHERE p.is_active = TRUE
            AND (p_search IS NULL OR p_search = '' OR
                 p.product_name ILIKE '%' || p_search || '%' OR
                 p.product_code ILIKE '%' || p_search || '%')
          ORDER BY p.product_name
          LIMIT p_limit
        ) t
      );
    END;
    $$
  `);
  console.log('rpc_search_products_for_po created.');

  // 7. Register resource
  await client.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES ('inventory.operations.po', 'Inventory', 'Operations', 'Purchase Orders', '📋', 'POWindow', 30)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section, sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name, icon = EXCLUDED.icon,
      component = EXCLUDED.component, display_order = EXCLUDED.display_order
  `);
  console.log('Resource registered.');

  // 8. Grant super admin access
  await client.query(`
    INSERT INTO role_permissions (role_id, resource_id, can_view, can_add, can_edit, can_delete)
    SELECT r.id, ar.id, TRUE, TRUE, TRUE, TRUE
    FROM roles r, app_resources ar
    WHERE r.role_name = 'Super Admin' AND ar.resource_key = 'inventory.operations.po'
    ON CONFLICT (role_id, resource_id) DO UPDATE SET can_view = TRUE, can_add = TRUE, can_edit = TRUE, can_delete = TRUE
  `);
  console.log('Super Admin permissions granted.');

  await client.end();
  console.log('Done! Migration 033 complete.');
})();
