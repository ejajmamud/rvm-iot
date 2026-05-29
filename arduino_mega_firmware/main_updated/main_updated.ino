/*
 * ============================================================
 * FYP SMART RVM — Main Integration Code (v4 — IoT)
 * UniKL Final Year Project
 * ============================================================
 *  Events to ESP32 via Serial1 (TX1=D18) @ 9600:
 *    PET_ACCEPTED | METAL_REJECTED | PEN_DISPENSED
 *    BIN_FULL     | BIN_CLEARED
 *
 *  Pins:
 *    IR (FC-51) D11 | Capacitive D5 | Inductive D4
 *    Gate servo D9  | Pen servos D10 | HC-SR04 Trig D22 / Echo D23
 *    Green LED D6   | Red LED D7 | Buzzer D8 | LCD I2C D20/D21
 * ============================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>

// ==== PIN ASSIGNMENTS ====
const int IR_SENSOR  = 11;
const int CAP_SENSOR = 5;
const int IND_SENSOR = 4;
const int GREEN_LED  = 6;
const int RED_LED    = 7;
const int BUZZER     = 8;
const int GATE_SERVO = 9;
const int PEN_SERVO  = 10;
const int US_TRIG    = 22;
const int US_ECHO    = 23;

// ==== SERVO ANGLES ====
const int GATE_CLOSED = 0;
const int GATE_OPEN   = 90;
const int PEN_HOLD    = 90;
const int PEN_DROP    = 0;

// ==== BUZZER TONES ====
const int TONE_ACCEPT = 2000;
const int TONE_REJECT = 200;
const int TONE_PEN    = 1500;
const int TONE_FULL   = 400;

// ==== TIMING (ms) ====
const int IR_DEBOUNCE        = 50;
const int CLASSIFY_WINDOW    = 1500;
const int CLASSIFY_SAMPLE_MS = 20;
const int GATE_OPEN_TIME     = 1500;
const int PEN_DROP_TIME      = 600;
const int PEN_RESET_DELAY    = 400;
const int ACCEPT_DISPLAY     = 2500;
const int REJECT_DISPLAY     = 3000;
const int LOOP_DELAY         = 50;

// ==== BIN LEVEL ====
const int  BIN_FULL_CM        = 8;       // threshold distance in CM
const long BIN_CHECK_INTERVAL = 2000;
const int  BIN_CONFIRM_PINGS  = 5;       // Expanded to 5 pings for robust voting filter

// ==== HARDWARE OBJECTS ====
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo gate;
Servo pen;

// ==== STATE MACHINE ====
enum State { IDLE, DETECTING, ACCEPTED, REJECTED, BIN_FULL };
State currentState = IDLE;

// ==== STATS ====
unsigned int totalAccepted = 0;
unsigned int totalRejected = 0;

// ==== BIN TIMING ====
unsigned long lastBinCheck = 0;

// ============================================================
void setup() {
  Serial.begin(9600);
  Serial1.begin(9600);   // IoT link to ESP32 (TX1 = D18)
  Serial.println(F("=========================================="));
  Serial.println(F("  FYP SMART RVM v4 (IoT) — System Booting..."));
  Serial.println(F("=========================================="));

  pinMode(IR_SENSOR,  INPUT);
  pinMode(CAP_SENSOR, INPUT);
  pinMode(IND_SENSOR, INPUT);
  pinMode(GREEN_LED,  OUTPUT);
  pinMode(RED_LED,    OUTPUT);
  pinMode(BUZZER,     OUTPUT);
  pinMode(US_TRIG,    OUTPUT);
  pinMode(US_ECHO,    INPUT);

  lcd.init();
  lcd.backlight();

  gate.attach(GATE_SERVO);
  gate.write(GATE_CLOSED);

  pen.attach(PEN_SERVO);
  pen.write(PEN_HOLD);
  delay(500);

  showBootScreen();

  Serial.println(F("System ready."));
  goIdle();
}

// ============================================================
void loop() {
  switch (currentState) {

    case IDLE:
      if (millis() - lastBinCheck > BIN_CHECK_INTERVAL) {
        lastBinCheck = millis();
        if (checkBinFull()) { enterBinFull(); break; }
      }
      if (!digitalRead(IR_SENSOR) == 1) {
        delay(IR_DEBOUNCE);
        if (!digitalRead(IR_SENSOR) == 1) {
          currentState = DETECTING;
          Serial.println(F("[IDLE -> DETECTING] IR triggered"));
          showDetecting();
        }
      }
      break;

    case DETECTING:
      classifyObject();
      break;

    case BIN_FULL:
      if (millis() - lastBinCheck > BIN_CHECK_INTERVAL) {
        lastBinCheck = millis();
        if (!checkBinFull()) {
          sendEvent("BIN_CLEARED");
          Serial.println(F("[BIN_FULL -> IDLE] Bin emptied"));
          goIdle();
        }
      }
      break;

    case ACCEPTED:
    case REJECTED:
      break;
  }
  delay(LOOP_DELAY);
}

// ============================================================
void classifyObject() {
  unsigned long start = millis();
  bool capEverHigh = false;
  bool indEverHigh = false;

  while (millis() - start < CLASSIFY_WINDOW) {
    int cap = !digitalRead(CAP_SENSOR);
    int ind = !digitalRead(IND_SENSOR);
    if (cap) capEverHigh = true;
    if (ind) indEverHigh = true;
    if (indEverHigh) break;   // metal = one-way ratchet
    delay(CLASSIFY_SAMPLE_MS);
  }

  Serial.print(F("[CLASSIFY] capEver="));
  Serial.print(capEverHigh);
  Serial.print(F(" indEver="));
  Serial.println(indEverHigh);

  if (indEverHigh) {
    currentState = REJECTED;
    handleReject();
  } else if (capEverHigh) {
    currentState = ACCEPTED;
    handleAccept();
  } else {
    Serial.println(F("[CLASSIFY] No object reached sensor zone"));
    goIdle();
  }
}

// ============================================================
void sendEvent(const char* e) {
  Serial1.println(e);          // to ESP32 -> Firestore -> dashboard
  Serial.print(F("[IoT] -> "));
  Serial.println(e);
}

void handleAccept() {
  totalAccepted++;
  sendEvent("PET_ACCEPTED");
  Serial.print(F("PET ACCEPTED (total: "));
  Serial.print(totalAccepted);
  Serial.println(F(")"));

  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(RED_LED,   LOW);
  tone(BUZZER, TONE_ACCEPT, 500);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("PET ACCEPTED"));
  lcd.setCursor(0, 1); lcd.print(F(":) THANK YOU"));

  delay(800);

  Serial.println(F("Opening gate..."));
  gate.write(GATE_OPEN);
  delay(GATE_OPEN_TIME);
  gate.write(GATE_CLOSED);
  Serial.println(F("Gate closed."));

  dispensePen();
  delay(600);

  digitalWrite(GREEN_LED, LOW);
  goIdle();
}

void handleReject() {
  totalRejected++;
  sendEvent("METAL_REJECTED");
  Serial.print(F("METAL REJECTED (total: "));
  Serial.print(totalRejected);
  Serial.println(F(")"));

  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED,   HIGH);
  tone(BUZZER, TONE_REJECT, 300);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("METAL DETECTED"));
  lcd.setCursor(0, 1); lcd.print(F("PLEASE REMOVE"));

  delay(REJECT_DISPLAY);

  Serial.println(F("Waiting for can removal..."));
  while (!digitalRead(CAP_SENSOR) == 1) { delay(200); }

  Serial.println(F("Can removed."));
  digitalWrite(RED_LED, LOW);
  goIdle();
}

// ============================================================
void dispensePen() {
  Serial.println(F("Dispensing pen..."));

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("HERE IS YOUR"));
  lcd.setCursor(0, 1); lcd.print(F("FREE PEN! ->"));

  tone(BUZZER, TONE_PEN, 200);

  pen.write(PEN_DROP);
  delay(PEN_DROP_TIME);
  pen.write(PEN_HOLD);
  delay(PEN_RESET_DELAY);

  sendEvent("PEN_DISPENSED");
  Serial.println(F("Pen dispensed."));
}

// ============================================================
// Robust Ultrasonic Sensor Distance Acquisition with Filtering
long readUltrasonicCM() {
  digitalWrite(US_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(US_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(US_TRIG, LOW);
  
  // pulseIn with timeout (20000UL microseconds = ~3.4 meters max range)
  long duration = pulseIn(US_ECHO, HIGH, 20000UL);
  if (duration == 0) return 999; // timeout / floating error
  
  long distance = duration / 58;
  
  // Filter out floating inputs / impossible extremely close noise
  if (distance <= 1 || distance > 400) return 999;
  
  return distance;
}

// Majority voting filter to prevent floating lockups on loose breadboard contacts
bool checkBinFull() {
  int fullPings = 0;
  int validPings = 0;
  
  for (int i = 0; i < BIN_CONFIRM_PINGS; i++) {
    long cm = readUltrasonicCM();
    Serial.print(F("[BIN SENSOR] Ping "));
    Serial.print(i + 1);
    Serial.print(F(": "));
    Serial.print(cm);
    Serial.println(F(" cm"));
    
    if (cm != 999) {
      validPings++;
      if (cm <= BIN_FULL_CM) {
        fullPings++;
      }
    }
    delay(45); // Allow acoustic reflections to fully decay
  }
  
  // Safeguard: If no valid echoes are received (unplugged or floating sensor), 
  // bypass check to prevent bricking the machine lockout on boot!
  if (validPings == 0) {
    Serial.println(F("[BIN SENSOR] Warning: No valid ultrasonic echoes received. Bypassing check."));
    return false;
  }
  
  // Majority voting: Bin is full if more than 50% of valid readings indicate full
  return (fullPings > (validPings / 2));
}

void enterBinFull() {
  currentState = BIN_FULL;
  sendEvent("BIN_FULL");
  Serial.println(F("[-> BIN_FULL] Intake locked"));

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("  BIN  FULL  "));
  lcd.setCursor(0, 1); lcd.print(F("PLEASE TRY LATR"));

  digitalWrite(RED_LED, HIGH);
  digitalWrite(GREEN_LED, LOW);
  tone(BUZZER, TONE_FULL, 600);
}

// ============================================================
void showBootScreen() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("FYP SMART RVM"));
  lcd.setCursor(0, 1); lcd.print(F("Booting..."));

  digitalWrite(GREEN_LED, HIGH); tone(BUZZER, 1000, 100); delay(150);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, HIGH);   tone(BUZZER, 1500, 100); delay(150);
  digitalWrite(RED_LED, LOW);
  delay(1500);
}

void showIdleScreen() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("INSERT BOTTLE"));
  lcd.setCursor(0, 1); lcd.print(F("PET or CAN"));
}

void showDetecting() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("Detecting..."));
  lcd.setCursor(0, 1); lcd.print(F("Please wait"));
}

void goIdle() {
  currentState = IDLE;
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED,   LOW);
  lastBinCheck = 0;
  showIdleScreen();
  Serial.println(F("[-> IDLE]"));
}
