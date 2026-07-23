require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  console.log('Creating delete and update purchase order RPCs...');

  // RPC 1: Delete Purchase Order
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_delete_purchase_order(
      p_po_id UUID
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_po_number TEXT;
    BEGIN
      SELECT po_number INTO v_po_number FROM purchase_orders WHERE id = p_po_id;
      IF v_po_number IS NULL THEN
        RETURN json_build_object('success', FALSE, 'message', 'Purchase Order not found');
      END IF;

      DELETE FROM purchase_orders WHERE id = p_po_id;

      RETURN json_build_object('success', TRUE, 'po_number', v_po_number);
    END;
    $$
  `);
  console.log('rpc_delete_purchase_order created.');

  // RPC 2: Update Purchase Order
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_update_purchase_order(
      p_po_id UUID,
      p_notes TEXT DEFAULT NULL,
      p_status TEXT DEFAULT NULL,
      p_items JSON DEFAULT '[]'::JSON
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_po_number TEXT;
      v_item JSON;
      v_total NUMERIC(12,2) := 0;
    BEGIN
      SELECT po_number INTO v_po_number FROM purchase_orders WHERE id = p_po_id;
      IF v_po_number IS NULL THEN
        RETURN json_build_object('success', FALSE, 'message', 'Purchase Order not found');
      END IF;

      -- Update PO header fields if provided
      UPDATE purchase_orders
      SET 
        notes = COALESCE(p_notes, notes),
        status = COALESCE(p_status, status),
        updated_at = now()
      WHERE id = p_po_id;

      -- Delete existing items and re-insert if items array provided
      IF p_items IS NOT NULL AND json_array_length(p_items) > 0 THEN
        DELETE FROM purchase_order_items WHERE purchase_order_id = p_po_id;

        FOR v_item IN SELECT * FROM json_array_elements(p_items)
        LOOP
          INSERT INTO purchase_order_items (
            purchase_order_id, product_id, unit_name, unit_short_code,
            conversion_factor, quantity, unit_price, total_price
          ) VALUES (
            p_po_id,
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

        UPDATE purchase_orders SET total_amount = v_total WHERE id = p_po_id;
      END IF;

      RETURN json_build_object('success', TRUE, 'po_id', p_po_id, 'po_number', v_po_number);
    END;
    $$
  `);
  console.log('rpc_update_purchase_order created.');

  // Grant permissions
  await client.query(`
    GRANT EXECUTE ON FUNCTION rpc_delete_purchase_order(UUID) TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION rpc_update_purchase_order(UUID, TEXT, TEXT, JSON) TO authenticated, anon;
  `);
  console.log('Permissions granted.');

  await client.end();
})();
