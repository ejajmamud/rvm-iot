/**
 * Smart Recycling: Reward-Based Reverse Vending Machine (RVM)
 * Arduino Mega 2560 Firmware - v3.1-IoT
 * 
 * Hardware Layout:
 * - Capacitive sensor on D5, NPN Active LOW
 * - Inductive sensor on D4, NPN Active LOW
 * - IR Entry sensor on D11, active LOW
 * - HC-SR04 Trigger on D22, Echo on D23
 * - Green LED on D7 (Accept)
 * - Red LED on D6 (Reject / Bin Full)
 * - Passive Buzzer on D8
 * - Gate Servo on D9
 * - Two Pen SG90 Dispenser Servos sharing D10
 * - 16x2 I2C LCD on D20/D21, address 0x27
 * 
 * Serial Layout:
 * - Serial: USB for debugging (115200 baud)
 * - Serial1: TX1 Pin 18 -> Divider -> ESP32 RX2 GPIO16; RX1 Pin 19 <- ESP32 TX2 GPIO17 (9600 baud)
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>

// --- PIN DEFINITIONS ---
const int CAP_SENSOR = 5;
const int IND_SENSOR = 4;
const int GREEN_LED  = 7;
const int RED_LED    = 6;
const int BUZZER     = 8;
const int GATE_SERVO = 9;
const int PEN_SERVO  = 10;
const int IR_SENSOR  = 11;
const int US_TRIG    = 22;
const int US_ECHO    = 23;

// --- CALIBRATED CONSTANTS ---
const int GATE_CLOSED       = 0;
const int GATE_OPEN         = 90;
const int PEN_HOLD          = 90;
const int PEN_DROP          = 0;
const int BIN_FULL_CM       = 8;       // threshold distance in CM
const int CLASSIFY_WINDOW   = 1500;    // 1.5s scanning window
const int SAMPLE_INTERVAL   = 20;      // scan sensors every 20ms
const int HEARTBEAT_MILLIS  = 20000;   // 20s heartbeat

// --- STATE MACHINE ---
enum State { IDLE, DETECTING, ACCEPTED, REJECTED, BIN_FULL };
State currentState = IDLE;

// --- GLOBAL VARIABLES ---
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo gate;
Servo pen;

int acceptedCount      = 0;
int rejectedCount      = 0;
int penDispensedCount  = 0;
bool isBinFull         = false;
unsigned long lastHeartbeat = 0;
String machineId = "RVM001";

// --- HELPER FUNCTIONS ---
int readCap() { return !digitalRead(CAP_SENSOR); } // Invert active-LOW NPN signal
int readInd() { return !digitalRead(IND_SENSOR); } // Invert active-LOW NPN signal
int readIR()  { return !digitalRead(IR_SENSOR);  } // Invert active-LOW trigger

long readUltrasonic() {
  digitalWrite(US_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(US_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(US_TRIG, LOW);
  long duration = pulseIn(US_ECHO, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 999;                 // Out of range / error
  return duration * 0.0343 / 2;                  // Convert to CM
}

// Send JSON Line event over Serial1 for ESP32 bridge
void sendEvent(String eventType) {
  // Construct a lightweight JSON Line message
  String json = "{\"type\":\"" + eventType + "\"";
  json += ",\"machineId\":\"" + machineId + "\"";
  json += ",\"acceptedCount\":" + String(acceptedCount);
  json += ",\"rejectedCount\":" + String(rejectedCount);
  json += ",\"penCount\":" + String(penDispensedCount);
  json += ",\"binFull\":" + String(isBinFull ? "true" : "false");
  json += "}";
  
  Serial1.println(json); // Upload event to ESP32 Serial2
  
  // Debug copy on local USB Serial
  Serial.print("[TX1 -> ESP32] ");
  Serial.println(json);
}

void setup() {
  // Initialize communication
  Serial.begin(115200);   // USB serial debugging
  Serial1.begin(9600);    // Serial1 to ESP32 DevKit V1
  
  // Configure hardware pins
  pinMode(CAP_SENSOR, INPUT_PULLUP);
  pinMode(IND_SENSOR, INPUT_PULLUP);
  pinMode(IR_SENSOR, INPUT_PULLUP);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(US_TRIG, OUTPUT);
  pinMode(US_ECHO, INPUT);
  
  // Attach and position servos
  gate.attach(GATE_SERVO);
  pen.attach(PEN_SERVO);
  gate.write(GATE_CLOSED);
  pen.write(PEN_HOLD);
  
  // Initialize LCD
  lcd.init();
  lcd.backlight();
  
  // Startup Welcome Screen
  lcd.clear();
  lcd.print("SMART RECYCLER");
  lcd.setCursor(0, 1);
  lcd.print("SYSTEM STARTING");
  
  // Beep start
  tone(BUZZER, 1000, 200);
  delay(1000);
  
  // Send startup packet
  sendEvent("SYSTEM_ONLINE");
  
  // Initial bin full check
  checkBinStatus();
  
  lcd.clear();
}

void checkBinStatus() {
  long distance = readUltrasonic();
  bool fullNow = (distance <= BIN_FULL_CM && distance > 0);
  
  if (fullNow != isBinFull) {
    isBinFull = fullNow;
    if (isBinFull) {
      currentState = BIN_FULL;
      sendEvent("BIN_FULL");
    } else {
      currentState = IDLE;
      sendEvent("BIN_CLEARED");
    }
  }
}

// Scan proximity sensors for 1500ms scanning window
int classifyObject() {
  bool capSeen = false;
  unsigned long start = millis();
  
  lcd.clear();
  lcd.print("CLASSIFYING...");
  lcd.setCursor(0, 1);
  lcd.print("PLEASE WAIT");
  
  while (millis() - start < CLASSIFY_WINDOW) {
    int cap = readCap();
    int ind = readInd();
    
    // If inductive proximity sensor spots metal, abort immediately (Metal rejection has priority)
    if (ind == 1) {
      return 2; // Metal detected
    }
    if (cap == 1) {
      capSeen = true;
    }
    delay(SAMPLE_INTERVAL);
  }
  
  if (capSeen) {
    return 1; // PET accepted (Plastic/Object seen, no metal seen)
  }
  return 0; // Empty trigger / invalid material
}

void dispensePen() {
  lcd.setCursor(0, 1);
  lcd.print("DISPENSING PEN..");
  
  pen.write(PEN_DROP); 
  delay(600);
  pen.write(PEN_HOLD); 
  delay(600);
  
  penDispensedCount++;
  sendEvent("PEN_DISPENSED");
}

void acceptBottle() {
  acceptedCount++;
  currentState = ACCEPTED;
  
  digitalWrite(GREEN_LED, HIGH);
  tone(BUZZER, 2000, 500); // 2kHz success tone
  
  lcd.clear();
  lcd.print("PET ACCEPTED");
  lcd.setCursor(0, 1);
  lcd.print("THANK YOU!");
  
  // Sweep gate open
  gate.write(GATE_OPEN); 
  delay(1500);
  gate.write(GATE_CLOSED);
  
  // Dispense physical reward
  dispensePen();
  
  // Sync details to ESP32
  sendEvent("PET_ACCEPTED");
  
  digitalWrite(GREEN_LED, LOW);
  currentState = IDLE;
}

void rejectCan() {
  rejectedCount++;
  currentState = REJECTED;
  
  digitalWrite(RED_LED, HIGH);
  tone(BUZZER, 200, 600); // Low warning buzz
  
  lcd.clear();
  lcd.print("METAL DETECTED");
  lcd.setCursor(0, 1);
  lcd.print("PLEASE REMOVE!");
  
  sendEvent("METAL_REJECTED");
  
  delay(3000); // Keep gate closed, give time for removal
  
  digitalWrite(RED_LED, LOW);
  currentState = IDLE;
}

void loop() {
  // Periodically check bin status when idle
  if (currentState == IDLE) {
    checkBinStatus();
  }
  
  // Periodic Heartbeat to maintain online status on Dashboard
  if (millis() - lastHeartbeat >= HEARTBEAT_MILLIS) {
    sendEvent("HEARTBEAT");
    lastHeartbeat = millis();
  }
  
  // State-Machine Loop
  switch (currentState) {
    case IDLE:
      lcd.setCursor(0, 0);
      lcd.print("INSERT BOTTLE   ");
      lcd.setCursor(0, 1);
      lcd.print("PET or CAN      ");
      
      // If IR entry beam is broken (object inserted)
      if (readIR() == 1) {
        currentState = DETECTING;
        delay(100); // Debounce trigger
      }
      break;
      
    case DETECTING:
      int classification = classifyObject();
      if (classification == 1) {
        acceptBottle();
      } else if (classification == 2) {
        rejectCan();
      } else {
        // Null trigger / empty entry
        lcd.clear();
        lcd.print("NO OBJECT SEEN");
        delay(1500);
        currentState = IDLE;
      }
      break;
      
    case BIN_FULL:
      digitalWrite(RED_LED, HIGH);
      lcd.setCursor(0, 0);
      lcd.print("BIN FULL!       ");
      lcd.setCursor(0, 1);
      lcd.print("PLEASE TRY LATER");
      
      // Toggle red led and beep alert intermittently
      if (millis() % 2000 < 200) {
        tone(BUZZER, 400, 100);
      }
      
      // Check if bin is cleared by technician
      long dist = readUltrasonic();
      if (dist > BIN_FULL_CM || dist <= 0) {
        // Added tolerance delay to ensure bin stays clear
        delay(2000);
        dist = readUltrasonic();
        if (dist > BIN_FULL_CM || dist <= 0) {
          digitalWrite(RED_LED, LOW);
          isBinFull = false;
          currentState = IDLE;
          sendEvent("BIN_CLEARED");
          lcd.clear();
        }
      }
      break;
      
    default:
      currentState = IDLE;
      break;
  }
  
  delay(50); // Small cycle delay
}
