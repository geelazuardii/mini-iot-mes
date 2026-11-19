require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const pool = require('./db');
const { validatePayload } = require('./validate');

const app = express();
const PORT = process.env.PORT || 3000;
const OFFLINE_AFTER_SEC = 30;

app.use(express.json({ limit: '10kb' }));
// Dashboard disajikan dari server yang sama -> fetch tanpa masalah CORS
app.use(express.static(path.join(__dirname, '..', 'dashboard')));

// Bandingkan key tanpa bocor lewat selisih waktu
function keyMatches(given, expected) {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

app.get('/health', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------
// POST /api/ingest
// 401 key salah | 400 data tidak valid | 200 duplikat | 201 tersimpan
// ---------------------------------------------------------------
app.post('/api/ingest', async (req, res, next) => {
  const body = req.body || {};
  const key = req.get('X-Device-Key');

  if (!key) return res.status(401).json({ error: 'X-Device-Key tidak ada' });
  if (typeof body.machine_id !== 'string' || !body.machine_id) {
    return res.status(400).json({ error: 'machine_id wajib diisi' });
  }

  const client = await pool.connect();
  try {
    const m = await client.query(
      'SELECT device_key FROM machines WHERE machine_id = $1',
      [body.machine_id]
    );
    if (m.rowCount === 0 || !keyMatches(key, m.rows[0].device_key)) {
      return res.status(401).json({ error: 'key salah' });
    }

    const errors = validatePayload(body);
    if (errors.length) return res.status(400).json({ error: 'data tidak valid', details: errors });

    const reason = body.state === 'DOWN' ? body.reason : null;

    await client.query('BEGIN');
    // kunci baris mesin supaya dua pesan bersamaan tidak balapan di riwayat status
    await client.query('SELECT 1 FROM machines WHERE machine_id = $1 FOR UPDATE', [body.machine_id]);

    const ins = await client.query(
      `INSERT INTO telemetry
         (machine_id, boot_id, seq, state, reason, output_delta, reject_delta, temperature_c)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (machine_id, boot_id, seq) DO NOTHING
       RETURNING id`,
      [body.machine_id, body.boot_id, body.seq, body.state, reason,
       body.output_delta, body.reject_delta, body.temperature_c]
    );

    if (ins.rowCount === 0) {
      await client.query('COMMIT');
      return res.status(200).json({ ok: true, duplicate: true });
    }

    const last = await client.query(
      `SELECT state, reason FROM status_history
       WHERE machine_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1`,
      [body.machine_id]
    );
    const prev = last.rows[0];
    const changed = !prev || prev.state !== body.state || (prev.reason ?? null) !== reason;

    if (changed) {
      await client.query(
        `INSERT INTO status_history (machine_id, state, reason, telemetry_id)
         VALUES ($1,$2,$3,$4)`,
        [body.machine_id, body.state, reason, ins.rows[0].id]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, duplicate: false, status_changed: changed });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------
// GET /api/machines
// ---------------------------------------------------------------
app.get('/api/machines', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      WITH day AS (
        SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta') AS start_at
      )
      SELECT m.machine_id, m.name,
             l.state, l.reason, l.temperature_c, l.received_at AS last_seen,
             COALESCE(t.output_today, 0)::int AS output_today,
             COALESCE(t.reject_today, 0)::int AS reject_today,
             (l.received_at IS NOT NULL
               AND now() - l.received_at <= make_interval(secs => $1)) AS online
      FROM machines m
      CROSS JOIN day
      LEFT JOIN LATERAL (
        SELECT state, reason, temperature_c, received_at
        FROM telemetry WHERE machine_id = m.machine_id
        ORDER BY received_at DESC, id DESC LIMIT 1
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT SUM(output_delta) AS output_today, SUM(reject_delta) AS reject_today
        FROM telemetry
        WHERE machine_id = m.machine_id AND received_at >= day.start_at
      ) t ON true
      ORDER BY m.machine_id`, [OFFLINE_AFTER_SEC]);

    const machines = rows.map((r) => ({
      machine_id: r.machine_id,
      name: r.name,
      status: r.online ? r.state : 'OFFLINE',  // status yang ditampilkan
      last_state: r.state,                     // status terakhir yang dilaporkan
      reason: r.online ? r.reason : null,
      online: r.online,
      temperature_c: r.temperature_c === null ? null : Number(r.temperature_c),
      last_seen: r.last_seen,
      output_today: r.output_today,
      reject_today: r.reject_today,
    }));

    res.json({ server_time: new Date().toISOString(), machines });
  } catch (err) {
    next(err);
  }
});

// JSON rusak -> 400, selain itu 500
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'JSON tidak valid' });
  }
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});
