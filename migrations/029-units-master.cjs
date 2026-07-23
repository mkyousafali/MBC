require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // 1. Create units_master table
  await client.query(`
    CREATE TABLE IF NOT EXISTS units_master (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      unit_name TEXT NOT NULL UNIQUE,
      unit_short_code TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('units_master table created.');

  // 2. Seed common units
  const units = [
    ['Piece', 'pcs'],
    ['Kilogram', 'kg'],
    ['Gram', 'g'],
    ['Litre', 'ltr'],
    ['Millilitre', 'ml'],
    ['Box', 'box'],
    ['Carton', 'ctn'],
    ['Case', 'cs'],
    ['Pack', 'pk'],
    ['Dozen', 'dzn'],
    ['Bag', 'bag'],
    ['Bottle', 'btl'],
    ['Can', 'can'],
    ['Packet', 'pkt'],
    ['Tray', 'tray'],
    ['Jar', 'jar'],
    ['Bundle', 'bdl'],
    ['Roll', 'roll'],
    ['Meter', 'm'],
    ['Feet', 'ft'],
    ['Pouch', 'pouch'],
    ['Cup', 'cup'],
    ['Plate', 'plate'],
    ['Serving', 'srv'],
    ['Nos', 'nos']
  ];

  for (const [name, code] of units) {
    await client.query(
      `INSERT INTO units_master (unit_name, unit_short_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [name, code]
    );
  }
  console.log(`Seeded ${units.length} units.`);

  // 3. RPC: List units
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_units_master(p_active_only BOOLEAN DEFAULT TRUE)
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(json_agg(row_to_json(u) ORDER BY u.unit_name), '[]'::json)
        FROM (
          SELECT id, unit_name, unit_short_code, is_active
          FROM units_master
          WHERE (NOT p_active_only OR is_active = TRUE)
          ORDER BY unit_name
        ) u
      );
    END;
    $$
  `);
  console.log('rpc_list_units_master created.');

  // 4. RPC: Add new unit
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_unit_master(
      p_unit_name TEXT,
      p_unit_short_code TEXT
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_id UUID;
    BEGIN
      IF TRIM(p_unit_name) = '' OR TRIM(p_unit_short_code) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Unit name and short code are required');
      END IF;

      IF EXISTS(SELECT 1 FROM units_master WHERE LOWER(unit_name) = LOWER(TRIM(p_unit_name))) THEN
        RETURN json_build_object('success', false, 'message', 'Unit name already exists');
      END IF;

      IF EXISTS(SELECT 1 FROM units_master WHERE LOWER(unit_short_code) = LOWER(TRIM(p_unit_short_code))) THEN
        RETURN json_build_object('success', false, 'message', 'Short code already exists');
      END IF;

      INSERT INTO units_master (unit_name, unit_short_code)
      VALUES (TRIM(p_unit_name), LOWER(TRIM(p_unit_short_code)))
      RETURNING id INTO v_id;

      RETURN json_build_object('success', true, 'id', v_id, 'unit_name', TRIM(p_unit_name), 'unit_short_code', LOWER(TRIM(p_unit_short_code)));
    END;
    $$
  `);
  console.log('rpc_add_unit_master created.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
