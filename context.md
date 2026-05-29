# Smart Recycling RVM IoT Project — Handoff & Context Document

This document serves as a complete technical guide, architectural handoff, and overview of the accomplishments completed during this development cycle for the **UniKL MIIT Final Year Project 2 (FYP2) Reward-Based Reverse Vending Machine (RVM)**.

---

## 1. Project Overview & Design Philosophy

The RVM IoT system is an enterprise-grade multi-device ecosystem consisting of:
1. **Interactive Web Admin Dashboard**: A premium, space-industrial dark mode telemetry console inspired by SpaceX Crew Dragon interfaces and Altium vector layouts.
2. **ESP32 DevKit V1 Bridge**: The wireless communication link connecting the hardware controller to Google Cloud Firebase Firestore, with built-in offline caching queues.
3. **Arduino Mega 2560 Controller**: The real-time physical control unit managing proximity sensors, gate sweeps, alphanumeric characters LCD screens, and dispensing mechanisms.
4. **Flutter Companion Mobile App**: A mobile monitoring application designed to check collection bin status and review alarms.

---

## 2. What We Did & Why We Did It

### 🛠️ 1. Horizontal Widescreen Layout Conversion
* **What**: Changed the main simulator splitter container in [App.jsx](file:///D:/Projects/FYP2/SmartRecycling_IoT/webapp/src/App.jsx) from a two-column vertical grid layout (`display: 'grid', gridTemplateColumns: '1.2fr 1.8fr'`) into a stacked single-column flex layout (`display: 'flex', flexDirection: 'column'`).
* **Why**: The physical RVM is horizontal, not vertical. Placing the simulator side-by-side with the schematic squeezed the simulator's sub-columns, forcing them to wrap vertically. Under the new horizontal widescreen stack, the simulator occupies 100% of the screen width, allowing its three sub-columns (Diagnostics, Intake Chamber, Controls HUD) to sit beautifully side-by-side. The entire simulator fits cleanly inside a single `100vh` viewport, and the large wiring schematic sits below the fold ("below after scroll").
* **HUD Relocation**: Shifted the **Control Panel HUD & Power HUD** to the **right side** of the widescreen simulator using the CSS Flexbox `order` property (Diagnostics: `order: 1`, Intake: `order: 2`, HUD: `order: 3`), mirroring intuitive physical machine designs.

### 🐛 2. Fixed JSX Compilation Syntax Errors
* **What**: Identified and closed an unclosed `<h3>` tag in the console header at line 1511 of `App.jsx` that was introduced in a previous layout change.
* **Why**: The unclosed block broke the React JSX parser, resulting in esbuild and Vite hot reload failures. Fixing this restored the production compilation build process, enabling hot module replacement (HMR) to resume operating.

### 🌐 3. Unified Database Architecture on Cloud Firestore
* **What**: Cleared up the architectural mismatch between the web dashboard and the ESP32 code. We verified that both systems are engineered to write to and read from **Cloud Firestore**, rather than the Realtime Database.
* **Why**: Cloud Firestore is a modern document-based database that scales better and easily handles complex relational collections (such as historical lists and audits) compared to flat JSON trees in Realtime Database. It does not require a custom database URL; it operates securely using your Firebase Project ID and API Key.

### 🌱 4. Firestore Seeding & Real-Time Simulation
* **What**: 
  1. Programmed the Firebase CLI (`firebase-tools`) to temporarily open the project's security rules.
  2. Executed `npm run seed` to run [seeder.js](file:///D:/Projects/FYP2/SmartRecycling_IoT/backend/seeder/seeder.js) to insert 30 days of high-fidelity historical transaction data, settings, system alerts, and default staff clearance profiles.
  3. Redeployed secure, role-based production rules ([firestore.rules](file:///D:/Projects/FYP2/SmartRecycling_IoT/backend/firestore.rules)) to lock down database permissions.
  4. Launched a background real-time telemetry simulator (`npm run simulate`) running persistently in the background.
* **Why**: To populate the web app with instant analytics, statistics, and log entries so that your dashboard is fully functional and alive, automatically pushing new data every 8–15 seconds while you test.

---

## 3. Hardware Schematic Reference & Pinout Mapping

All connections on the interactive Altium-style vector schematic match your physical Arduino Mega 2560 and ESP32 board circuits:

| Component Reference | Arduino Mega 2560 Pin | ESP32 GPIO Pin | Voltage / Power Rail | Function Description |
| :--- | :--- | :--- | :--- | :--- |
| **LJC18A3 Capacitive Sensor** | `D5` (Digital Input) | — | 7.58V (Buck 1) | Proximity switch detecting non-metallic plastic density. |
| **LJ12A3 Inductive Sensor** | `D4` (Digital Input) | — | 7.58V (Buck 1) | Proximity switch detecting magnetic metallic cans. |
| **TCRT5000 IR Sensor** | `D11` (Digital Input) | — | 5.0V (Mega VCC) | Objects entry throat detection beam. |
| **HC-SR04 Ultrasonic Sensor** | `D22` (Trig) / `D23` (Echo) | — | 5.0V (Mega VCC) | Collection bin content level monitor (threshold = 8cm). |
| **SG90 Intake Gate Servo** | `D9` (PWM Output) | — | 5.0V (Buck 2) | Rotates to sweep accepted items down the hopper chute. |
| **SG90 Reward Pen Servos** | `D10` (PWM Output) | — | 5.0V (Buck 2) | Shared servo driver dropping physical pens. |
| **Green Accept LED** | `D7` (Digital Output) | — | 5.0V (Mega VCC) | Illuminates upon PET bottle acceptance. |
| **Red Reject / Alarm LED** | `D6` (Digital Output) | — | 5.0V (Mega VCC) | Triggers on metal rejection or bin-full lockout. |
| **Passive Buzzer** | `D8` (PWM Output) | — | 5.0V (Mega VCC) | Emits active audio sweeps, alarms, and start sounds. |
| **Hitachi HD44780 16x2 LCD** | `D20` (SDA) / `D21` (SCL)| — | 5.0V (Mega VCC) | Alphanumeric character display via I2C (address 0x27). |
| **Serial UART Communication**| `Pin 18` (TX1) / `Pin 19` (RX1) | `GPIO16` (RX2) / `GPIO17` (TX2) | 3.3V (Logic level) | Direct serial link transmitting JSON Line telemetry strings. |

---

## 4. Firestore Database Collection Schemas

The Firestore database is structured into 5 primary collections:
* **`machines`**: Uptime records and main counters for telemetry.
* **`events`**: Direct transaction logs representing deposits (PET accepted, Metal rejected, Heartbeats).
* **`alerts`**: Malfunctions and low inventory locks.
* **`users`**: Clearance records used for dashboard web logins.
* **`settings`**: Target threshold configurations.

---

## 5. Quick-Reference Project Credentials & Endpoints

| Resource Target | URL / API Config Value | Notes / Authentication Method |
| :--- | :--- | :--- |
| **Live Web App Dashboard** | [https://rvm.ejaj.website/](https://rvm.ejaj.website/) | Access in cosmic dark mode theme. |
| **GitHub Repository** | [https://github.com/ejajmamud/rvm-iot.git](https://github.com/ejajmamud/rvm-iot.git) | Connected to Coolify automatic push deployment pipelines. |
| **Firebase Project Console** | [https://console.firebase.google.com/project/smart-rvm-ejaj-2026/overview](https://console.firebase.google.com/project/smart-rvm-ejaj-2026/overview) | Main Firebase operational panel. |
| **Firestore API Key** | `AIzaSyDgBF-TVAZV6InC5eDihKksVbsnVS2GuBs` | Required for both ESP32 and Web App client links. |
| **Firebase Project ID** | `smart-rvm-ejaj-2026` | Unified database project directory ID. |
| **Firebase App ID** | `1:1037724937821:web:83ac5e83f406b3ebaa27b4` | Global web application descriptor key. |
| **Singapore API Endpoint** | `https://firestore.googleapis.com/v1/projects/smart-rvm-ejaj-2026/databases/(default)/documents` | REST collection path. |

---

## 6. Maintenance & Development Tips

### How to run the Real-Time Telemetry Simulator
To keep pushing fake transactions to your live dashboard to showcase your project to supervisors, open a command prompt in your local folder `backend/seeder` and run:
```bash
npm run simulate
```
This script acts exactly like a live RVM, writing state updates and transaction payloads into Cloud Firestore in real-time.

### How to Lock Down / Restore Secure Rules
If you want to secure your database before the final presentation (blocking all unauthorized external writes), open a command prompt inside `backend/` and run:
```bash
npx firebase deploy --only firestore:rules
```
This uses your local workspace rules to configure role-based access control, locking out the public simulator and ensuring only the physical ESP32 device and authorized admins can write.
