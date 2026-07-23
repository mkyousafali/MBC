require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  console.log('Connected. Adding PO list & detail RPCs...');

  // 1. List Purchase Orders
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_purchase_orders(
      p_search TEXT DEFAULT NULL,
      p_status TEXT DEFAULT NULL,
      p_po_type TEXT DEFAULT NULL,
      p_limit INT DEFAULT 30,
      p_offset INT DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_data JSON;
      v_total INT;
    BEGIN
      SELECT COUNT(*) INTO v_total
      FROM purchase_orders po
      LEFT JOIN supplier_master sm ON sm.id = po.supplier_id
      WHERE (p_search IS NULL OR p_search = '' OR
             po.po_number ILIKE '%' || p_search || '%' OR
             sm.supplier_name ILIKE '%' || p_search || '%')
        AND (p_status IS NULL OR p_status = '' OR po.status = p_status)
        AND (p_po_type IS NULL OR p_po_type = '' OR po.po_type = p_po_type);

      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_data
      FROM (
        SELECT po.id, po.po_number, po.po_type, po.po_date, po.status,
               po.total_amount, po.notes, po.created_by, po.created_at,
               sm.supplier_name, sm.supplier_code,
               (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS items_count
        FROM purchase_orders po
        LEFT JOIN supplier_master sm ON sm.id = po.supplier_id
        WHERE (p_search IS NULL OR p_search = '' OR
               po.po_number ILIKE '%' || p_search || '%' OR
               sm.supplier_name ILIKE '%' || p_search || '%')
          AND (p_status IS NULL OR p_status = '' OR po.status = p_status)
          AND (p_po_type IS NULL OR p_po_type = '' OR po.po_type = p_po_type)
        ORDER BY po.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t;

      RETURN json_build_object('data', v_data, 'total', v_total);
    END;
    $$
  `);
  console.log('rpc_list_purchase_orders created.');

  // 2. Get PO Detail with items
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_get_purchase_order_detail(
      p_po_id UUID
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_po JSON;
      v_items JSON;
    BEGIN
      SELECT row_to_json(t) INTO v_po
      FROM (
        SELECT po.id, po.po_number, po.po_type, po.po_date, po.status,
               po.total_amount, po.notes, po.created_by, po.created_at,
               sm.supplier_name, sm.supplier_code
        FROM purchase_orders po
        LEFT JOIN supplier_master sm ON sm.id = po.supplier_id
        WHERE po.id = p_po_id
      ) t;

      IF v_po IS NULL THEN
        RETURN json_build_object('success', FALSE, 'message', 'PO not found');
      END IF;

      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_items
      FROM (
        SELECT poi.id, poi.product_id, poi.unit_name, poi.unit_short_code,
               poi.conversion_factor, poi.quantity, poi.unit_price, poi.total_price,
               p.product_code, p.product_name
        FROM purchase_order_items poi
        JOIN products p ON p.id = poi.product_id
        WHERE poi.purchase_order_id = p_po_id
        ORDER BY poi.created_at
      ) t;

      RETURN json_build_object('success', TRUE, 'po', v_po, 'items', v_items);
    END;
    $$
  `);
  console.log('rpc_get_purchase_order_detail created.');

  await client.end();
  console.log('Done! Migration 034 complete.');
})();
