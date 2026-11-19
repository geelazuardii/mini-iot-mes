# Mini IoT + MES

ESP32 (Wokwi) mengirim data mesin ke server Node.js + PostgreSQL. Dashboard web menampilkan status tiap mesin di TV produksi.

```
ESP32 / sim-device.js --HTTP POST--> Express (/api/ingest) --> PostgreSQL
                                              ^
Dashboard (index.html) --GET /api/machines----+
```

- **Link Wokwi:** https://wokwi.com/projects/481108382822198273
- **Panduan langkah demi langkah (pemula):** [docs/PANDUAN-LENGKAP.md](docs/PANDUAN-LENGKAP.md)
- **Wiring & pinout:** [docs/WIRING.md](docs/WIRING.md)
- **Analisa kebutuhan:** [SPEC.md](SPEC.md)

## Struktur

```
firmware/esp32/   sketch.ino, diagram.json, libraries.txt (salin ke Wokwi)
src/              server.js, db.js, validate.js
db/               schema.sql, seed.sql, queries.sql
tools/            sim-device.js (data palsu 3 mesin)
scripts/          setup-db.js (buat tabel + isi data + pasang key dari .env)
dashboard/        index.html
docs/             panduan & wiring
```

## Cara menjalankan (5 langkah)

Butuh Node.js 18+ dan satu database PostgreSQL (Supabase gratis paling cepat, lihat panduan).

1. `npm install`, lalu salin `.env.example` menjadi `.env`.
2. Isi `DATABASE_URL` di `.env` (Supabase: pakai connection string *Session pooler*, set `DB_SSL=true`).
3. `npm run db:setup` — membuat 3 tabel, mengisi MC-01 s.d. MC-03, memasang device key dari `.env`.
4. `npm start`, buka http://localhost:3000 untuk dashboard.
5. Di terminal lain: `npm run sim` untuk data palsu 3 mesin. (ESP32 di Wokwi: lihat panduan, butuh tunnel.)

Cek cepat API:

```bash
curl http://localhost:3000/api/machines
curl -X POST http://localhost:3000/api/ingest -H "Content-Type: application/json" \
  -H "X-Device-Key: demo-key-mc-01" \
  -d '{"machine_id":"MC-01","boot_id":"9f3a61c2","seq":1,"state":"RUNNING","reason":null,"output_delta":7,"reject_delta":1,"temperature_c":48.6}'
```

Hasil: key salah → 401, data tidak valid → 400, kirim ulang pesan yang sama → 200 `duplicate:true` (tidak disimpan lagi), pesan baru → 201.

Query laporan menit per status ada di `db/queries.sql` (hasil MC-01 pada data contoh: RUNNING 150, IDLE 45, DOWN 45 menit).

## Keputusan desain

- **Tombol pakai interrupt + debounce 50 ms.** Pengiriman HTTP bisa menahan loop sampai beberapa detik; dengan interrupt, tekanan tombol tetap tercatat. Debounce dihitung dari edge terakhir (turun maupun naik), jadi pantulan saat tombol dilepas tidak terhitung.
- **Tanpa `delay()`.** Semua jadwal pakai `millis()`. Buzzer putus-putus dihitung dari waktu, bukan ditidurkan.
- **Seq dan kirim ulang.** Pesan dibentuk satu kali (JSON disimpan utuh). Kalau gagal, pesan yang persis sama dikirim lagi dengan `seq` yang sama tiap 5 detik. `seq` naik hanya setelah server menjawab 2xx. Hitungan baru selama menunggu ditampung dan masuk ke pesan berikutnya, jadi tidak hilang dan tidak dobel.
- **Anti-duplikat di database**, bukan di kode: `UNIQUE (machine_id, boot_id, seq)` + `ON CONFLICT DO NOTHING`. Aman walau dua request datang bersamaan.
- **Sensor gagal.** `temperature_c = null`, tidak dianggap overheat. Kalau sedang OVERHEAT lalu sensor gagal, status DOWN dipertahankan (lebih aman daripada tiba-tiba hijau).
- **Output = jumlah tekan COUNT** (termasuk yang nanti ditandai reject). Reject dihitung terpisah.
- **Waktu data = waktu server menerima.** ESP32 tidak punya jam sungguhan, jadi tidak ada timestamp dari alat. Online/offline dan "hari ini" (zona Asia/Jakarta) dihitung dari waktu ini.
- **Riwayat status** dicatat saat `state` atau `reason` berubah (mis. FAULT_BUTTON → OVERHEAT juga tercatat).
- **Device key per mesin** disimpan di tabel `machines`, nilainya diatur lewat `.env` dan dipasang oleh `npm run db:setup`. `.env` tidak ikut git.
- **Dashboard** disajikan oleh Express yang sama, jadi `fetch('/api/machines')` tanpa CORS. Mesin DOWN memakai 2 kolom, huruf lebih besar, merah berkedip, plus bar peringatan di atas.

