require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  console.log('Connected. Updating PO detail RPC to include supplier phone...');

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
               sm.supplier_name, sm.supplier_code, sm.phone AS supplier_phone
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
  console.log('rpc_get_purchase_order_detail updated with supplier_phone.');

  await client.end();
  console.log('Done!');
})();
