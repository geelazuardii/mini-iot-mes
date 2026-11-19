-- Skema database (PostgreSQL / Supabase)
-- Aman dijalankan berulang (IF NOT EXISTS).

-- 1) Master mesin + device key
CREATE TABLE IF NOT EXISTS machines (
  machine_id  TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  device_key  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Data mentah dari ESP32
CREATE TABLE IF NOT EXISTS telemetry (
  id            BIGSERIAL PRIMARY KEY,
  machine_id    TEXT NOT NULL REFERENCES machines(machine_id),
  boot_id       TEXT NOT NULL,
  seq           INTEGER NOT NULL CHECK (seq >= 1),
  state         TEXT NOT NULL CHECK (state IN ('RUNNING','IDLE','DOWN')),
  reason        TEXT CHECK (reason IN ('FAULT_BUTTON','OVERHEAT')),
  output_delta  INTEGER NOT NULL DEFAULT 0 CHECK (output_delta >= 0),
  reject_delta  INTEGER NOT NULL DEFAULT 0 CHECK (reject_delta >= 0),
  temperature_c NUMERIC(5,1),            -- NULL = sensor gagal baca
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- kunci anti-duplikat: pesan yang sama cuma disimpan sekali
  CONSTRAINT uq_telemetry_msg UNIQUE (machine_id, boot_id, seq),
  CONSTRAINT chk_reason CHECK (
    (state = 'DOWN' AND reason IS NOT NULL) OR (state <> 'DOWN' AND reason IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_telemetry_machine_time
  ON telemetry (machine_id, received_at DESC);

-- 3) Riwayat perubahan status (satu baris = satu periode status)
CREATE TABLE IF NOT EXISTS status_history (
  id           BIGSERIAL PRIMARY KEY,
  machine_id   TEXT NOT NULL REFERENCES machines(machine_id),
  state        TEXT NOT NULL CHECK (state IN ('RUNNING','IDLE','DOWN')),
  reason       TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  telemetry_id BIGINT REFERENCES telemetry(id)
);
CREATE INDEX IF NOT EXISTS idx_status_history_machine_time
  ON status_history (machine_id, started_at);