## Belum selesai / keterbatasan

- Kalau WiFi putus lama, perubahan status di tengah-tengah tidak tersimpan (hanya hitungan dan status terakhir yang ikut terkirim). Perlu antrian pesan di flash/RAM.
- Pesan yang tertahan hilang kalau ESP32 restart sebelum terkirim.
- Device key disimpan polos di database, belum di-hash. Belum ada rate limit.
- Dashboard belum punya riwayat/grafik downtime; endpoint laporan baru berupa query SQL.
- Tombol dan buzzer baru diuji di simulator Wokwi, belum di perangkat asli.
- Tunnel Cloudflare gratis berganti alamat tiap dijalankan; untuk dipakai terus perlu hosting tetap.
- Tidak ada unit test otomatis; pengujian lewat `sim-device.js` dan curl.

## Jam pengerjaan

- Mulai: `ISI` (tanggal 19 Nov 2026)
- Selesai: `ISI`

## 3 kasus lapangan

**1. Hitungan dobel saat motor konveyor baru menyala (proximity 24 V + optocoupler).**
Penyebab paling mungkin: lonjakan arus saat motor start menimbulkan noise di kabel sensor, atau output optocoupler bergetar sesaat sehingga satu produk terbaca dua kali. Cek dengan mencatat selisih waktu antar hitungan: kalau banyak yang di bawah 20–30 ms dan hanya muncul saat motor start, itu noise, bukan produk asli (osiloskop atau logic analyzer di pin ESP32 memastikannya). Solusinya: kabel sensor dipisah dan disarung (shielded) dari kabel motor, tambah RC filter atau Schmitt trigger di sisi ESP32, dan pasang debounce/jeda minimal antar hitungan sesuai interval produk tercepat.

**2. ESP32 restart tiap relay lampu menyala atau mati.**
Penyebab: coil relay atau beban lampu menimbulkan lonjakan tegangan dan menurunkan suplai ESP32 sesaat (brownout), atau noise masuk lewat jalur daya/ground. Cek alasan reset lewat `esp_reset_reason()` di serial (kalau `ESP_RST_BROWNOUT`, berarti suplai) dan ukur tegangan 5 V/3,3 V saat relay berpindah. Solusinya: dioda flyback di coil relay (atau modul relay beropto), snubber RC di beban AC, suplai ESP32 dipisah dari suplai relay dengan ground yang rapi, dan kapasitor 470–1000 µF dekat pin daya ESP32.

**3. Total output dashboard 8% lebih kecil dari catatan operator, hanya di jam tertentu.**
Karena selisihnya cuma di jam tertentu, curigai hal yang berubah di jam itu: WiFi putus saat ramai (data hilang), atau produk lewat lebih cepat dari jeda debounce sehingga ada yang tidak terbaca. Cek: bandingkan output per jam dashboard vs catatan, lihat apakah `seq` loncat atau jarak antar pesan membesar di jam itu (tanda WiFi putus/ESP restart), dan cek interval hitungan tercepat di jam tersebut. Solusinya: pastikan kirim ulang dengan `seq` sama berjalan dan pesan tidak hilang saat restart (simpan antrian), kecilkan debounce sesuai kecepatan produk, dan tampilkan counter kumulatif sebagai pembanding.

## Penggunaan AI

| Bagian | Bantuan AI | Yang saya kerjakan/cek sendiri |

| Logika firmware (interrupt debounce, seq + kirim ulang, hysteresis overheat) | Draft awal kode dan penjelasannya | 
| Skema DB + anti-duplikat + query menit per status | Draft awal | 
| Backend Express, simulator | Draft awal | 


