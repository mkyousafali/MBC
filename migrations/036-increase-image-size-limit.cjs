require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to DB.');

  // Update product-images bucket file size limit to 50MB (52428800 bytes)
  await client.query(`
    UPDATE storage.buckets
    SET file_size_limit = 52428800
    WHERE id = 'product-images';
  `);
  console.log('Storage bucket "product-images" file_size_limit updated to 50MB (52,428,800 bytes).');

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
