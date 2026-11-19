const STATES = ['RUNNING', 'IDLE', 'DOWN'];
const REASONS = ['FAULT_BUTTON', 'OVERHEAT'];

const isInt = (n, min = 0, max = 1000000) =>
  Number.isInteger(n) && n >= min && n <= max;

// Kembalikan array pesan error. Kosong = valid.
function validatePayload(b) {
  const errors = [];

  if (typeof b.boot_id !== 'string' || !/^[A-Za-z0-9]{8}$/.test(b.boot_id)) {
    errors.push('boot_id harus 8 karakter huruf/angka');
  }
  if (!isInt(b.seq, 1, 2147483647)) {
    errors.push('seq harus bilangan bulat >= 1');
  }
  if (!STATES.includes(b.state)) {
    errors.push('state harus RUNNING, IDLE, atau DOWN');
  }

  if (b.state === 'DOWN') {
    if (!REASONS.includes(b.reason)) {
      errors.push('reason wajib FAULT_BUTTON atau OVERHEAT saat DOWN');
    }
  } else if (b.reason !== null && b.reason !== undefined) {
    errors.push('reason harus null kalau state bukan DOWN');
  }

  if (!isInt(b.output_delta)) errors.push('output_delta harus bilangan bulat >= 0');
  if (!isInt(b.reject_delta)) errors.push('reject_delta harus bilangan bulat >= 0');

  const t = b.temperature_c;
  if (t === undefined) {
    errors.push('temperature_c wajib ada (angka atau null)');
  } else if (t !== null && !(typeof t === 'number' && Number.isFinite(t) && t >= -50 && t <= 200)) {
    errors.push('temperature_c harus angka -50..200 atau null');
  }

  return errors;
}

module.exports = { validatePayload };
