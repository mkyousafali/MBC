require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // 1. Add credit_period_days and payment_mode columns to supplier_master
  await client.query(`ALTER TABLE supplier_master ADD COLUMN IF NOT EXISTS credit_period_days INT NULL`);
  console.log('credit_period_days column added.');

  await client.query(`ALTER TABLE supplier_master ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','bank'))`);
  console.log('payment_mode column added.');

  // 2. Update payment_terms check constraint (remove old options, keep only immediate/credit)
  await client.query(`ALTER TABLE supplier_master DROP CONSTRAINT IF EXISTS supplier_master_payment_terms_check`);
  await client.query(`ALTER TABLE supplier_master ADD CONSTRAINT supplier_master_payment_terms_check CHECK (payment_terms IN ('immediate','credit'))`);
  console.log('payment_terms constraint updated.');

  // 3. Update rpc_create_supplier with new fields
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
      p_credit_period_days INT DEFAULT NULL,
      p_payment_mode TEXT DEFAULT 'cash',
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
      v_obe_ledger_id UUID;
      v_fy_id UUID;
      v_txn_id UUID;
      v_voucher_num TEXT;
      v_vseq BIGINT;
    BEGIN
      IF trim(COALESCE(p_supplier_name, '')) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Supplier name is required');
      END IF;

      IF COALESCE(p_payment_terms, 'immediate') = 'credit' AND (p_credit_period_days IS NULL OR p_credit_period_days < 1) THEN
        RETURN json_build_object('success', false, 'message', 'Credit period is required for credit payment terms');
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
        gstin, address, state, district, payment_terms,
        credit_period_days, payment_mode, ledger_id
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
        CASE WHEN COALESCE(p_payment_terms, 'immediate') = 'credit' THEN p_credit_period_days ELSE NULL END,
        COALESCE(p_payment_mode, 'cash'),
        v_ledger_id
      ) RETURNING id INTO v_supplier_id;

      UPDATE ledgers SET reference_id = v_supplier_id WHERE id = v_ledger_id;

      IF v_balance > 0 THEN
        SELECT id INTO v_obe_ledger_id FROM ledgers WHERE ledger_code = 'LED-OBE-000001';
        IF v_obe_ledger_id IS NULL THEN
          RETURN json_build_object('success', false, 'message', 'Opening Balance Equity ledger not found');
        END IF;

        SELECT id INTO v_fy_id FROM financial_years WHERE is_current = TRUE LIMIT 1;
        IF v_fy_id IS NULL THEN
          RETURN json_build_object('success', false, 'message', 'No active financial year found');
        END IF;

        v_vseq := nextval('voucher_ob_seq');
        v_voucher_num := 'OB-' || lpad(v_vseq::TEXT, 6, '0');

        INSERT INTO accounting_transactions (
          voucher_number, voucher_type, financial_year_id,
          transaction_date, reference_type, reference_id,
          description, status, created_by
        ) VALUES (
          v_voucher_num, 'journal', v_fy_id,
          CURRENT_DATE, 'opening_balance', v_supplier_id,
          'Opening balance for supplier: ' || trim(p_supplier_name),
          'posted', '00000000-0000-0000-0000-000000000000'
        ) RETURNING id INTO v_txn_id;

        INSERT INTO accounting_entries (transaction_id, ledger_id, debit_amount, credit_amount, description)
        VALUES (v_txn_id, v_obe_ledger_id, v_balance, 0, 'Opening balance - ' || trim(p_supplier_name));

        INSERT INTO accounting_entries (transaction_id, ledger_id, debit_amount, credit_amount, description)
        VALUES (v_txn_id, v_ledger_id, 0, v_balance, 'Opening balance - ' || trim(p_supplier_name));
      END IF;

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
  console.log('rpc_create_supplier updated.');

  // 4. Update rpc_update_supplier with new fields
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_update_supplier(
      p_supplier_id UUID,
      p_supplier_name TEXT DEFAULT NULL,
      p_contact_person TEXT DEFAULT NULL,
      p_phone TEXT DEFAULT NULL,
      p_email TEXT DEFAULT NULL,
      p_gstin TEXT DEFAULT NULL,
      p_address TEXT DEFAULT NULL,
      p_state TEXT DEFAULT NULL,
      p_district TEXT DEFAULT NULL,
      p_payment_terms TEXT DEFAULT NULL,
      p_credit_period_days INT DEFAULT NULL,
      p_payment_mode TEXT DEFAULT NULL,
      p_is_active BOOLEAN DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM supplier_master WHERE id = p_supplier_id) THEN
        RETURN json_build_object('success', false, 'message', 'Supplier not found');
      END IF;

      UPDATE supplier_master SET
        supplier_name = COALESCE(NULLIF(trim(p_supplier_name), ''), supplier_name),
        contact_person = CASE WHEN p_contact_person IS NOT NULL THEN NULLIF(trim(p_contact_person), '') ELSE contact_person END,
        phone = CASE WHEN p_phone IS NOT NULL THEN NULLIF(trim(p_phone), '') ELSE phone END,
        email = CASE WHEN p_email IS NOT NULL THEN NULLIF(trim(p_email), '') ELSE email END,
        gstin = CASE WHEN p_gstin IS NOT NULL THEN NULLIF(trim(p_gstin), '') ELSE gstin END,
        address = CASE WHEN p_address IS NOT NULL THEN NULLIF(trim(p_address), '') ELSE address END,
        state = CASE WHEN p_state IS NOT NULL THEN NULLIF(trim(p_state), '') ELSE state END,
        district = CASE WHEN p_district IS NOT NULL THEN NULLIF(trim(p_district), '') ELSE district END,
        payment_terms = COALESCE(p_payment_terms, payment_terms),
        credit_period_days = CASE
          WHEN COALESCE(p_payment_terms, payment_terms) = 'credit' THEN COALESCE(p_credit_period_days, credit_period_days)
          ELSE NULL
        END,
        payment_mode = COALESCE(p_payment_mode, payment_mode),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = NOW()
      WHERE id = p_supplier_id;

      IF p_supplier_name IS NOT NULL AND trim(p_supplier_name) <> '' THEN
        UPDATE ledgers SET ledger_name = trim(p_supplier_name)
        WHERE reference_type = 'supplier' AND reference_id = p_supplier_id;
      END IF;

      RETURN json_build_object('success', true, 'message', 'Supplier updated');
    END;
    $$
  `);
  console.log('rpc_update_supplier updated.');

  // 5. Update rpc_list_suppliers to include new fields
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_suppliers(
      p_search TEXT DEFAULT NULL,
      p_active_only BOOLEAN DEFAULT FALSE,
      p_limit INT DEFAULT 20,
      p_offset INT DEFAULT 0
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_total INT;
      v_data JSON;
    BEGIN
      SELECT COUNT(*) INTO v_total
      FROM supplier_master s
      WHERE (NOT p_active_only OR s.is_active = TRUE)
        AND (p_search IS NULL OR p_search = ''
             OR s.supplier_name ILIKE '%' || p_search || '%'
             OR s.supplier_code ILIKE '%' || p_search || '%'
             OR s.contact_person ILIKE '%' || p_search || '%'
             OR s.phone ILIKE '%' || p_search || '%');

      SELECT json_agg(row_to_json(t)) INTO v_data
      FROM (
        SELECT s.id, s.supplier_code, s.supplier_name, s.contact_person,
               s.phone, s.email, s.gstin, s.address, s.state, s.district,
               s.payment_terms, s.credit_period_days, s.payment_mode,
               s.is_active, s.ledger_id,
               l.ledger_code, s.created_at
        FROM supplier_master s
        LEFT JOIN ledgers l ON l.id = s.ledger_id
        WHERE (NOT p_active_only OR s.is_active = TRUE)
          AND (p_search IS NULL OR p_search = ''
               OR s.supplier_name ILIKE '%' || p_search || '%'
               OR s.supplier_code ILIKE '%' || p_search || '%'
               OR s.contact_person ILIKE '%' || p_search || '%'
               OR s.phone ILIKE '%' || p_search || '%')
        ORDER BY s.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t;

      RETURN json_build_object('data', COALESCE(v_data, '[]'::json), 'total', v_total);
    END;
    $$
  `);
  console.log('rpc_list_suppliers updated.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
