-- Data awal mesin. Key di bawah cuma contoh (sama dengan .env.example).
-- Pakai `npm run db:setup`: key otomatis diganti sesuai isi .env.
INSERT INTO machines (machine_id, name, device_key) VALUES
  ('MC-01', 'Mesin 01', 'demo-key-mc-01'),
  ('MC-02', 'Mesin 02', 'demo-key-mc-02'),
  ('MC-03', 'Mesin 03', 'demo-key-mc-03')
ON CONFLICT (machine_id) DO NOTHING;
