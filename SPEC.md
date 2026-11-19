# SPEC: Monitoring Mesin Produksi

Masalah dari Kepala Produksi: mesin sering berhenti dan baru ketahuan saat istirahat, reject sering tidak tercatat, pernah ada motor terbakar, ada 12 mesin, WiFi sering putus, operator awam komputer.

## Kebutuhan sistem

1. Status tiap mesin (jalan, diam, mati, tidak terhubung) tampil real-time di TV dan bisa dibuka dari kantor lewat browser.
2. Mesin mati langsung menyala merah di dashboard dan membunyikan buzzer di mesin, supaya tidak menunggu jam istirahat.
3. Setiap henti tercatat: mulai, selesai, durasi, dan alasan (tombol rusak atau overheat), supaya bisa dilihat berapa lama mesin mati.
4. Suhu motor dipantau. Di atas batas, mesin ditandai DOWN dan alarm menyala sebelum motor rusak.
5. Reject dicatat dengan satu tombol besar di mesin, tanpa komputer.
6. Data tetap benar saat WiFi putus: alat mengirim ulang, tidak ada hitungan hilang atau dobel.
7. Tiap alat punya key sendiri; data dari alat tak dikenal ditolak.
8. Dipasang untuk 12 mesin dengan alat dan tampilan yang sama (tambah mesin cukup tambah satu baris data).

## Pertanyaan untuk Kepala Produksi

1. Mesin disebut "mati" itu kondisi apa: motor berhenti, tidak ada produk keluar, atau operator yang menghentikan? Apakah berhenti saat ganti bahan atau setting dihitung downtime?
2. Berapa lama berhenti baru dianggap masalah, dan siapa yang harus diberi tahu (lewat WhatsApp, telepon, lampu menara)?
3. Berapa shift, jam istirahatnya kapan, dan apakah mesin sengaja dimatikan saat istirahat?
4. Reject itu perlu dicatat alasannya (cacat apa) atau cukup jumlahnya? Dan jumlah "benar" itu dilihat dari hitungan sensor atau dari catatan operator?
5. Di mana titik WiFi yang sering putus? Apakah bisa tarik kabel LAN atau tambah access point, dan ada internet atau server di pabrik?
6. Motor mana yang pernah terbakar, dan berapa suhu aman untuk tiap jenis motor? Bisakah sensor suhu ditempel di bodi motor?
7. Di tiap mesin ada sumber listrik 5/12/24 V untuk alat ini, dan boleh tidak melubangi panel atau menempel box?

## Risiko pemasangan dan penanganannya

| Risiko | Penanganan |
|---|---|
| WiFi putus di area produksi | Alat menyimpan hitungan dan mengirim ulang dengan nomor pesan sama; server menolak duplikat. Cek sinyal tiap mesin sebelum pasang, tambah access point atau kabel bila lemah. |
| Noise listrik dari motor dan relay bikin hitungan dobel atau alat restart | Kabel sensor disarung dan dipisah dari kabel daya, opto-isolator, dioda/snubber di relay, suplai ESP32 terpisah dan stabil. |
| Sensor suhu DHT22 tidak cocok untuk motor (batas sekitar 80 °C, tidak tahan getar) | Untuk pemasangan nyata pakai probe suhu tahan panas (mis. DS18B20 atau thermocouple) yang ditempel di bodi motor. |
| Debu, oli, getaran merusak alat | Box tertutup (IP54 ke atas), dudukan peredam getar, kabel diberi pelindung. |
| Operator salah tekan atau lupa | Tombol besar berwarna dengan label jelas, LED dan buzzer sebagai umpan balik. Hanya 3 tombol. |
| Pemasangan listrik berbahaya | Dikerjakan teknisi/listrik pabrik, ada sekering, tidak memotong jalur safety (E-stop) mesin. |
| Key atau data disalahgunakan | Key unik per mesin, disimpan di .env/server, tidak ditulis di dashboard. |
| Alat mati atau dicopot tapi tidak ketahuan | Tidak ada data lebih dari 30 detik ditampilkan sebagai OFFLINE (abu-abu), bukan status terakhir. |
