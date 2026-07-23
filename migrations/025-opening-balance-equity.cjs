require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // 1. Create Opening Balance Equity ledger (system, under Capital group)
  await client.query(`
    DO $$
    DECLARE
      v_capital_group_id UUID;
    BEGIN
      SELECT id INTO v_capital_group_id FROM account_groups WHERE group_code = 'AG-CAPITAL';

      IF v_capital_group_id IS NULL THEN
        RAISE EXCEPTION 'Capital account group AG-CAPITAL not found';
      END IF;

      INSERT INTO ledgers (
        ledger_code, ledger_name, account_group_id,
        reference_type, reference_id,
        opening_balance, opening_balance_side, currency_code,
        is_system_generated, allow_manual_posting, is_active
      ) VALUES (
        'LED-OBE-000001', 'Opening Balance Equity', v_capital_group_id,
        'system', gen_random_uuid(),
        0, 'credit', 'INR',
        TRUE, FALSE, TRUE
      ) ON CONFLICT (ledger_code) DO NOTHING;
    END $$
  `);
  console.log('Opening Balance Equity ledger created.');

  // 2. Create voucher sequence for opening balance entries
  await client.query(`CREATE SEQUENCE IF NOT EXISTS voucher_ob_seq START 1`);
  console.log('voucher_ob_seq created.');

  // 3. Ensure a current financial year exists (create default if none)
  const { rows: fyRows } = await client.query(`SELECT id FROM financial_years WHERE is_current = TRUE LIMIT 1`);
  if (fyRows.length === 0) {
    await client.query(`
      INSERT INTO financial_years (financial_year_code, start_date, end_date, is_current)
      VALUES ('FY-2025-26', '2025-04-01', '2026-03-31', TRUE)
      ON CONFLICT (financial_year_code) DO UPDATE SET is_current = TRUE
    `);
    console.log('Default financial year FY-2025-26 created.');
  } else {
    console.log('Financial year already exists.');
  }

  // 4. Update rpc_create_supplier to create proper double-entry for opening balance
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
      v_obe_ledger_id UUID;
      v_fy_id UUID;
      v_txn_id UUID;
      v_voucher_num TEXT;
      v_vseq BIGINT;
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

      -- Create supplier ledger
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

      -- Create supplier
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

      -- Update ledger reference_id
      UPDATE ledgers SET reference_id = v_supplier_id WHERE id = v_ledger_id;

      -- If opening balance > 0, create double-entry transaction
      IF v_balance > 0 THEN
        -- Get Opening Balance Equity ledger
        SELECT id INTO v_obe_ledger_id FROM ledgers WHERE ledger_code = 'LED-OBE-000001';
        IF v_obe_ledger_id IS NULL THEN
          RETURN json_build_object('success', false, 'message', 'Opening Balance Equity ledger not found. Run migration 025.');
        END IF;

        -- Get current financial year
        SELECT id INTO v_fy_id FROM financial_years WHERE is_current = TRUE LIMIT 1;
        IF v_fy_id IS NULL THEN
          RETURN json_build_object('success', false, 'message', 'No active financial year found');
        END IF;

        -- Generate voucher number
        v_vseq := nextval('voucher_ob_seq');
        v_voucher_num := 'OB-' || lpad(v_vseq::TEXT, 6, '0');

        -- Create transaction
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

        -- Debit: Opening Balance Equity
        INSERT INTO accounting_entries (transaction_id, ledger_id, debit_amount, credit_amount, description)
        VALUES (v_txn_id, v_obe_ledger_id, v_balance, 0, 'Opening balance - ' || trim(p_supplier_name));

        -- Credit: Supplier ledger
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
  console.log('rpc_create_supplier updated with double-entry opening balance.');

  // Also create a reusable helper function for opening balance entries (for future use with customers, etc.)
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_create_opening_balance_entry(
      p_ledger_id UUID,
      p_amount NUMERIC,
      p_balance_side TEXT,  -- 'debit' or 'credit'
      p_description TEXT DEFAULT 'Opening balance'
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_obe_ledger_id UUID;
      v_fy_id UUID;
      v_txn_id UUID;
      v_voucher_num TEXT;
      v_vseq BIGINT;
    BEGIN
      IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'message', 'Amount must be greater than 0');
      END IF;

      IF p_balance_side NOT IN ('debit', 'credit') THEN
        RETURN json_build_object('success', false, 'message', 'Balance side must be debit or credit');
      END IF;

      -- Get Opening Balance Equity ledger
      SELECT id INTO v_obe_ledger_id FROM ledgers WHERE ledger_code = 'LED-OBE-000001';
      IF v_obe_ledger_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Opening Balance Equity ledger not found');
      END IF;

      -- Get current financial year
      SELECT id INTO v_fy_id FROM financial_years WHERE is_current = TRUE LIMIT 1;
      IF v_fy_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'No active financial year found');
      END IF;

      v_vseq := nextval('voucher_ob_seq');
      v_voucher_num := 'OB-' || lpad(v_vseq::TEXT, 6, '0');

      -- Create transaction
      INSERT INTO accounting_transactions (
        voucher_number, voucher_type, financial_year_id,
        transaction_date, reference_type, reference_id,
        description, status, created_by
      ) VALUES (
        v_voucher_num, 'journal', v_fy_id,
        CURRENT_DATE, 'opening_balance', p_ledger_id,
        COALESCE(p_description, 'Opening balance'),
        'posted', '00000000-0000-0000-0000-000000000000'
      ) RETURNING id INTO v_txn_id;

      IF p_balance_side = 'credit' THEN
        -- Target ledger credit, OBE debit
        INSERT INTO accounting_entries (transaction_id, ledger_id, debit_amount, credit_amount, description)
        VALUES (v_txn_id, v_obe_ledger_id, p_amount, 0, p_description);
        INSERT INTO accounting_entries (transaction_id, ledger_id, debit_amount, credit_amount, description)
        VALUES (v_txn_id, p_ledger_id, 0, p_amount, p_description);
      ELSE
        -- Target ledger debit, OBE credit
        INSERT INTO accounting_entries (transaction_id, ledger_id, debit_amount, credit_amount, description)
        VALUES (v_txn_id, p_ledger_id, p_amount, 0, p_description);
        INSERT INTO accounting_entries (transaction_id, ledger_id, debit_amount, credit_amount, description)
        VALUES (v_txn_id, v_obe_ledger_id, 0, p_amount, p_description);
      END IF;

      RETURN json_build_object('success', true, 'message', 'Opening balance entry created', 'voucher_number', v_voucher_num);
    END;
    $$
  `);
  console.log('rpc_create_opening_balance_entry helper created.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
