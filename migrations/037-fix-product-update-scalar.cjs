require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  console.log('Fixing json_to_recordset in rpc_update_product_full...');

  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_update_product_full(
      p_product_id UUID,
      p_product_name TEXT,
      p_category_id UUID DEFAULT NULL,
      p_product_type TEXT DEFAULT 'simple',
      p_hsn_code TEXT DEFAULT NULL,
      p_gst_percentage NUMERIC DEFAULT 0,
      p_description TEXT DEFAULT NULL,
      p_default_supplier_id UUID DEFAULT NULL,
      p_min_stock NUMERIC DEFAULT 0,
      p_max_stock NUMERIC DEFAULT 0,
      p_reorder_level NUMERIC DEFAULT 0,
      p_is_active BOOLEAN DEFAULT true,
      p_units JSONB DEFAULT '[]'::jsonb,
      p_barcodes JSONB DEFAULT '[]'::jsonb,
      p_variants JSONB DEFAULT '[]'::jsonb
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_unit RECORD;
      v_barcode RECORD;
      v_variant RECORD;
      v_unit_id UUID;
      v_units_jsonb JSONB;
      v_barcodes_jsonb JSONB;
      v_variants_jsonb JSONB;
    BEGIN
      -- Safely parse JSONB inputs
      v_units_jsonb := CASE 
        WHEN jsonb_typeof(p_units) = 'array' THEN p_units 
        WHEN jsonb_typeof(p_units) = 'string' THEN (p_units#>>'{}')::jsonb
        ELSE '[]'::jsonb 
      END;

      v_barcodes_jsonb := CASE 
        WHEN jsonb_typeof(p_barcodes) = 'array' THEN p_barcodes 
        WHEN jsonb_typeof(p_barcodes) = 'string' THEN (p_barcodes#>>'{}')::jsonb
        ELSE '[]'::jsonb 
      END;

      v_variants_jsonb := CASE 
        WHEN jsonb_typeof(p_variants) = 'array' THEN p_variants 
        WHEN jsonb_typeof(p_variants) = 'string' THEN (p_variants#>>'{}')::jsonb
        ELSE '[]'::jsonb 
      END;

      -- Ensure array type after parse
      IF jsonb_typeof(v_units_jsonb) != 'array' THEN v_units_jsonb := '[]'::jsonb; END IF;
      IF jsonb_typeof(v_barcodes_jsonb) != 'array' THEN v_barcodes_jsonb := '[]'::jsonb; END IF;
      IF jsonb_typeof(v_variants_jsonb) != 'array' THEN v_variants_jsonb := '[]'::jsonb; END IF;

      -- Update product header
      UPDATE products SET
        product_name = p_product_name,
        category_id = p_category_id,
        product_type = p_product_type,
        hsn_code = p_hsn_code,
        gst_percentage = p_gst_percentage,
        description = p_description,
        default_supplier_id = p_default_supplier_id,
        min_stock_level = p_min_stock,
        max_stock_level = p_max_stock,
        reorder_level = p_reorder_level,
        is_active = p_is_active,
        updated_at = NOW()
      WHERE id = p_product_id;

      -- Replace sub-entities
      DELETE FROM product_images WHERE product_id = p_product_id;
      DELETE FROM product_barcodes WHERE product_id = p_product_id;
      DELETE FROM product_variants WHERE product_id = p_product_id;
      DELETE FROM product_units WHERE product_id = p_product_id;

      -- Re-insert units using jsonb_to_recordset
      FOR v_unit IN SELECT * FROM jsonb_to_recordset(v_units_jsonb) AS x(
        unit_name TEXT, unit_short_code TEXT, conversion_factor NUMERIC,
        purchase_price NUMERIC, selling_price NUMERIC, mrp NUMERIC,
        is_base_unit BOOLEAN, is_purchase_unit BOOLEAN, is_sales_unit BOOLEAN
      ) LOOP
        INSERT INTO product_units (
          product_id, unit_name, unit_short_code, conversion_factor,
          purchase_price, selling_price, mrp,
          is_base_unit, is_purchase_unit, is_sales_unit
        ) VALUES (
          p_product_id, v_unit.unit_name, v_unit.unit_short_code, v_unit.conversion_factor,
          v_unit.purchase_price, v_unit.selling_price, v_unit.mrp,
          COALESCE(v_unit.is_base_unit, false), COALESCE(v_unit.is_purchase_unit, false), COALESCE(v_unit.is_sales_unit, false)
        ) RETURNING id INTO v_unit_id;

        -- Match barcodes to this unit
        FOR v_barcode IN SELECT * FROM jsonb_to_recordset(v_barcodes_jsonb) AS x(
          barcode TEXT, barcode_type TEXT, unit_short_code TEXT
        ) LOOP
          IF v_barcode.unit_short_code = v_unit.unit_short_code THEN
            INSERT INTO product_barcodes (product_id, product_unit_id, barcode, barcode_type)
            VALUES (p_product_id, v_unit_id, v_barcode.barcode, v_barcode.barcode_type);
          END IF;
        END LOOP;
      END LOOP;

      -- Re-insert variants
      FOR v_variant IN SELECT * FROM jsonb_to_recordset(v_variants_jsonb) AS x(
        variant_type TEXT, variant_value TEXT, price_adjustment NUMERIC, sku_suffix TEXT
      ) LOOP
        INSERT INTO product_variants (product_id, variant_type, variant_value, price_adjustment, sku_suffix)
        VALUES (p_product_id, v_variant.variant_type, v_variant.variant_value,
                COALESCE(v_variant.price_adjustment, 0), v_variant.sku_suffix);
      END LOOP;

      RETURN json_build_object('success', true);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION rpc_update_product_full(UUID, TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, JSONB, JSONB, JSONB) TO authenticated, anon;
  `);

  console.log('rpc_update_product_full updated successfully.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  await client.end();
})();
