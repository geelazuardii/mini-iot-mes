# Wiring & Pinout (Wokwi)

Cara tercepat: salin `firmware/esp32/diagram.json` ke tab **diagram.json** di Wokwi, semua komponen dan kabel langsung terpasang. Panduan manual di bawah dipakai kalau mau merakit sendiri atau kalau ada kabel yang tidak tersambung.

## Komponen

| Jumlah | Komponen | Nama di Wokwi |
|---|---|---|
| 1 | ESP32 | ESP32 DevKit C V4 |
| 3 | Tombol | Pushbutton (hijau COUNT, biru REJECT, merah FAULT) |
| 1 | Sensor suhu | DHT22 |
| 3 | LED | LED hijau, kuning, merah |
| 3 | Resistor 220 Ω | Resistor |
| 1 | Buzzer | Buzzer |

## Tabel pin

| GPIO | Fungsi | Tersambung ke |
|---|---|---|
| 19 | Tombol COUNT | Kaki 1 tombol; kaki 2 ke GND (pakai INPUT_PULLUP, tidak perlu resistor) |
| 21 | Tombol REJECT | Sama |
| 22 | Tombol FAULT | Sama |
| 4 | DHT22 SDA (data) | Pin SDA sensor |
| 3V3 | DHT22 VCC | Pin VCC sensor |
| 25 | LED hijau | Resistor 220 Ω → anoda LED (kaki panjang) |
| 26 | LED kuning | Resistor 220 Ω → anoda LED |
| 27 | LED merah | Resistor 220 Ω → anoda LED |
| 13 | Buzzer + | Pin 2 buzzer |
| GND | Semua GND | Kaki 2 tombol, GND DHT22, katoda LED, pin 1 buzzer |

## Diagram pinout

```
                     ┌──────────────┐
   DHT22 VCC ───────►│ 3V3      GND │◄────── semua GND
                     │              │
 LED hijau  (220Ω) ◄─│ 25        22 │◄────── tombol FAULT  ── GND
 LED kuning (220Ω) ◄─│ 26        21 │◄────── tombol REJECT ── GND
 LED merah  (220Ω) ◄─│ 27        19 │◄────── tombol COUNT  ── GND
 Buzzer +          ◄─│ 13         4 │◄────── DHT22 SDA
                     │              │
                     │  ESP32       │
                     └──────────────┘
```

Rangkaian satu LED (ulangi 3x untuk hijau/kuning/merah):

```
GPIO ──[220Ω]──►|── GND
              LED (A→C)
```

Rangkaian satu tombol (ulangi 3x):

```
GPIO ──┐
       ├── tombol ──── GND      (ditekan = LOW)
```

## Urutan merakit manual di Wokwi

1. Buka https://wokwi.com → New Project → **ESP32** (pilih template Arduino).
2. Klik **+** (Add part), tambahkan: `DHT22`, `Pushbutton` x3, `LED` x3, `Resistor` x3, `Buzzer`.
3. DHT22: VCC → 3V3, SDA → GPIO 4, GND → GND. (Pin NC dibiarkan.)
4. Tombol COUNT: satu sisi → GPIO 19, sisi lain → GND. Ulangi untuk REJECT (GPIO 21) dan FAULT (GPIO 22).
5. LED hijau: GPIO 25 → resistor 220 Ω → anoda (A). Katoda (C) → GND. Ulangi kuning (GPIO 26) dan merah (GPIO 27).
6. Buzzer: pin 2 → GPIO 13, pin 1 → GND.
7. Tab **libraries.txt**: isi `DHT sensor library` dan `Adafruit Unified Sensor`.
8. Tempel `sketch.ino`, ubah `SERVER_URL`, tekan Play.

## Cara menguji di Wokwi

- Klik tombol COUNT → LED hijau (RUNNING), diam 15 detik → kuning (IDLE).
- Klik FAULT sekali → merah + buzzer putus-putus; klik lagi → selesai.
- Klik DHT22, geser suhu ke 70 °C atau lebih → DOWN (OVERHEAT). Turunkan di bawah 65 °C → selesai. Di antara 65–70 status tetap.
- Uji sensor gagal: lepas kabel SDA → Serial Monitor menulis "sensor gagal baca", payload `temperature_c: null`, tidak overheat.
