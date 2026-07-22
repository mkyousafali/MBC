require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query(`
    INSERT INTO app_resources (resource_key, main_section, sub_section, button_name, icon, component, display_order)
    VALUES ('hr.operations.employee_shifts', 'HR', 'Operations', 'Employee Shifts', '🕰️', 'EmployeeShiftsWindow', 20)
    ON CONFLICT (resource_key) DO UPDATE SET
      main_section = EXCLUDED.main_section, sub_section = EXCLUDED.sub_section,
      button_name = EXCLUDED.button_name, icon = EXCLUDED.icon,
      component = EXCLUDED.component, display_order = EXCLUDED.display_order
  `);
  console.log('app_resource hr.operations.employee_shifts registered.');

  await c.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema reloaded.');
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
