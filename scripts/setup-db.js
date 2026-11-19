// Jalankan: npm run db:setup
// Membuat tabel (schema.sql), isi mesin (seed.sql), lalu set device key dari .env
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const MACHINES = ['MC-01', 'MC-02', 'MC-03'];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL belum diisi di .env');
  }

  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8');
  await pool.query(read('schema.sql'));
  console.log('schema.sql OK');
  await pool.query(read('seed.sql'));
  console.log('seed.sql OK');

  for (const id of MACHINES) {
    const envName = 'DEVICE_KEY_' + id.replace('-', '_');
    const key = process.env[envName];
    if (!key) throw new Error(`${envName} belum diisi di .env`);
    await pool.query('UPDATE machines SET device_key = $1 WHERE machine_id = $2', [key, id]);
  }
  console.log('Device key dari .env sudah dipasang ke tabel machines');

  const { rows } = await pool.query('SELECT machine_id, name FROM machines ORDER BY 1');
  console.table(rows);
}

main()
  .catch((e) => { console.error('GAGAL:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
