// Simulator 3 mesin tanpa ESP32.  Jalankan: npm run sim
// Opsi: node tools/sim-device.js [base_url]
//  MC-01: lancar, sesekali IDLE
//  MC-02: sering IDLE, kadang FAULT_BUTTON, kadang "putus" (jadi OFFLINE di dashboard)
//  MC-03: suhu naik pelan -> OVERHEAT -> turun < 65 -> normal lagi
require('dotenv').config();
const crypto = require('crypto');

const BASE = process.argv[2] || process.env.SIM_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_SEC || 5) * 1000;
const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

const machines = [
  { id: 'MC-01', key: process.env.DEVICE_KEY_MC_01, profile: 'normal' },
  { id: 'MC-02', key: process.env.DEVICE_KEY_MC_02, profile: 'faulty' },
  { id: 'MC-03', key: process.env.DEVICE_KEY_MC_03, profile: 'overheat' },
].map((m) => ({
  ...m,
  bootId: crypto.randomBytes(4).toString('hex'), // 8 karakter hex
  seq: 0,
  temp: m.profile === 'overheat' ? 50 : rand(42, 50),
  fault: false,
  overheat: false,
  silent: 0,
}));

function step(m) {
  let state = 'IDLE';
  let reason = null;
  let output = 0;

  if (m.profile === 'normal') {
    m.temp = rand(44, 52);
    if (chance(0.85)) { state = 'RUNNING'; output = Math.floor(rand(2, 9)); }
  }

  if (m.profile === 'faulty') {
    m.temp = rand(46, 56);
    if (m.fault) { if (chance(0.3)) m.fault = false; }
    else if (chance(0.08)) m.fault = true;
    if (m.fault) { state = 'DOWN'; reason = 'FAULT_BUTTON'; }
    else if (chance(0.5)) { state = 'RUNNING'; output = Math.floor(rand(1, 6)); }
  }

  if (m.profile === 'overheat') {
    m.temp += m.overheat ? -3 : 3;
    if (!m.overheat && m.temp >= 70) m.overheat = true;
    if (m.overheat && m.temp < 65) m.overheat = false;
    if (m.overheat) { state = 'DOWN'; reason = 'OVERHEAT'; }
    else { state = 'RUNNING'; output = Math.floor(rand(3, 10)); }
  }

  const reject = output > 0 && chance(0.15) ? 1 : 0;
  return {
    machine_id: m.id,
    boot_id: m.bootId,
    seq: m.seq + 1,
    state,
    reason,
    output_delta: output,
    reject_delta: reject,
    temperature_c: Math.round(m.temp * 10) / 10,
  };
}

async function post(m, payload) {
  const res = await fetch(`${BASE}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Key': m.key || '' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function tick(m) {
  if (m.silent > 0) {
    m.silent--;
    console.log(`${m.id}  (diam, simulasi putus -> ${m.silent} tick lagi)`);
    return;
  }
  if (m.profile === 'faulty' && chance(0.05)) { m.silent = 8; return; }

  const payload = step(m);
  try {
    const r = await post(m, payload);
    console.log(`${m.id} seq=${payload.seq} ${payload.state}${payload.reason ? '/' + payload.reason : ''} ` +
      `out+${payload.output_delta} rej+${payload.reject_delta} ${payload.temperature_c}C -> HTTP ${r.status}`);
    if (r.status >= 200 && r.status < 300) {
      m.seq = payload.seq;
      // kadang kirim ulang pesan yang sama: server harus menyimpan sekali saja
      if (chance(0.1)) {
        const dup = await post(m, payload);
        console.log(`${m.id} seq=${payload.seq} (kirim ulang) -> HTTP ${dup.status} ${dup.text}`);
      }
    } else {
      console.log('   ', r.text);
    }
  } catch (e) {
    console.log(`${m.id} gagal kirim: ${e.message}`);
  }
}

console.log(`Simulator -> ${BASE}, tiap ${INTERVAL_MS / 1000} detik. Ctrl+C untuk berhenti.`);
machines.forEach((m) => { if (!m.key) console.warn(`PERINGATAN: key ${m.id} kosong, cek .env`); });
const run = () => machines.forEach(tick);
run();
setInterval(run, INTERVAL_MS);
