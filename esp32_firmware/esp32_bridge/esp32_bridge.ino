/**
 * Smart Recycling: Reward-Based Reverse Vending Machine (RVM)
 * ESP32 DevKit V1 Bridge Firmware - v1.0
 * 
 * Hardware Connections:
 * - ESP32 RX2 (GPIO16) <- Resistor Divider (1k / 2k) <- Arduino Mega TX1 (Pin 18)
 * - ESP32 TX2 (GPIO17) -> Arduino Mega RX1 (Pin 19) directly
 * - ESP32 GND <-> Arduino Mega GND (Common Ground)
 * - ESP32 USB -> PC for Debug logs (115200 baud)
 * 
 * Dependencies (install via Arduino IDE Library Manager):
 * - Firebase-ESP-Client (by Mobizt)
 * - ArduinoJson (by Benoit Blanchon)
 */

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <ArduinoJson.h>
#include "config.h"

// --- UART2 PIN DEFINITIONS ---
#define RXD2 16
#define TXD2 17

// --- OFFLINE BUFFER SETTINGS ---
struct RvmEvent {
  String type;
  int acceptedCount;
  int rejectedCount;
  int penCount;
  bool binFull;
  unsigned long timestamp; // epoch time or local uptime millis
};

const int BUFFER_MAX = 50;
RvmEvent offlineBuffer[BUFFER_MAX];
int bufferHead = 0;
int bufferTail = 0;
int bufferCount = 0;

// --- FIREBASE OBJECTS ---
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// --- STATE MANAGEMENT ---
bool wifiConnected = false;
bool firebaseReady = false;
unsigned long lastStatusUpdate = 0;
const unsigned long UPDATE_INTERVAL = 30000; // 30s status push
String serialBuffer = "";

// --- UTILITY: BUFFER EVENTS ---
void pushToBuffer(String type, int acc, int rej, int pens, bool full) {
  if (bufferCount >= BUFFER_MAX) {
    Serial.println("[Offline Caching] Buffer Overflow! Overwriting oldest event.");
    // Dequeue oldest
    bufferTail = (bufferTail + 1) % BUFFER_MAX;
    bufferCount--;
  }
  
  offlineBuffer[bufferHead].type = type;
  offlineBuffer[bufferHead].acceptedCount = acc;
  offlineBuffer[bufferHead].rejectedCount = rej;
  offlineBuffer[bufferHead].penCount = pens;
  offlineBuffer[bufferHead].binFull = full;
  offlineBuffer[bufferHead].timestamp = millis(); // store relative offset
  
  bufferHead = (bufferHead + 1) % BUFFER_MAX;
  bufferCount++;
  
  Serial.printf("[Offline Caching] Event buffered. Queue size: %d/%d\n", bufferCount, BUFFER_MAX);
}

// --- FIREBASE: PUSH STATUS ---
bool updateMachineStatus(int accepted, int rejected, int pens, bool binFull, const char* statusStr) {
  if (!firebaseReady) return false;
  
  FirebaseJson content;
  // Construct Firestore format fields
  content.set("fields/status/stringValue", statusStr);
  content.set("fields/binFull/booleanValue", binFull);
  content.set("fields/acceptedCount/integerValue", String(accepted));
  content.set("fields/rejectedCount/integerValue", String(rejected));
  content.set("fields/penDispensedCount/integerValue", String(pens));
  content.set("fields/firmwareVersion/stringValue", FIRMWARE_VER);
  content.set("fields/esp32Version/stringValue", ESP32_VER);
  
  // Set ISO-8601 server timestamp placeholder using Firestore special values
  content.set("fields/lastSeenAt/valueType", "timestampValue");
  content.set("fields/lastSeenAt/timestampValue", "REQUEST_TIME"); 
  
  String docPath = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/machines/" + String(MACHINE_ID);
  
  Serial.print("[Firebase] Updating machine telemetry... ");
  if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", docPath.c_str(), content.raw(), "status,binFull,acceptedCount,rejectedCount,penDispensedCount,firmwareVersion,esp32Version,lastSeenAt")) {
    Serial.println("Success!");
    return true;
  } else {
    Serial.printf("Failed: %s\n", fbdo.errorReason().c_str());
    return false;
  }
}

// --- FIREBASE: PUSH EVENT ---
bool pushFirestoreEvent(String type, int accepted, int rejected, int pens, bool binFull, unsigned long relativeTimeOffset) {
  if (!firebaseReady) return false;
  
  FirebaseJson content;
  content.set("fields/machineId/stringValue", MACHINE_ID);
  content.set("fields/type/stringValue", type);
  content.set("fields/acceptedCount/integerValue", String(accepted));
  content.set("fields/rejectedCount/integerValue", String(rejected));
  content.set("fields/penDispensedCount/integerValue", String(pens));
  content.set("fields/binFull/booleanValue", binFull);
  content.set("fields/rawPayload/stringValue", "Serial UART Direct Event Link");
  
  // Add server timestamp
  content.set("fields/timestamp/valueType", "timestampValue");
  content.set("fields/timestamp/timestampValue", "REQUEST_TIME");
  
  String collPath = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/events";
  
  Serial.print("[Firebase] Logging event to Firestore... ");
  if (Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "", collPath.c_str(), content.raw())) {
    Serial.println("Success!");
    return true;
  } else {
    Serial.printf("Failed: %s\n", fbdo.errorReason().c_str());
    return false;
  }
}

