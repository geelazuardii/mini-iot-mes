-- Menit MC-01 di tiap status, 24 Nov 2026 08:00-12:00 WIB.
-- Status berlaku sampai status berikutnya; bagian di luar 08:00-12:00 dipotong.

-- ============================================================
-- QUERY A: pakai data contoh dari soal (bisa langsung dijalankan)
-- ============================================================
WITH sample(started_at, state, reason) AS (
  VALUES
    ('2026-11-24 07:40:00+07'::timestamptz, 'RUNNING', NULL),
    ('2026-11-24 08:25:00+07', 'IDLE',    NULL),
    ('2026-11-24 08:40:00+07', 'RUNNING', NULL),
    ('2026-11-24 10:05:00+07', 'DOWN',    'OVERHEAT'),
    ('2026-11-24 10:50:00+07', 'RUNNING', NULL),
    ('2026-11-24 11:30:00+07', 'IDLE',    NULL),
    ('2026-11-24 12:20:00+07', 'RUNNING', NULL)
),
win AS (
  SELECT '2026-11-24 08:00:00+07'::timestamptz AS w_start,
         '2026-11-24 12:00:00+07'::timestamptz AS w_end
),
seg AS (
  SELECT state, started_at,
         LEAD(started_at) OVER (ORDER BY started_at) AS ended_at
  FROM sample
)
SELECT state,
       ROUND(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, w_end), w_end)
                                   - GREATEST(started_at, w_start))) / 60)::numeric, 1) AS menit
FROM seg, win
WHERE started_at < w_end
  AND COALESCE(ended_at, w_end) > w_start
GROUP BY state
ORDER BY state;
-- Hasil yang diharapkan: DOWN 45, IDLE 45, RUNNING 150 (total 240 menit)

-- ============================================================
-- QUERY B: versi untuk tabel status_history yang asli
-- ============================================================
WITH win AS (
  SELECT '2026-11-24 08:00:00+07'::timestamptz AS w_start,
         '2026-11-24 12:00:00+07'::timestamptz AS w_end
),
seg AS (
  SELECT state, started_at,
         LEAD(started_at) OVER (ORDER BY started_at, id) AS ended_at
  FROM status_history
  WHERE machine_id = 'MC-01'   -- jangan difilter waktu di sini, baris sebelum 08:00 dibutuhkan
)
SELECT state,
       ROUND(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, w_end), w_end)
                                   - GREATEST(started_at, w_start))) / 60)::numeric, 1) AS menit
FROM seg, win
WHERE started_at < w_end
  AND COALESCE(ended_at, w_end) > w_start
GROUP BY state
ORDER BY state;

-- Untuk mencoba Query B dengan data contoh (hapus lagi setelahnya):
-- INSERT INTO status_history (machine_id, state, reason, started_at) VALUES
--   ('MC-01','RUNNING',NULL,    '2026-11-24 07:40:00+07'),
--   ('MC-01','IDLE',NULL,       '2026-11-24 08:25:00+07'),
--   ('MC-01','RUNNING',NULL,    '2026-11-24 08:40:00+07'),
--   ('MC-01','DOWN','OVERHEAT', '2026-11-24 10:05:00+07'),
--   ('MC-01','RUNNING',NULL,    '2026-11-24 10:50:00+07'),
--   ('MC-01','IDLE',NULL,       '2026-11-24 11:30:00+07'),
--   ('MC-01','RUNNING',NULL,    '2026-11-24 12:20:00+07');
