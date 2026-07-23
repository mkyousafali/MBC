require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // Update rpc_create_supplier to accept opening_balance
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_create_supplier(
      p_supplier_name TEXT,
      p_contact_person TEXT DEFAULT NULL,
      p_phone TEXT DEFAULT NULL,
      p_email TEXT DEFAULT NULL,
      p_gstin TEXT DEFAULT NULL,
      p_address TEXT DEFAULT NULL,
      p_state TEXT DEFAULT NULL,
      p_district TEXT DEFAULT NULL,
      p_payment_terms TEXT DEFAULT 'immediate',
      p_opening_balance NUMERIC DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_supplier_id UUID;
      v_supplier_code TEXT;
      v_ledger_id UUID;
      v_ledger_code TEXT;
      v_ap_group_id UUID;
      v_seq BIGINT;
      v_led_seq BIGINT;
      v_balance NUMERIC;
    BEGIN
      IF trim(COALESCE(p_supplier_name, '')) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Supplier name is required');
      END IF;

      SELECT id INTO v_ap_group_id FROM account_groups WHERE group_code = 'AG-ACCT-PAYABLE';
      IF v_ap_group_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Accounts Payable group not found');
      END IF;

      v_balance := COALESCE(p_opening_balance, 0);

      v_seq := nextval('supplier_code_seq');
      v_supplier_code := 'SUP' || lpad(v_seq::TEXT, 6, '0');

      v_led_seq := nextval('supplier_ledger_code_seq');
      v_ledger_code := 'LED-SUP-' || lpad(v_led_seq::TEXT, 6, '0');

      INSERT INTO ledgers (
        ledger_code, ledger_name, account_group_id,
        reference_type, reference_id, opening_balance,
        opening_balance_side, currency_code,
        is_system_generated, allow_manual_posting, is_active
      ) VALUES (
        v_ledger_code, trim(p_supplier_name), v_ap_group_id,
        'supplier', gen_random_uuid(), v_balance,
        'credit', 'INR',
        TRUE, TRUE, TRUE
      ) RETURNING id INTO v_ledger_id;

      INSERT INTO supplier_master (
        supplier_code, supplier_name, contact_person, phone, email,
        gstin, address, state, district, payment_terms, ledger_id
      ) VALUES (
        v_supplier_code, trim(p_supplier_name),
        NULLIF(trim(COALESCE(p_contact_person, '')), ''),
        NULLIF(trim(COALESCE(p_phone, '')), ''),
        NULLIF(trim(COALESCE(p_email, '')), ''),
        NULLIF(trim(COALESCE(p_gstin, '')), ''),
        NULLIF(trim(COALESCE(p_address, '')), ''),
        NULLIF(trim(COALESCE(p_state, '')), ''),
        NULLIF(trim(COALESCE(p_district, '')), ''),
        COALESCE(p_payment_terms, 'immediate'),
        v_ledger_id
      ) RETURNING id INTO v_supplier_id;

      UPDATE ledgers SET reference_id = v_supplier_id WHERE id = v_ledger_id;

      RETURN json_build_object(
        'success', true,
        'message', 'Supplier created successfully',
        'supplier_id', v_supplier_id,
        'supplier_code', v_supplier_code,
        'ledger_id', v_ledger_id,
        'ledger_code', v_ledger_code
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_create_supplier updated with opening_balance.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
