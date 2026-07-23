require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // 1. Create supplier_master table
  await client.query(`
    CREATE TABLE IF NOT EXISTS supplier_master (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_code     TEXT NOT NULL UNIQUE,
      supplier_name     TEXT NOT NULL,
      contact_person    TEXT NULL,
      phone             TEXT NULL,
      email             TEXT NULL,
      gstin             TEXT NULL,
      address           TEXT NULL,
      state             TEXT NULL,
      district          TEXT NULL,
      payment_terms     TEXT NOT NULL DEFAULT 'immediate'
                        CHECK (payment_terms IN ('immediate','7_days','15_days','30_days','45_days','60_days','credit')),
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      ledger_id         UUID NULL REFERENCES ledgers(id) ON DELETE SET NULL,
      created_by        UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('supplier_master table created.');

  // Sequence for supplier codes
  await client.query(`CREATE SEQUENCE IF NOT EXISTS supplier_code_seq START 1`);
  console.log('supplier_code_seq created.');

  // Indexes
  await client.query(`CREATE INDEX IF NOT EXISTS idx_supplier_name ON supplier_master(supplier_name)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_supplier_code ON supplier_master(supplier_code)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_supplier_active ON supplier_master(is_active)`);
  console.log('Indexes created.');

  // RLS
  await client.query(`ALTER TABLE supplier_master ENABLE ROW LEVEL SECURITY`);
  console.log('RLS enabled.');

  // Sequence for supplier ledger codes
  await client.query(`CREATE SEQUENCE IF NOT EXISTS supplier_ledger_code_seq START 1`);

  // 2. RPC: Create Supplier (with auto-ledger under Accounts Payable)
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
      p_payment_terms TEXT DEFAULT 'immediate'
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
    BEGIN
      IF trim(COALESCE(p_supplier_name, '')) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Supplier name is required');
      END IF;

      -- Get Accounts Payable group
      SELECT id INTO v_ap_group_id FROM account_groups WHERE group_code = 'AG-ACCT-PAYABLE';
      IF v_ap_group_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Accounts Payable group not found');
      END IF;

      -- Generate supplier code
      v_seq := nextval('supplier_code_seq');
      v_supplier_code := 'SUP' || lpad(v_seq::TEXT, 6, '0');

      -- Create ledger for this supplier
      v_led_seq := nextval('supplier_ledger_code_seq');
      v_ledger_code := 'LED-SUP-' || lpad(v_led_seq::TEXT, 6, '0');

      INSERT INTO ledgers (
        ledger_code, ledger_name, account_group_id,
        reference_type, reference_id, opening_balance,
        opening_balance_side, currency_code,
        is_system_generated, allow_manual_posting, is_active
      ) VALUES (
        v_ledger_code, trim(p_supplier_name), v_ap_group_id,
        'supplier', gen_random_uuid(), 0,
        'credit', 'INR',
        TRUE, TRUE, TRUE
      ) RETURNING id INTO v_ledger_id;

      -- Update ledger reference_id to actual supplier id (we'll set it after insert)
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

      -- Update ledger reference_id to the actual supplier id
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
  console.log('rpc_create_supplier created.');

  // 3. RPC: List Suppliers
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
               s.payment_terms, s.is_active, s.ledger_id,
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
  console.log('rpc_list_suppliers created.');

  // 4. RPC: Update Supplier
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
        is_active = COALESCE(p_is_active, is_active),
        updated_at = NOW()
      WHERE id = p_supplier_id;

      -- Also update ledger name if supplier name changed
      IF p_supplier_name IS NOT NULL AND trim(p_supplier_name) <> '' THEN
        UPDATE ledgers SET ledger_name = trim(p_supplier_name)
        WHERE reference_type = 'supplier' AND reference_id = p_supplier_id;
      END IF;

      RETURN json_build_object('success', true, 'message', 'Supplier updated');
    END;
    $$
  `);
  console.log('rpc_update_supplier created.');

  // 5. App resource entry
  await client.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES ('inventory.manage.suppliers', 'Inventory', 'Manage', 'Suppliers', '🚚', 'SuppliersWindow', 20)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section, sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name, icon = EXCLUDED.icon,
      component = EXCLUDED.component, display_order = EXCLUDED.display_order
  `);
  console.log('app_resources entry created.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
