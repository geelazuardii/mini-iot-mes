/*
  Mini IoT + MES - ESP32 (Wokwi)
  - Tanpa delay(): semua pakai millis()
  - Tombol dibaca lewat interrupt + debounce 50 ms, jadi tidak ada tekanan yang
    terlewat walau loop sedang menunggu HTTP
  - WiFi sambung ulang otomatis
  - Kirim JSON tiap 10 detik dan langsung saat status berubah
  - Gagal kirim -> kirim ulang pesan yang SAMA (seq sama)
*/
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <DHT.h>

// ===================== KONFIGURASI (ubah di sini) =====================
const char* WIFI_SSID  = "Wokwi-GUEST";
const char* WIFI_PASS  = "";
// Isi dengan URL tunnel (Cloudflare/ngrok) + /api/ingest
const char* SERVER_URL = "https://GANTI-INI.trycloudflare.com/api/ingest";
const char* DEVICE_KEY = "demo-key-mc-01";   // sama dengan DEVICE_KEY_MC_01 di .env
const char* MACHINE_ID = "MC-01";

// ===================== PIN =====================
const int PIN_COUNT  = 19;
const int PIN_REJECT = 21;
const int PIN_FAULT  = 22;
const int PIN_DHT    = 4;
const int PIN_LED_G  = 25;
const int PIN_LED_Y  = 26;
const int PIN_LED_R  = 27;
const int PIN_BUZZER = 13;

// ===================== PARAMETER =====================
const uint32_t DEBOUNCE_MS       = 50;
const uint32_t RUNNING_WINDOW_MS = 15000;  // ada hitungan dalam 15 detik -> RUNNING
const uint32_t TEMP_INTERVAL_MS  = 2000;
const uint32_t SEND_INTERVAL_MS  = 10000;
const uint32_t RETRY_INTERVAL_MS = 5000;   // jeda kirim ulang kalau gagal
const uint32_t WIFI_RETRY_MS     = 10000;
const uint32_t BUZZER_TOGGLE_MS  = 300;
const float    TEMP_DOWN_ON      = 70.0;   // >= 70 -> OVERHEAT
const float    TEMP_DOWN_OFF     = 65.0;   // < 65 baru selesai

DHT dht(PIN_DHT, DHT22);

// ===================== TOMBOL (ISR) =====================
volatile uint32_t isrCount = 0, isrReject = 0;
volatile bool faultActive = false;
volatile uint32_t edgeCount = 0, edgeReject = 0, edgeFault = 0;

// Hitung hanya kalau tombol ditekan (LOW) DAN sudah tenang >= DEBOUNCE_MS sejak
// edge terakhir (naik/turun). Pantulan saat dilepas juga ikut diredam.
void IRAM_ATTR onCount() {
  uint32_t n = millis();
  if (digitalRead(PIN_COUNT) == LOW && (n - edgeCount) >= DEBOUNCE_MS) isrCount++;
  edgeCount = n;
}
void IRAM_ATTR onReject() {
  uint32_t n = millis();
  if (digitalRead(PIN_REJECT) == LOW && (n - edgeReject) >= DEBOUNCE_MS) isrReject++;
  edgeReject = n;
}
void IRAM_ATTR onFault() {
  uint32_t n = millis();
  if (digitalRead(PIN_FAULT) == LOW && (n - edgeFault) >= DEBOUNCE_MS) faultActive = !faultActive;
  edgeFault = n;
}

// ===================== STATE =====================
enum State  { ST_IDLE, ST_RUNNING, ST_DOWN };
enum Reason { RS_NONE, RS_FAULT, RS_OVERHEAT };

State  curState  = ST_IDLE;
Reason curReason = RS_NONE;
bool   stateChanged = false;

uint32_t outputAcc = 0, rejectAcc = 0;   // jumlah sejak pesan sebelumnya
uint32_t lastCountAt = 0;
bool     hasCounted = false;

float tempC = 0;
bool  tempValid = false;
bool  overheat = false;
uint32_t lastTempAt = 0;

// ===================== PENGIRIMAN =====================
char bootId[9];
uint32_t nextSeq = 1;

struct Pending {
  bool active = false;
  char json[256];
} msg;

uint32_t lastBuildAt = 0, lastAttemptAt = 0, lastWifiTry = 0;
bool firstSend = true;

WiFiClientSecure secureClient;
WiFiClient plainClient;

// ===================== HELPER =====================
const char* stateName(State s) {
  return s == ST_RUNNING ? "RUNNING" : (s == ST_DOWN ? "DOWN" : "IDLE");
}
const char* reasonName(Reason r) {
  return r == RS_FAULT ? "FAULT_BUTTON" : (r == RS_OVERHEAT ? "OVERHEAT" : nullptr);
}

void buzzer(bool on) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWriteTone(PIN_BUZZER, on ? 2000 : 0);
#else
  ledcWriteTone(0, on ? 2000 : 0);
#endif
}

// ===================== LOGIKA =====================
void readButtons(uint32_t now) {
  noInterrupts();
  uint32_t c = isrCount, r = isrReject;
  isrCount = 0; isrReject = 0;
  interrupts();

  if (c > 0) { outputAcc += c; lastCountAt = now; hasCounted = true; }
  if (r > 0) { rejectAcc += r; }
}

