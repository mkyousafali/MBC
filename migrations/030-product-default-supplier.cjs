require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // 1. Add default_supplier_id to products
  await client.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS default_supplier_id UUID REFERENCES supplier_master(id)
  `);
  console.log('default_supplier_id column added to products.');

  // 2. Update rpc_create_product to accept supplier
  // First read current function to understand params - we'll recreate with new param
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_create_product(
      p_product_name TEXT,
      p_category_id UUID DEFAULT NULL,
      p_product_type TEXT DEFAULT 'raw_material',
      p_hsn_code TEXT DEFAULT NULL,
      p_gst_percentage NUMERIC DEFAULT 0,
      p_description TEXT DEFAULT NULL,
      p_min_stock NUMERIC DEFAULT 0,
      p_max_stock NUMERIC DEFAULT 0,
      p_reorder_level NUMERIC DEFAULT 0,
      p_units JSON DEFAULT '[]',
      p_barcodes JSON DEFAULT '[]',
      p_variants JSON DEFAULT '[]',
      p_default_supplier_id UUID DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_product_id UUID;
      v_product_code TEXT;
      v_unit RECORD;
      v_barcode RECORD;
      v_variant RECORD;
      v_unit_id UUID;
    BEGIN
      IF TRIM(p_product_name) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Product name is required');
      END IF;

      SELECT 'PRD' || LPAD(nextval('product_code_seq')::text, 6, '0') INTO v_product_code;

      INSERT INTO products (
        product_code, product_name, category_id, product_type,
        hsn_code, gst_percentage, description,
        min_stock_level, max_stock_level, reorder_level,
        default_supplier_id
      ) VALUES (
        v_product_code, TRIM(p_product_name), p_category_id, p_product_type,
        p_hsn_code, p_gst_percentage, p_description,
        p_min_stock, p_max_stock, p_reorder_level,
        p_default_supplier_id
      ) RETURNING id INTO v_product_id;

      -- Units
      FOR v_unit IN SELECT * FROM json_to_recordset(p_units) AS x(
        unit_name TEXT, unit_short_code TEXT, conversion_factor NUMERIC,
        purchase_price NUMERIC, selling_price NUMERIC, mrp NUMERIC,
        is_base_unit BOOLEAN, is_purchase_unit BOOLEAN, is_sales_unit BOOLEAN
      ) LOOP
        INSERT INTO product_units (
          product_id, unit_name, unit_short_code, conversion_factor,
          purchase_price, selling_price, mrp,
          is_base_unit, is_purchase_unit, is_sales_unit
        ) VALUES (
          v_product_id, v_unit.unit_name, v_unit.unit_short_code, v_unit.conversion_factor,
          v_unit.purchase_price, v_unit.selling_price, v_unit.mrp,
          COALESCE(v_unit.is_base_unit, false), COALESCE(v_unit.is_purchase_unit, false), COALESCE(v_unit.is_sales_unit, false)
        ) RETURNING id INTO v_unit_id;

        -- Match barcodes to this unit by short code
        FOR v_barcode IN SELECT * FROM json_to_recordset(p_barcodes) AS x(
          barcode TEXT, barcode_type TEXT, unit_short_code TEXT
        ) LOOP
          IF v_barcode.unit_short_code = v_unit.unit_short_code THEN
            INSERT INTO product_barcodes (product_id, product_unit_id, barcode, barcode_type)
            VALUES (v_product_id, v_unit_id, v_barcode.barcode, v_barcode.barcode_type);
          END IF;
        END LOOP;
      END LOOP;

      -- Variants
      FOR v_variant IN SELECT * FROM json_to_recordset(p_variants) AS x(
        variant_type TEXT, variant_value TEXT, price_adjustment NUMERIC, sku_suffix TEXT
      ) LOOP
        INSERT INTO product_variants (product_id, variant_type, variant_value, price_adjustment, sku_suffix)
        VALUES (v_product_id, v_variant.variant_type, v_variant.variant_value,
                COALESCE(v_variant.price_adjustment, 0), v_variant.sku_suffix);
      END LOOP;

      RETURN json_build_object('success', true, 'product_id', v_product_id, 'product_code', v_product_code);
    END;
    $$
  `);
  console.log('rpc_create_product updated with default_supplier_id.');

  // 3. Update rpc_list_products to include supplier
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_products(
      p_search TEXT DEFAULT '',
      p_category_id UUID DEFAULT NULL,
      p_product_type TEXT DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.product_code), '[]'::json)
        FROM (
          SELECT p.id, p.product_code, p.product_name, p.product_type,
                 c.category_name, p.hsn_code, p.gst_percentage,
                 p.is_active, p.created_at,
                 p.default_supplier_id,
                 sm.supplier_name AS default_supplier_name,
                 sm.supplier_code AS default_supplier_code,
                 (SELECT unit_name FROM product_units WHERE product_id = p.id AND is_base_unit = true LIMIT 1) AS base_unit,
                 (SELECT COUNT(*) FROM product_units WHERE product_id = p.id) AS units_count,
                 (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) AS variants_count,
                 (SELECT COUNT(*) FROM product_barcodes WHERE product_id = p.id) AS barcodes_count
          FROM products p
          LEFT JOIN product_categories c ON c.id = p.category_id
          LEFT JOIN supplier_master sm ON sm.id = p.default_supplier_id
          WHERE (p_search = '' OR p.product_name ILIKE '%' || p_search || '%' OR p.product_code ILIKE '%' || p_search || '%')
            AND (p_category_id IS NULL OR p.category_id = p_category_id)
            AND (p_product_type IS NULL OR p.product_type = p_product_type)
          ORDER BY p.product_code
        ) t
      );
    END;
    $$
  `);
  console.log('rpc_list_products updated with supplier.');

  // 4. Update rpc_get_product_detail to include supplier
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_product_detail(p_product_id UUID)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_product JSON;
      v_units JSON;
      v_barcodes JSON;
      v_variants JSON;
      v_images JSON;
    BEGIN
      SELECT row_to_json(t) INTO v_product FROM (
        SELECT p.*, c.category_name,
               sm.supplier_name AS default_supplier_name,
               sm.supplier_code AS default_supplier_code
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN supplier_master sm ON sm.id = p.default_supplier_id
        WHERE p.id = p_product_id
      ) t;

      IF v_product IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Product not found');
      END IF;

      SELECT COALESCE(json_agg(row_to_json(u)), '[]'::json) INTO v_units
      FROM (
        SELECT id, unit_name, unit_short_code, conversion_factor,
               purchase_price, selling_price, mrp,
               is_base_unit, is_purchase_unit, is_sales_unit, is_active
        FROM product_units WHERE product_id = p_product_id ORDER BY is_base_unit DESC, unit_name
      ) u;

      SELECT COALESCE(json_agg(row_to_json(b)), '[]'::json) INTO v_barcodes
      FROM (
        SELECT pb.id, pb.barcode, pb.barcode_type, pb.product_unit_id,
               pu.unit_name AS unit_name, pu.unit_short_code
        FROM product_barcodes pb
        LEFT JOIN product_units pu ON pu.id = pb.product_unit_id
        WHERE pb.product_id = p_product_id ORDER BY pb.created_at
      ) b;

      SELECT COALESCE(json_agg(row_to_json(v)), '[]'::json) INTO v_variants
      FROM (
        SELECT id, variant_type, variant_value, price_adjustment, sku_suffix, is_active
        FROM product_variants WHERE product_id = p_product_id ORDER BY variant_type, variant_value
      ) v;

      SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json) INTO v_images
      FROM (
        SELECT pi.id, pi.image_url, pi.display_order, pi.is_primary,
               pi.product_unit_id, pi.product_variant_id,
               pu.unit_name, pv.variant_value
        FROM product_images pi
        LEFT JOIN product_units pu ON pu.id = pi.product_unit_id
        LEFT JOIN product_variants pv ON pv.id = pi.product_variant_id
        WHERE pi.product_id = p_product_id ORDER BY pi.display_order
      ) i;

      RETURN json_build_object(
        'success', true,
        'product', v_product,
        'units', v_units,
        'barcodes', v_barcodes,
        'variants', v_variants,
        'images', v_images
      );
    END;
    $$
  `);
  console.log('rpc_get_product_detail updated with supplier.');

  // 5. RPC: search suppliers (for dropdown)
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_search_suppliers(p_search TEXT DEFAULT '')
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          SELECT id, supplier_code, supplier_name, contact_person, phone
          FROM supplier_master
          WHERE is_active = true
            AND (p_search = '' OR supplier_name ILIKE '%' || p_search || '%' OR supplier_code ILIKE '%' || p_search || '%')
          ORDER BY supplier_name
          LIMIT 20
        ) t
      );
    END;
    $$
  `);
  console.log('rpc_search_suppliers created.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
