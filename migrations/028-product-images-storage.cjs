require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // 1. Create storage bucket for product images
  await client.query(`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('Storage bucket "product-images" created.');

  // 2. Allow public read access
  await client.query(`
    DO $$ BEGIN
      CREATE POLICY product_images_public_read ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  console.log('Public read policy created.');

  // 3. Allow anon uploads (app uses anon key with custom auth)
  await client.query(`
    DO $$ BEGIN
      CREATE POLICY product_images_anon_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  console.log('Anon insert policy created.');

  // 4. Allow anon deletes (for image replacement)
  await client.query(`
    DO $$ BEGIN
      CREATE POLICY product_images_anon_delete ON storage.objects FOR DELETE USING (bucket_id = 'product-images');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  console.log('Anon delete policy created.');

  // 5. RPC: Save product images after creation
  await client.query(`
    CREATE OR REPLACE FUNCTION rpc_save_product_images(
      p_product_id UUID,
      p_images JSON
    )
    RETURNS JSON
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_img RECORD;
      v_count INT := 0;
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM products WHERE id = p_product_id) THEN
        RETURN json_build_object('success', false, 'message', 'Product not found');
      END IF;

      FOR v_img IN SELECT * FROM json_to_recordset(p_images) AS x(
        image_url TEXT, product_unit_id UUID, product_variant_id UUID,
        display_order INT, is_primary BOOLEAN
      ) LOOP
        INSERT INTO product_images (
          product_id, product_unit_id, product_variant_id,
          image_url, display_order, is_primary
        ) VALUES (
          p_product_id, v_img.product_unit_id, v_img.product_variant_id,
          v_img.image_url, COALESCE(v_img.display_order, 0),
          COALESCE(v_img.is_primary, FALSE)
        );
        v_count := v_count + 1;
      END LOOP;

      RETURN json_build_object('success', true, 'count', v_count);
    END;
    $$
  `);
  console.log('rpc_save_product_images created.');

  // 6. Update rpc_get_product_detail to include images
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
      v_images JSON;
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

      SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json) INTO v_images
      FROM (
        SELECT pi.id, pi.image_url, pi.display_order, pi.is_primary,
               pi.product_unit_id, pi.product_variant_id,
               pu.unit_name, pv.variant_value
        FROM product_images pi
        LEFT JOIN product_units pu ON pu.id = pi.product_unit_id
        LEFT JOIN product_variants pv ON pv.id = pi.product_variant_id
        WHERE pi.product_id = p_product_id ORDER BY pi.display_order
      ) i;

      RETURN json_build_object(
        'success', true,
        'product', v_product,
        'units', v_units,
        'barcodes', v_barcodes,
        'variants', v_variants,
        'images', v_images
      );
    END;
    $$
  `);
  console.log('rpc_get_product_detail updated with images.');

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
