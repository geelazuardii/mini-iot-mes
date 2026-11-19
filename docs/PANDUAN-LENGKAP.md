# Panduan Lengkap (untuk pemula, urut dari nol)

Urutan kerja yang disarankan kalau waktunya mepet: **B → C → D → E (cukup pakai simulator) → F (Wokwi) → G (GitHub) → dokumen**. Wokwi dikerjakan setelah backend jalan, karena Wokwi butuh server yang sudah hidup.

## A. Tools yang dipakai

| Tool | Untuk apa | Catatan |
|---|---|---|
| **Visual Studio Code** | Editor kode + terminal | Gratis, paling mudah. https://code.visualstudio.com |
| **Node.js LTS (v18 ke atas)** | Menjalankan backend | https://nodejs.org → cek `node -v` |
| **Git** | Upload ke GitHub | https://git-scm.com |
| **Supabase** | Database PostgreSQL online | Tidak perlu install apa-apa. Paling cepat. |
| **Cloudflare Tunnel (cloudflared)** | Membuka server lokal ke internet supaya Wokwi bisa akses | Tanpa akun, satu perintah |

**Kenapa Supabase?** MySQL/Postgres lokal butuh install dan setting user. Supabase itu PostgreSQL yang sudah jadi, cukup daftar lalu salin satu alamat koneksi. Kode di repo ini memakai PostgreSQL biasa (`pg`), jadi Supabase atau Postgres lokal sama-sama jalan.

## B. Database (Supabase)

1. Daftar di https://supabase.com (bisa login GitHub) → **New project**. Isi nama, buat **Database Password** (catat!), pilih region terdekat (Singapore). Tunggu ±2 menit.
2. Klik tombol **Connect** di bagian atas project → pilih **Session pooler** → salin connection string-nya. Bentuknya:
   `postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
3. Ganti `[YOUR-PASSWORD]` dengan password tadi. Kalau password mengandung karakter khusus (`@`, `#`, `/`), ubah dulu jadi bentuk URL-encode atau buat password baru yang hanya huruf dan angka.

Kenapa *Session pooler*? Koneksi "direct" Supabase memakai IPv6 dan sering gagal dari jaringan rumah/kantor di Indonesia. Pooler pakai IPv4.

**Alternatif Postgres lokal:** install PostgreSQL, buat database, lalu `DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/NAMA_DB` dan `DB_SSL=false`.

## C. Menjalankan backend

Buka folder repo di VS Code (File → Open Folder), lalu buka terminal (Ctrl + `).

```bash
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

Edit `.env`:

```
DATABASE_URL=<connection string Supabase tadi>
DB_SSL=true
DEVICE_KEY_MC_01=demo-key-mc-01     # boleh diganti, harus sama dengan di sketch.ino
```

Buat tabel dan isi data:

```bash
npm run db:setup
```

Kalau berhasil muncul tabel berisi MC-01, MC-02, MC-03. Kalau gagal: `ENOTFOUND` / timeout → cek lagi memakai Session pooler; `password authentication failed` → password salah.

Jalankan server:

```bash
npm start
```

Buka http://localhost:3000 (dashboard, masih kosong/abu-abu) dan http://localhost:3000/api/machines.

## D. Uji tanpa ESP32 (simulator)

Terminal kedua (tombol `+` di panel terminal):

```bash
npm run sim
```

Dashboard akan berubah: MC-01 hijau, MC-02 kadang merah/abu-abu, MC-03 naik suhunya lalu merah OVERHEAT. Untuk uji manual 401/400, pakai perintah `curl` di README.

## E. Query laporan menit per status

Di Supabase: **SQL Editor** → New query → tempel isi `db/queries.sql` bagian **QUERY A** → Run. Hasil harus: DOWN 45, IDLE 45, RUNNING 150.

## F. Menghubungkan Wokwi (ESP32) ke server lokal

Wokwi tidak bisa membuka `localhost`, jadi server dibuka lewat tunnel. Cara termudah: **Cloudflare quick tunnel** (tanpa akun).

1. Install cloudflared:
   - Windows (PowerShell): `winget install --id Cloudflare.cloudflared` (lalu tutup dan buka lagi terminalnya)
   - macOS: `brew install cloudflared`
2. Pastikan `npm start` masih jalan, lalu di terminal lain:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Cari baris berisi alamat seperti `https://random-words-1234.trycloudflare.com`. Itu alamat server kamu di internet.
4. Tes dari browser: `https://random-words-1234.trycloudflare.com/api/machines` harus keluar JSON.
5. Buka Wokwi (https://wokwi.com) → New Project → ESP32. Salin isi:
   - `firmware/esp32/sketch.ino` → tab `sketch.ino`
   - `firmware/esp32/diagram.json` → tab `diagram.json`
   - `firmware/esp32/libraries.txt` → tab `libraries.txt` (kalau tidak ada, klik panah di samping tab → New file)
6. Di `sketch.ino` ubah:
   ```cpp
   const char* SERVER_URL = "https://random-words-1234.trycloudflare.com/api/ingest";
   const char* DEVICE_KEY = "demo-key-mc-01";   // sama dengan .env
   ```
7. Tekan Play. Serial Monitor akan menampilkan `[HTTP] kode 201`. Dashboard MC-01 mulai hidup. Tekan tombol COUNT/REJECT/FAULT di simulator untuk uji.
8. Simpan project (Save), lalu **Share** → salin link, taruh di README bagian "Link Wokwi". Pastikan bisa dibuka tanpa login.

Hal yang perlu diketahui:
- Alamat tunnel **berubah tiap cloudflared dijalankan ulang**. Ubah lagi `SERVER_URL` kalau begitu.
- Penilai yang membuka link Wokwi kamu tidak bisa memakai tunnel-mu setelah kamu menutup laptop. Itu wajar; sebutkan di README bahwa backend bisa diuji dengan `npm run sim`.
- Kalau `[HTTP] kode -1`: URL salah atau tunnel mati. Kode `401`: key tidak sama. Kode `400`: lihat balasan di terminal server.
- Alternatif tunnel: ngrok (`ngrok http 3000`, perlu daftar dan authtoken). Pakai `SERVER_URL` yang sama bentuknya.

## G. Upload ke GitHub

1. Buat repo kosong di https://github.com/new (jangan centang README/gitignore). Nama misalnya `mini-iot-mes`.
2. Di terminal folder proyek:
   ```bash
   git init
   git add .
   git status        # pastikan .env TIDAK ada di daftar (hanya .env.example)
   git commit -m "Mini IoT + MES: firmware, backend, dashboard, dokumentasi"
   git branch -M main
   git remote add origin https://github.com/USERNAME/mini-iot-mes.git
   git push -u origin main
   ```
3. Kalau diminta login, pakai akun GitHub (atau Personal Access Token sebagai password).
4. Buka link repo di jendela incognito untuk memastikan bisa diakses, lalu kirim link itu.

## H. Daftar cek sebelum kumpul

- [ ] `.env` tidak ikut ter-push; `.env.example` ada
- [ ] Link Wokwi sudah diisi di README dan bisa dibuka tanpa login
- [ ] Jam mulai dan selesai di README sudah diisi
- [ ] Bagian "Penggunaan AI" di README sudah disesuaikan dengan yang benar-benar terjadi
- [ ] `npm run db:setup`, `npm start`, `npm run sim` sudah dicoba dari awal
- [ ] Wokwi: COUNT, REJECT, FAULT, suhu ≥ 70, dan sensor gagal sudah dicoba