// --- FIREBASE: TRIGGER ALERT ---
bool triggerAlert(String type, String severity, String status) {
  if (!firebaseReady) return false;
  
  FirebaseJson content;
  content.set("fields/machineId/stringValue", MACHINE_ID);
  content.set("fields/type/stringValue", type);
  content.set("fields/severity/stringValue", severity);
  content.set("fields/status/stringValue", status);
  
  content.set("fields/createdAt/valueType", "timestampValue");
  content.set("fields/createdAt/timestampValue", "REQUEST_TIME");
  
  String collPath = "projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/alerts";
  
  Serial.print("[Firebase] Triggering critical alarm... ");
  if (Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "", collPath.c_str(), content.raw())) {
    Serial.println("Alarm logged!");
    return true;
  } else {
    Serial.printf("Failed alert: %s\n", fbdo.errorReason().c_str());
    return false;
  }
}

// --- FLUSH OFFLINE CACHE BUFFER ---
void flushOfflineBuffer() {
  if (bufferCount == 0 || !firebaseReady) return;
  
  Serial.printf("[Offline Recovery] Flashing %d buffered events...\n", bufferCount);
  
  while (bufferCount > 0) {
    RvmEvent ev = offlineBuffer[bufferTail];
    
    // Log the buffered event
    bool ok = pushFirestoreEvent(ev.type, ev.acceptedCount, ev.rejectedCount, ev.penCount, ev.binFull, ev.timestamp);
    if (ok) {
      bufferTail = (bufferTail + 1) % BUFFER_MAX;
      bufferCount--;
      delay(200); // Small interval limit
    } else {
      Serial.println("[Offline Recovery] Connection failed during flush. Aborting and preserving buffer.");
      break;
    }
  }
  Serial.printf("[Offline Recovery] Remaining in buffer: %d\n", bufferCount);
}

// --- INITIALIZE WIFI ---
void initWiFi() {
  Serial.println("[WiFi] Starting WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int counter = 0;
  while (WiFi.status() != WL_CONNECTED && counter < 20) {
    delay(500);
    Serial.print(".");
    counter++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Connection timeout. Operating in Offline Caching Mode.");
  }
}

void setup() {
  // Debug USB Serial
  Serial.begin(115200);
  Serial.println("\n=== SMART RVM IOT BRIDGE BOOTING ===");
  
  // Hardware UART2 (to Mega Serial1)
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  Serial.println("[UART] UART2 (Mega Link) configured at 9600 baud.");
  
  // WiFi
  initWiFi();
  
  // Configure Firebase Client
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  
  // Initialize Firebase library
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  // Check Connection Health
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiConnected) {
      Serial.println("[WiFi] Reconnected!");
      wifiConnected = true;
    }
    
    // Check Firebase authentication state
    if (Firebase.ready() && !firebaseReady) {
      Serial.println("[Firebase] Secure Handshake Completed!");
      firebaseReady = true;
      
      // Send boot status
      updateMachineStatus(0, 0, 0, false, "online");
      
      // Flush cached data collected while offline
      flushOfflineBuffer();
    }
  } else {
    if (wifiConnected) {
      Serial.println("[WiFi] Disconnected! Dropping to Offline Caching Mode.");
      wifiConnected = false;
      firebaseReady = false;
    }
  }
  
  // --- SERIAL INGESTION FROM ARDUINO MEGA ---
  while (Serial2.available() > 0) {
    char inChar = (char)Serial2.read();
    if (inChar == '\n') {
      // Complete message received
      SerialBuffer.trim();
      if (SerialBuffer.length() > 0) {
        Serial.printf("[UART <- Mega] Raw: %s\n", SerialBuffer.c_str());
        
        // Parse message
        StaticJsonDocument<384> doc;
        DeserializationError error = deserializeJson(doc, SerialBuffer);
        
        if (!error) {
          String type    = doc["type"].as<String>();
          int accepted  = doc["acceptedCount"].as<int>();
          int rejected  = doc["rejectedCount"].as<int>();
          int penCount  = doc["penCount"].as<int>();
          bool binFull  = doc["binFull"].as<bool>();
          
          Serial.printf("[Parser] Event: %s | Accepted: %d | Rejected: %d | Pens: %d | Bin Full: %s\n",
                        type.c_str(), accepted, rejected, penCount, binFull ? "YES" : "NO");
          
          if (firebaseReady) {
            // Write event to database
            pushFirestoreEvent(type, accepted, rejected, penCount, binFull, 0);
            updateMachineStatus(accepted, rejected, penCount, binFull, "online");
            
            // Trigger alerts for critical alarms
            if (type == "BIN_FULL") {
              triggerAlert("BIN_FULL", "critical", "open");
            }
          } else {
            // Buffer offline
            pushToBuffer(type, accepted, rejected, penCount, binFull);
          }
        } else {
          Serial.printf("[Parser] JSON parse error: %s\n", error.c_str());
        }
      }
      SerialBuffer = ""; // Reset accumulator
    } else if (inChar != '\r') {
      SerialBuffer += inChar; // Accumulate characters
    }
  }
  
  // Periodically send a keep-alive update to Firebase if online
  if (firebaseReady && (millis() - lastStatusUpdate >= UPDATE_INTERVAL)) {
    updateMachineStatus(0, 0, 0, false, "online"); // updates lastSeenAt Server time
    lastStatusUpdate = millis();
  }
  
  delay(10); // Small thread yielding
}
