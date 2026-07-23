require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ==================== 1. CLEAR ALL DATA ====================
  await client.query('DELETE FROM product_images');
  await client.query('DELETE FROM product_barcodes');
  await client.query('DELETE FROM product_variants');
  await client.query('DELETE FROM product_units');
  await client.query('DELETE FROM products');
  console.log('Product tables cleared.');

  // Clean supplier ledgers & accounting entries
  const { rows: supLedgers } = await client.query("SELECT id FROM ledgers WHERE reference_type = 'supplier'");
  const ledgerIds = supLedgers.map(l => l.id);
  if (ledgerIds.length > 0) {
    await client.query('DELETE FROM accounting_entries WHERE ledger_id = ANY($1)', [ledgerIds]);
    await client.query(`DELETE FROM accounting_transactions WHERE id NOT IN (SELECT DISTINCT transaction_id FROM accounting_entries)`);
    await client.query("DELETE FROM ledgers WHERE reference_type = 'supplier'");
  }
  await client.query('DELETE FROM supplier_master');
  console.log('Supplier tables cleared.');

  // ==================== 2. RESET UNITS ====================
  await client.query('DELETE FROM units_master');
  const units = [
    ['Piece', 'pcs'], ['Kilogram', 'kg'], ['Gram', 'g'],
    ['Litre', 'ltr'], ['Millilitre', 'ml'], ['Box', 'box'],
    ['Carton', 'ctn'], ['Case', 'cs'], ['Pack', 'pk'],
    ['Dozen', 'dzn'], ['Bag', 'bag'], ['Bottle', 'btl'],
    ['Can', 'can'], ['Packet', 'pkt'], ['Tray', 'tray'],
    ['Jar', 'jar'], ['Bundle', 'bdl'], ['Roll', 'roll'],
    ['Meter', 'm'], ['Feet', 'ft'], ['Pouch', 'pouch'],
    ['Cup', 'cup'], ['Plate', 'plate'], ['Serving', 'srv'],
    ['Nos', 'nos'], ['Cylinder', 'cyl']
  ];
  for (const [name, code] of units) {
    await client.query('INSERT INTO units_master (unit_name, unit_short_code) VALUES ($1, $2)', [name, code]);
  }
  console.log(`Units re-seeded (${units.length} units including Cylinder).`);

  // ==================== 3. RESET SEQUENCES ====================
  await client.query("ALTER SEQUENCE product_code_seq RESTART WITH 1");
  await client.query("ALTER SEQUENCE supplier_code_seq RESTART WITH 1");
  await client.query("ALTER SEQUENCE supplier_ledger_code_seq RESTART WITH 1");
  console.log('Sequences reset.');

  // ==================== 4. ENSURE CATEGORIES ====================
  async function ensureCategory(code, name) {
    let { rows } = await client.query('SELECT id FROM product_categories WHERE category_name = $1', [name]);
    if (rows.length > 0) return rows[0].id;
    ({ rows } = await client.query('INSERT INTO product_categories (category_code, category_name) VALUES ($1, $2) RETURNING id', [code, name]));
    return rows[0].id;
  }

  const catGrocery = await ensureCategory('CAT-GROCERY', 'Grocery');
  const catMasala = await ensureCategory('CAT-MASALA', 'Masala');
  const catVegetables = await ensureCategory('CAT-VEGETABLES', 'Vegetables');
  const catBeef = await ensureCategory('CAT-BEEF', 'Beef');
  const catSeafood = await ensureCategory('CAT-SEAFOOD', 'Seafood');
  const catChicken = await ensureCategory('CAT-CHICKEN', 'Chicken');
  const catMeat = await ensureCategory('CAT-MEAT', 'Meat');
  const catRice = await ensureCategory('CAT-RICE', 'Rice');
  const catSpices = await ensureCategory('CAT-SPICES', 'Spices');
  const catGas = await ensureCategory('CAT-GAS', 'Gas');
  console.log('Categories ensured.');

  // ==================== 5. CREATE SUPPLIERS ====================
  const { rows: [apGroup] } = await client.query("SELECT id FROM account_groups WHERE group_code = 'AG-ACCT-PAYABLE'");

  async function createSupplier(name, contactPerson, phone) {
    const { rows: [{ nextval: cSeq }] } = await client.query("SELECT nextval('supplier_code_seq')");
    const supplierCode = 'SUP' + String(cSeq).padStart(6, '0');

    const { rows: [{ nextval: lSeq }] } = await client.query("SELECT nextval('supplier_ledger_code_seq')");
    const ledgerCode = 'LED-SUP-' + String(lSeq).padStart(6, '0');

    const { rows: [ledger] } = await client.query(
      `INSERT INTO ledgers (ledger_code, ledger_name, account_group_id, reference_type, opening_balance)
       VALUES ($1, $2, $3, 'supplier', 0) RETURNING id`,
      [ledgerCode, name, apGroup.id]
    );

    const { rows: [sup] } = await client.query(
      `INSERT INTO supplier_master (supplier_code, supplier_name, contact_person, phone, payment_terms, payment_mode, ledger_id)
       VALUES ($1, $2, $3, $4, 'immediate', 'cash', $5) RETURNING id`,
      [supplierCode, name, contactPerson, phone, ledger.id]
    );

    console.log(`  Supplier: ${name} (${supplierCode})`);
    return sup.id;
  }

  const supMallikkada    = await createSupplier('Mallikkada', null, '9841285136');
  const supTheni         = await createSupplier('Theni Vegetables', 'Muzadir', '7358415096');
  const supBeefMangad    = await createSupplier('Beef Mangad', null, '9087178393');
  const supFish          = await createSupplier('Fish Supplier', null, '9841583572');
  const supHotelNeeds    = await createSupplier('Hotel Needs', null, '9840226673');
  const supMadheena      = await createSupplier('Madheena Chicken', null, '9940482968');
  const supJPRice        = await createSupplier('JP Rice', null, '9962672494');
  const supKeralaSpices  = await createSupplier('Kerala Spices', null, '8428427156');
  const supSureshDriver  = await createSupplier('Suresh Driver', null, '6381691973');

  // ==================== 6. CREATE PRODUCTS ====================
  let productCount = 0;

  async function createProduct(name, unitName, unitCode, categoryId, supplierId) {
    const { rows: [{ nextval: seq }] } = await client.query("SELECT nextval('product_code_seq')");
    const productCode = 'PRD' + String(seq).padStart(6, '0');

    const { rows: [prod] } = await client.query(
      `INSERT INTO products (product_code, product_name, category_id, product_type, default_supplier_id)
       VALUES ($1, $2, $3, 'raw_material', $4) RETURNING id`,
      [productCode, name, categoryId, supplierId]
    );

    await client.query(
      `INSERT INTO product_units (product_id, unit_name, unit_short_code, conversion_factor, is_base_unit, is_purchase_unit, is_sales_unit)
       VALUES ($1, $2, $3, 1, true, true, true)`,
      [prod.id, unitName, unitCode]
    );

    productCount++;
    return productCode;
  }

  // --- Mallikkada: Grocery ---
  console.log('  Creating Grocery products...');
  await createProduct('Palm Oil', 'Litre', 'ltr', catGrocery, supMallikkada);
  await createProduct('Sun Oil', 'Litre', 'ltr', catGrocery, supMallikkada);
  await createProduct('Maida', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Aata', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Staff Dal', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Black Dal', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Surf (Big)', 'Piece', 'pcs', catGrocery, supMallikkada);
  await createProduct('Surf (Small)', 'Piece', 'pcs', catGrocery, supMallikkada);
  await createProduct('Shampoo', 'Piece', 'pcs', catGrocery, supMallikkada);
  await createProduct('Soap', 'Piece', 'pcs', catGrocery, supMallikkada);
  await createProduct('Ajinomoto', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('White Pepper', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Black Pepper', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Noodles', 'Packet', 'pkt', catGrocery, supMallikkada);
  await createProduct('Corn Flour', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Steel Scrubber', 'Piece', 'pcs', catGrocery, supMallikkada);
  await createProduct('Tamarind (Puli)', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Kadala', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Dalda', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Salt', 'Kilogram', 'kg', catGrocery, supMallikkada);
  await createProduct('Phenyl', 'Litre', 'ltr', catGrocery, supMallikkada);

  // --- Mallikkada: Masala ---
  console.log('  Creating Masala products...');
  await createProduct('Tandoori Masala', 'Kilogram', 'kg', catMasala, supMallikkada);
  await createProduct('Kitchen King', 'Kilogram', 'kg', catMasala, supMallikkada);
  await createProduct('Magas', 'Kilogram', 'kg', catMasala, supMallikkada);
  await createProduct('Black Salt', 'Kilogram', 'kg', catMasala, supMallikkada);
  await createProduct('Mustard Oil', 'Litre', 'ltr', catMasala, supMallikkada);

  // --- Theni Vegetables: Vegetables ---
  console.log('  Creating Vegetables products...');
  await createProduct('Onion', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Potato', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Tomato', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Beans', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Carrot', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Capsicum', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Chilli', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Lemon', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Ginger', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Garlic', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Coriander (Malli)', 'Bundle', 'bdl', catVegetables, supTheni);
  await createProduct('Mint (Pothina)', 'Bundle', 'bdl', catVegetables, supTheni);
  await createProduct('Mushroom', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Cauliflower (Gobi)', 'Piece', 'pcs', catVegetables, supTheni);
  await createProduct('Coconut', 'Piece', 'pcs', catVegetables, supTheni);
  await createProduct('Cabbage', 'Piece', 'pcs', catVegetables, supTheni);
  await createProduct('Brinjal', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Cucumber', 'Kilogram', 'kg', catVegetables, supTheni);
  await createProduct('Mamool', 'Kilogram', 'kg', catVegetables, supTheni);

  // --- Beef Mangad: Beef ---
  console.log('  Creating Beef products...');
  await createProduct('Beef Chukka', 'Kilogram', 'kg', catBeef, supBeefMangad);
  await createProduct('Beef Biriyani Cut', 'Kilogram', 'kg', catBeef, supBeefMangad);
  await createProduct('Beef Mandi Cut', 'Kilogram', 'kg', catBeef, supBeefMangad);
  await createProduct('Beef Dry Fry Cut', 'Kilogram', 'kg', catBeef, supBeefMangad);
  await createProduct('Beef Kheema', 'Kilogram', 'kg', catBeef, supBeefMangad);

  // --- Fish Supplier: Seafood ---
  console.log('  Creating Seafood products...');
  await createProduct('Squid', 'Kilogram', 'kg', catSeafood, supFish);
  await createProduct('Ayala (Mackerel)', 'Kilogram', 'kg', catSeafood, supFish);
  await createProduct('Prawn', 'Kilogram', 'kg', catSeafood, supFish);

  // --- Hotel Needs: Chicken ---
  console.log('  Creating Chicken products...');
  await createProduct('Grill Chicken', 'Kilogram', 'kg', catChicken, supHotelNeeds);
  await createProduct('Biriyani Chicken Cutting', 'Kilogram', 'kg', catChicken, supHotelNeeds);
  await createProduct('Boneless Chicken', 'Kilogram', 'kg', catChicken, supHotelNeeds);
  await createProduct('Chicken Lollipop', 'Kilogram', 'kg', catChicken, supHotelNeeds);

  // --- Madheena Chicken: Meat ---
  console.log('  Creating Meat products...');
  await createProduct('Malabar Chicken', 'Kilogram', 'kg', catMeat, supMadheena);
  await createProduct('Chicken Curry Cut', 'Kilogram', 'kg', catMeat, supMadheena);
  await createProduct('Mutton', 'Kilogram', 'kg', catMeat, supMadheena);

  // --- JP Rice: Rice ---
  console.log('  Creating Rice products...');
  await createProduct('Jeera Rice', 'Kilogram', 'kg', catRice, supJPRice);
  await createProduct('White Rice', 'Kilogram', 'kg', catRice, supJPRice);
  await createProduct('Unity Rice', 'Kilogram', 'kg', catRice, supJPRice);

  // --- Kerala Spices: Spices ---
  console.log('  Creating Spices products...');
  await createProduct('Chicken Masala', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Garam Masala', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Chilli Powder', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Turmeric Powder', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Coriander Powder', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Jeera Powder', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Mutton Masala', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Cashew', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Casacasa (Poppy Seeds)', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Cinnamon', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Cardamom', 'Kilogram', 'kg', catSpices, supKeralaSpices);
  await createProduct('Clove', 'Kilogram', 'kg', catSpices, supKeralaSpices);

  // --- Suresh Driver: Gas ---
  console.log('  Creating Gas products...');
  await createProduct('LPG Gas Cylinder', 'Cylinder', 'cyl', catGas, supSureshDriver);

  console.log(`\nDone! Created 9 suppliers and ${productCount} products.`);
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
