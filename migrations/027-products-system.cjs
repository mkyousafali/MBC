require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ============================================================
  // 1. PRODUCT CATEGORIES
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_code     TEXT NOT NULL UNIQUE,
      category_name     TEXT NOT NULL,
      parent_category_id UUID NULL REFERENCES product_categories(id) ON DELETE SET NULL,
      description       TEXT NULL,
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      display_order     INT NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('product_categories table created.');

  // ============================================================
  // 2. PRODUCTS
  // ============================================================
  await client.query(`CREATE SEQUENCE IF NOT EXISTS product_code_seq START 1`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS products (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_code      TEXT NOT NULL UNIQUE,
      product_name      TEXT NOT NULL,
      category_id       UUID NULL REFERENCES product_categories(id) ON DELETE SET NULL,
      product_type      TEXT NOT NULL DEFAULT 'raw_material'
                        CHECK (product_type IN ('raw_material', 'finished', 'traded')),
      hsn_code          TEXT NULL,
      gst_percentage    NUMERIC(5,2) NOT NULL DEFAULT 0,
      description       TEXT NULL,
      min_stock_level   NUMERIC(14,3) NOT NULL DEFAULT 0,
      max_stock_level   NUMERIC(14,3) NOT NULL DEFAULT 0,
      reorder_level     NUMERIC(14,3) NOT NULL DEFAULT 0,
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      created_by        UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('products table created.');

  // ============================================================
  // 3. PRODUCT UNITS
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_units (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit_name         TEXT NOT NULL,
      unit_short_code   TEXT NOT NULL,
      conversion_factor NUMERIC(14,4) NOT NULL DEFAULT 1,
      purchase_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
      selling_price     NUMERIC(14,2) NOT NULL DEFAULT 0,
      mrp               NUMERIC(14,2) NOT NULL DEFAULT 0,
      is_base_unit      BOOLEAN NOT NULL DEFAULT FALSE,
      is_purchase_unit  BOOLEAN NOT NULL DEFAULT FALSE,
      is_sales_unit     BOOLEAN NOT NULL DEFAULT FALSE,
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(product_id, unit_short_code)
    )
  `);
  console.log('product_units table created.');

  // ============================================================
  // 4. PRODUCT BARCODES
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_barcodes (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_unit_id   UUID NULL REFERENCES product_units(id) ON DELETE CASCADE,
      barcode           TEXT NOT NULL UNIQUE,
      barcode_type      TEXT NOT NULL DEFAULT 'internal'
                        CHECK (barcode_type IN ('ean13', 'ean8', 'code128', 'upc', 'internal')),
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('product_barcodes table created.');

  // ============================================================
  // 5. PRODUCT VARIANTS
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_type      TEXT NOT NULL,
      variant_value     TEXT NOT NULL,
      price_adjustment  NUMERIC(14,2) NOT NULL DEFAULT 0,
      sku_suffix        TEXT NULL,
      is_active         BOOLEAN NOT NULL DEFAULT TRUE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(product_id, variant_type, variant_value)
    )
  `);
  console.log('product_variants table created.');

  // ============================================================
  // 6. PRODUCT IMAGES
  // ============================================================
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_images (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_unit_id   UUID NULL REFERENCES product_units(id) ON DELETE CASCADE,
      product_variant_id UUID NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      image_url         TEXT NOT NULL,
      display_order     INT NOT NULL DEFAULT 0,
      is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('product_images table created.');

  // ============================================================
  // 7. INDEXES
  // ============================================================
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code)',
    'CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name)',
    'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type)',
    'CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active)',
    'CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_barcodes_product ON product_barcodes(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_barcodes_barcode ON product_barcodes(barcode)',
    'CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_category_id)',
  ];
  for (const idx of indexes) { await client.query(idx); }
  console.log('Indexes created.');

  // ============================================================
  // 8. RLS
  // ============================================================
  const tables = ['product_categories', 'products', 'product_units', 'product_barcodes', 'product_variants', 'product_images'];
  for (const t of tables) { await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`); }
  console.log('RLS enabled.');

  // ============================================================
  // 9. SEED CATEGORIES
  // ============================================================
  const categories = [
    ['CAT-RAW-GRAINS', 'Grains & Cereals', null, 'Rice, wheat, pulses', 1],
    ['CAT-RAW-MEAT', 'Meat & Poultry', null, 'Chicken, mutton, fish', 2],
    ['CAT-RAW-VEGS', 'Vegetables', null, 'Fresh vegetables', 3],
    ['CAT-RAW-SPICES', 'Spices & Masala', null, 'Whole and ground spices', 4],
    ['CAT-RAW-OIL', 'Oil & Ghee', null, 'Cooking oils, ghee, butter', 5],
    ['CAT-RAW-DAIRY', 'Dairy', null, 'Milk, curd, paneer, cheese', 6],
    ['CAT-RAW-DRY', 'Dry Fruits & Nuts', null, 'Cashew, raisins, almonds', 7],
    ['CAT-RAW-PACK', 'Packaging Materials', null, 'Containers, bags, foils', 8],
    ['CAT-FIN-RICE', 'Rice Items', null, 'Biriyani, fried rice, pulao', 10],
    ['CAT-FIN-BREAD', 'Breads & Roti', null, 'Naan, chapati, parotta', 11],
    ['CAT-FIN-CURRY', 'Curries & Gravies', null, 'Chicken curry, dal, sambar', 12],
    ['CAT-FIN-SNACKS', 'Snacks & Starters', null, 'Samosa, cutlet, fries', 13],
    ['CAT-FIN-DESSERT', 'Desserts & Sweets', null, 'Payasam, halwa, ice cream', 14],
    ['CAT-FIN-BAKERY', 'Bakery Items', null, 'Cake, cookies, puffs', 15],
    ['CAT-TRD-BEVERAGE', 'Beverages', null, 'Soft drinks, juice, water', 20],
    ['CAT-TRD-PACKED', 'Packed Foods', null, 'Chips, biscuits, chocolates', 21],
  ];

  for (const [code, name, parent, desc, order] of categories) {
    await client.query(`
      INSERT INTO product_categories (category_code, category_name, parent_category_id, description, display_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (category_code) DO NOTHING
    `, [code, name, parent, desc, order]);
  }
  console.log(`Seeded ${categories.length} product categories.`);

  // ============================================================
  // 10. RPC: List Categories
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_product_categories(
      p_active_only BOOLEAN DEFAULT TRUE
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          SELECT id, category_code, category_name, parent_category_id, description, is_active, display_order
          FROM product_categories
          WHERE (NOT p_active_only OR is_active = TRUE)
          ORDER BY display_order, category_name
        ) t
      );
    END;
    $$
  `);
  console.log('rpc_list_product_categories created.');

  // ============================================================
  // 11. RPC: Create Product (with units, barcodes, variants)
  // ============================================================
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
      p_variants JSON DEFAULT '[]'
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_product_id UUID;
      v_product_code TEXT;
      v_seq BIGINT;
      v_unit RECORD;
      v_unit_id UUID;
      v_barcode RECORD;
      v_variant RECORD;
      v_base_unit_found BOOLEAN := FALSE;
    BEGIN
      IF trim(COALESCE(p_product_name, '')) = '' THEN
        RETURN json_build_object('success', false, 'message', 'Product name is required');
      END IF;

      IF p_product_type NOT IN ('raw_material', 'finished', 'traded') THEN
        RETURN json_build_object('success', false, 'message', 'Invalid product type');
      END IF;

      -- Check at least one unit
      IF p_units IS NULL OR json_array_length(p_units) = 0 THEN
        RETURN json_build_object('success', false, 'message', 'At least one unit is required');
      END IF;

      v_seq := nextval('product_code_seq');
      v_product_code := 'PRD' || lpad(v_seq::TEXT, 6, '0');

      INSERT INTO products (
        product_code, product_name, category_id, product_type,
        hsn_code, gst_percentage, description,
        min_stock_level, max_stock_level, reorder_level
      ) VALUES (
        v_product_code, trim(p_product_name), p_category_id, p_product_type,
        NULLIF(trim(COALESCE(p_hsn_code, '')), ''),
        COALESCE(p_gst_percentage, 0),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        COALESCE(p_min_stock, 0), COALESCE(p_max_stock, 0), COALESCE(p_reorder_level, 0)
      ) RETURNING id INTO v_product_id;

      -- Insert units
      FOR v_unit IN SELECT * FROM json_to_recordset(p_units) AS x(
        unit_name TEXT, unit_short_code TEXT, conversion_factor NUMERIC,
        purchase_price NUMERIC, selling_price NUMERIC, mrp NUMERIC,
        is_base_unit BOOLEAN, is_purchase_unit BOOLEAN, is_sales_unit BOOLEAN
      ) LOOP
        IF v_unit.is_base_unit THEN v_base_unit_found := TRUE; END IF;

        INSERT INTO product_units (
          product_id, unit_name, unit_short_code, conversion_factor,
          purchase_price, selling_price, mrp,
          is_base_unit, is_purchase_unit, is_sales_unit
        ) VALUES (
          v_product_id, trim(v_unit.unit_name), lower(trim(v_unit.unit_short_code)),
          COALESCE(v_unit.conversion_factor, 1),
          COALESCE(v_unit.purchase_price, 0), COALESCE(v_unit.selling_price, 0),
          COALESCE(v_unit.mrp, 0),
          COALESCE(v_unit.is_base_unit, FALSE),
          COALESCE(v_unit.is_purchase_unit, FALSE),
          COALESCE(v_unit.is_sales_unit, FALSE)
        );
      END LOOP;

      IF NOT v_base_unit_found THEN
        -- Mark first unit as base
        UPDATE product_units SET is_base_unit = TRUE
        WHERE product_id = v_product_id AND id = (
          SELECT id FROM product_units WHERE product_id = v_product_id ORDER BY created_at LIMIT 1
        );
      END IF;

      -- Insert barcodes
      IF p_barcodes IS NOT NULL AND json_array_length(p_barcodes) > 0 THEN
        FOR v_barcode IN SELECT * FROM json_to_recordset(p_barcodes) AS x(
          barcode TEXT, barcode_type TEXT, unit_short_code TEXT
        ) LOOP
          SELECT id INTO v_unit_id FROM product_units
          WHERE product_id = v_product_id AND unit_short_code = lower(trim(COALESCE(v_barcode.unit_short_code, '')))
          LIMIT 1;

          INSERT INTO product_barcodes (product_id, product_unit_id, barcode, barcode_type)
          VALUES (
            v_product_id, v_unit_id, trim(v_barcode.barcode),
            COALESCE(v_barcode.barcode_type, 'internal')
          );
        END LOOP;
      END IF;

      -- Insert variants
      IF p_variants IS NOT NULL AND json_array_length(p_variants) > 0 THEN
        FOR v_variant IN SELECT * FROM json_to_recordset(p_variants) AS x(
          variant_type TEXT, variant_value TEXT, price_adjustment NUMERIC, sku_suffix TEXT
        ) LOOP
          INSERT INTO product_variants (product_id, variant_type, variant_value, price_adjustment, sku_suffix)
          VALUES (
            v_product_id, trim(v_variant.variant_type), trim(v_variant.variant_value),
            COALESCE(v_variant.price_adjustment, 0),
            NULLIF(trim(COALESCE(v_variant.sku_suffix, '')), '')
          );
        END LOOP;
      END IF;

      RETURN json_build_object(
        'success', true,
        'message', 'Product created successfully',
        'product_id', v_product_id,
        'product_code', v_product_code
      );
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'message', 'Duplicate entry: barcode or unit code already exists');
    WHEN OTHERS THEN
      RAISE;
    END;
    $$
  `);
  console.log('rpc_create_product created.');

  // ============================================================
  // 12. RPC: List Products
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_list_products(
      p_search TEXT DEFAULT NULL,
      p_category_id UUID DEFAULT NULL,
      p_product_type TEXT DEFAULT NULL,
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
      FROM products p
      WHERE (NOT p_active_only OR p.is_active = TRUE)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (p_product_type IS NULL OR p.product_type = p_product_type)
        AND (p_search IS NULL OR p_search = ''
             OR p.product_name ILIKE '%' || p_search || '%'
             OR p.product_code ILIKE '%' || p_search || '%'
             OR p.hsn_code ILIKE '%' || p_search || '%');

      SELECT json_agg(row_to_json(t)) INTO v_data
      FROM (
        SELECT p.id, p.product_code, p.product_name, p.product_type,
               p.hsn_code, p.gst_percentage, p.is_active, p.created_at,
               c.category_name,
               (SELECT bu.unit_name FROM product_units bu WHERE bu.product_id = p.id AND bu.is_base_unit = TRUE LIMIT 1) AS base_unit,
               (SELECT COUNT(*) FROM product_units pu WHERE pu.product_id = p.id) AS units_count,
               (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id) AS variants_count,
               (SELECT COUNT(*) FROM product_barcodes pb WHERE pb.product_id = p.id) AS barcodes_count
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        WHERE (NOT p_active_only OR p.is_active = TRUE)
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_product_type IS NULL OR p.product_type = p_product_type)
          AND (p_search IS NULL OR p_search = ''
               OR p.product_name ILIKE '%' || p_search || '%'
               OR p.product_code ILIKE '%' || p_search || '%'
               OR p.hsn_code ILIKE '%' || p_search || '%')
        ORDER BY p.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t;

      RETURN json_build_object('data', COALESCE(v_data, '[]'::json), 'total', v_total);
    END;
    $$
  `);
  console.log('rpc_list_products created.');

  // ============================================================
  // 13. RPC: Get Product Detail (with units, barcodes, variants)
  // ============================================================
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
    BEGIN
      SELECT row_to_json(t) INTO v_product FROM (
        SELECT p.*, c.category_name
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
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

      RETURN json_build_object(
        'success', true,
        'product', v_product,
        'units', v_units,
        'barcodes', v_barcodes,
        'variants', v_variants
      );
    END;
    $$
  `);
  console.log('rpc_get_product_detail created.');

  // ============================================================
  // 14. RPC: Update Product
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_update_product(
      p_product_id UUID,
      p_product_name TEXT DEFAULT NULL,
      p_category_id UUID DEFAULT NULL,
      p_product_type TEXT DEFAULT NULL,
      p_hsn_code TEXT DEFAULT NULL,
      p_gst_percentage NUMERIC DEFAULT NULL,
      p_description TEXT DEFAULT NULL,
      p_min_stock NUMERIC DEFAULT NULL,
      p_max_stock NUMERIC DEFAULT NULL,
      p_reorder_level NUMERIC DEFAULT NULL,
      p_is_active BOOLEAN DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM products WHERE id = p_product_id) THEN
        RETURN json_build_object('success', false, 'message', 'Product not found');
      END IF;

      UPDATE products SET
        product_name = COALESCE(NULLIF(trim(p_product_name), ''), product_name),
        category_id = COALESCE(p_category_id, category_id),
        product_type = COALESCE(p_product_type, product_type),
        hsn_code = CASE WHEN p_hsn_code IS NOT NULL THEN NULLIF(trim(p_hsn_code), '') ELSE hsn_code END,
        gst_percentage = COALESCE(p_gst_percentage, gst_percentage),
        description = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description), '') ELSE description END,
        min_stock_level = COALESCE(p_min_stock, min_stock_level),
        max_stock_level = COALESCE(p_max_stock, max_stock_level),
        reorder_level = COALESCE(p_reorder_level, reorder_level),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = NOW()
      WHERE id = p_product_id;

      RETURN json_build_object('success', true, 'message', 'Product updated');
    END;
    $$
  `);
  console.log('rpc_update_product created.');

  // ============================================================
  // 15. RPC: Add/Remove Units, Barcodes, Variants
  // ============================================================
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_product_unit(
      p_product_id UUID, p_unit_name TEXT, p_unit_short_code TEXT,
      p_conversion_factor NUMERIC DEFAULT 1, p_purchase_price NUMERIC DEFAULT 0,
      p_selling_price NUMERIC DEFAULT 0, p_mrp NUMERIC DEFAULT 0,
      p_is_base_unit BOOLEAN DEFAULT FALSE, p_is_purchase_unit BOOLEAN DEFAULT FALSE,
      p_is_sales_unit BOOLEAN DEFAULT FALSE
    )
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_id UUID;
    BEGIN
      INSERT INTO product_units (product_id, unit_name, unit_short_code, conversion_factor,
        purchase_price, selling_price, mrp, is_base_unit, is_purchase_unit, is_sales_unit)
      VALUES (p_product_id, trim(p_unit_name), lower(trim(p_unit_short_code)),
        COALESCE(p_conversion_factor, 1), COALESCE(p_purchase_price, 0),
        COALESCE(p_selling_price, 0), COALESCE(p_mrp, 0),
        COALESCE(p_is_base_unit, FALSE), COALESCE(p_is_purchase_unit, FALSE),
        COALESCE(p_is_sales_unit, FALSE))
      RETURNING id INTO v_id;
      RETURN json_build_object('success', true, 'unit_id', v_id);
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'message', 'Unit code already exists for this product');
    END; $$
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_product_barcode(
      p_product_id UUID, p_barcode TEXT, p_barcode_type TEXT DEFAULT 'internal',
      p_product_unit_id UUID DEFAULT NULL
    )
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_id UUID;
    BEGIN
      INSERT INTO product_barcodes (product_id, product_unit_id, barcode, barcode_type)
      VALUES (p_product_id, p_product_unit_id, trim(p_barcode), COALESCE(p_barcode_type, 'internal'))
      RETURNING id INTO v_id;
      RETURN json_build_object('success', true, 'barcode_id', v_id);
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'message', 'Barcode already exists');
    END; $$
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_add_product_variant(
      p_product_id UUID, p_variant_type TEXT, p_variant_value TEXT,
      p_price_adjustment NUMERIC DEFAULT 0, p_sku_suffix TEXT DEFAULT NULL
    )
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_id UUID;
    BEGIN
      INSERT INTO product_variants (product_id, variant_type, variant_value, price_adjustment, sku_suffix)
      VALUES (p_product_id, trim(p_variant_type), trim(p_variant_value),
        COALESCE(p_price_adjustment, 0), NULLIF(trim(COALESCE(p_sku_suffix, '')), ''))
      RETURNING id INTO v_id;
      RETURN json_build_object('success', true, 'variant_id', v_id);
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'message', 'Variant already exists');
    END; $$
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_delete_product_unit(p_unit_id UUID)
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      DELETE FROM product_units WHERE id = p_unit_id;
      RETURN json_build_object('success', true);
    END; $$
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_delete_product_barcode(p_barcode_id UUID)
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      DELETE FROM product_barcodes WHERE id = p_barcode_id;
      RETURN json_build_object('success', true);
    END; $$
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_delete_product_variant(p_variant_id UUID)
    RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      DELETE FROM product_variants WHERE id = p_variant_id;
      RETURN json_build_object('success', true);
    END; $$
  `);

  console.log('Unit/Barcode/Variant CRUD RPCs created.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