void readTemperature(uint32_t now, bool force = false) {
  if (!force && (now - lastTempAt) < TEMP_INTERVAL_MS) return;
  lastTempAt = now;

  float t = dht.readTemperature();
  if (isnan(t)) {
    tempValid = false;      // sensor gagal: BUKAN overheat
    Serial.println("[TEMP] sensor gagal baca");
    return;                 // status overheat yang sudah aktif tetap dipertahankan
  }
  tempValid = true;
  tempC = t;
  if (t >= TEMP_DOWN_ON) overheat = true;
  else if (t < TEMP_DOWN_OFF) overheat = false;
}

void updateState(uint32_t now) {
  State s; Reason r = RS_NONE;
  if (faultActive)      { s = ST_DOWN; r = RS_FAULT; }
  else if (overheat)    { s = ST_DOWN; r = RS_OVERHEAT; }
  else if (hasCounted && (now - lastCountAt) < RUNNING_WINDOW_MS) s = ST_RUNNING;
  else                  s = ST_IDLE;

  if (s != curState || r != curReason) {
    curState = s; curReason = r;
    stateChanged = true;
    Serial.printf("[STATE] %s %s\n", stateName(s), reasonName(r) ? reasonName(r) : "");
  }
}

void updateOutputs(uint32_t now) {
  digitalWrite(PIN_LED_G, curState == ST_RUNNING);
  digitalWrite(PIN_LED_Y, curState == ST_IDLE);
  digitalWrite(PIN_LED_R, curState == ST_DOWN);

  static bool lastBuz = false;
  bool want = (curState == ST_DOWN) && (((now / BUZZER_TOGGLE_MS) % 2) == 0);  // putus-putus
  if (want != lastBuz) { buzzer(want); lastBuz = want; }
}

void handleWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) return;
  if ((now - lastWifiTry) < WIFI_RETRY_MS) return;
  lastWifiTry = now;
  Serial.println("[WIFI] mencoba sambung ulang...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

// Bentuk pesan baru. JSON disimpan utuh supaya kirim ulang isinya persis sama.
void buildMessage(uint32_t now) {
  char tempStr[12];
  if (tempValid) snprintf(tempStr, sizeof(tempStr), "%.1f", tempC);
  else           snprintf(tempStr, sizeof(tempStr), "null");

  char reasonStr[24];
  const char* rn = reasonName(curReason);
  if (curState == ST_DOWN && rn) snprintf(reasonStr, sizeof(reasonStr), "\"%s\"", rn);
  else                           snprintf(reasonStr, sizeof(reasonStr), "null");

  snprintf(msg.json, sizeof(msg.json),
    "{\"machine_id\":\"%s\",\"boot_id\":\"%s\",\"seq\":%lu,\"state\":\"%s\","
    "\"reason\":%s,\"output_delta\":%lu,\"reject_delta\":%lu,\"temperature_c\":%s}",
    MACHINE_ID, bootId, (unsigned long)nextSeq, stateName(curState), reasonStr,
    (unsigned long)outputAcc, (unsigned long)rejectAcc, tempStr);

  outputAcc = 0; rejectAcc = 0;   // sudah "diambil" oleh pesan ini
  msg.active = true;
  stateChanged = false;
  firstSend = false;
  lastBuildAt = now;
}

void trySend(uint32_t now) {
  lastAttemptAt = now;
  HTTPClient http;
  bool https = strncmp(SERVER_URL, "https", 5) == 0;
  if (https) { secureClient.setInsecure(); http.begin(secureClient, SERVER_URL); }
  else       { http.begin(plainClient, SERVER_URL); }

  http.setConnectTimeout(3000);
  http.setTimeout(4000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  Serial.printf("[HTTP] POST %s\n", msg.json);
  int code = http.POST((uint8_t*)msg.json, strlen(msg.json));
  http.end();
  Serial.printf("[HTTP] kode %d\n", code);

  if (code >= 200 && code < 300) {
    msg.active = false; nextSeq++;          // sukses -> seq berikutnya
  } else if (code == 400) {
    msg.active = false; nextSeq++;          // data ditolak, kirim ulang percuma
    Serial.println("[HTTP] 400: pesan dibuang");
  }
  // selain itu (gagal koneksi, 401, 5xx): pesan & seq sama dikirim lagi nanti
}

void handleSend(uint32_t now) {
  if (WiFi.status() != WL_CONNECTED) return;

  if (!msg.active) {
    bool due = firstSend || stateChanged || (now - lastBuildAt) >= SEND_INTERVAL_MS;
    if (!due) return;
    buildMessage(now);
  } else if ((now - lastAttemptAt) < RETRY_INTERVAL_MS) {
    return;
  }
  trySend(now);
}

// ===================== SETUP / LOOP =====================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_COUNT,  INPUT_PULLUP);
  pinMode(PIN_REJECT, INPUT_PULLUP);
  pinMode(PIN_FAULT,  INPUT_PULLUP);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_Y, OUTPUT);
  pinMode(PIN_LED_R, OUTPUT);

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_BUZZER, 2000, 8);
#else
  ledcSetup(0, 2000, 8);
  ledcAttachPin(PIN_BUZZER, 0);
#endif
  buzzer(false);

  attachInterrupt(digitalPinToInterrupt(PIN_COUNT),  onCount,  CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_REJECT), onReject, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_FAULT),  onFault,  CHANGE);

  dht.begin();

  snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());
  Serial.printf("boot_id = %s\n", bootId);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lastWifiTry = millis();

  readTemperature(millis(), true);
}

void loop() {
  uint32_t now = millis();
  readButtons(now);
  readTemperature(now);
  updateState(now);
  updateOutputs(now);
  handleWifi(now);
  handleSend(now);
}
