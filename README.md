# Smart Recycling: Reward-Based Reverse Vending Machine (RVM)
### Final Year Project 2 (FYP2) - IoT & Cloud Extension
**Student:** MD Ejaj Mahmud (Student ID: 52222222123)  
**Institution:** Universiti Kuala Lumpur Malaysia Institute of Information Technology (UniKL MIIT)  
**Supervisor Team:** Hannah Sofian, Sayed Aziz Sayed Hudin, Mohamad Nurul Azmi Mohamad Noor  
**Completed Date:** 29 May 2026  
**Presentation/Viva Demonstration:** 3 June 2026  

---

## 1. System Architecture

This project expands your embedded Arduino Mega 2560 reverse vending machine into a fully integrated, enterprise-grade IoT ecosystem utilizing an **ESP32 DevKit V1** as a UART-to-Cloud bridge, **Firebase** as a serverless database backend, a **Vite React Dashboard** for administrative analytics, and a **Flutter App** for Android mobile monitoring.

```text
       [RVM PHYSICAL CABINET]
   +------------------------------+
   |   Sensors (IR, Cap, Ind, US) |
   |               |              |
   |     [Arduino Mega 2560]      | <---> [16x2 I2C LCD, LEDs, Buzzer]
   |               |              |
   |   UART Serial1 (Pin 18/19)   |
   |               |              |
   |    (1k/2k Resistor Divider)  |
   |               |              |
   |      [ESP32 DevKit V1]       | <---> [Servos: Gate & Pen Dispenser]
   +---------------+--------------+
                   |
             WiFi / HTTPS
                   |
                   v
           [FIREBASE CLOUD]
   +------------------------------+
   |  - Authentication (Auth)     |
   |  - Cloud Firestore (Database)|
   |  - Security Rules (Access)   |
   +---------------+--------------+
                   |
       Real-time DB Sync Listeners
                   |
         +---------+---------+
         |                   |
         v                   v
   [Vite React Web]   [Flutter Android]
   Admin Dashboard       Mobile App
```

---

## 2. Hardware Wiring & Serial Connection Plan

The Arduino Mega remains the real-time machine controller. The ESP32 is only the IoT bridge.

### Pins Configuration
- **Arduino Mega 2560**: Use `Serial1` (TX1 = Pin 18, RX1 = Pin 19)
- **ESP32 DevKit V1**: Use `UART2` (RX2 = GPIO16, TX2 = GPIO17)

### Logic Level Conversion Setup (Voltage Divider)
Arduino Mega operates on 5V logic, while the ESP32 operates on 3.3V logic. Sending a direct 5V TX signal into the ESP32 RX line will degrade or burn the GPIO. 
Assemble the following circuit:

```text
Arduino Mega TX1 (Pin 18) ----[ 1kΩ Resistor ]----+---- ESP32 RX2 (GPIO 16)
                                                  |
                                            [ 2kΩ Resistor ]
                                                  |
Arduino Mega GND ------------- (Common GND) ------+---- ESP32 GND
```
*Note: The ESP32 TX2 (GPIO17) can be connected directly to the Arduino Mega RX1 (Pin 19) because the 3.3V high logic output is high enough to be registered by the Mega's 5V input.*

---

## 3. Directory Layout

The workspace is organized as follows:
- `/arduino_mega_firmware/`: Contains `main_updated.ino` with Serial1 JSON Lines support.
- `/esp32_firmware/`: Contains `esp32_bridge.ino` and credentials template `config.h`.
- `/backend/`: Contains Firestore rules, Firebase config, and the data seeder.
- `/webapp/`: Vite React administrative web panel with dynamic HSL theme styles.
- `/flutter_app/`: Material 3 Flutter application for Android.

---

## 4. Software Setup & Deployment Guide

### STEP 1: Firebase Project Configuration
1. Go to [Firebase Console](https://console.firebase.google.com/) and click **Add Project**. Name it `smart-recycler-rvm`.
2. Navigate to **Authentication** -> **Sign-in method** -> Enable **Email/Password**.
3. Create a dedicated device user account:
   - Email: `rvm001@recycle.com`
   - Password: `rvm001pass` *(or another of your choice)*
4. Go to **Firestore Database** -> Click **Create Database** -> Choose **Start in test mode**.
5. Enable **Realtime Database** if needed.
6. Open **Project Settings** -> Under **General**, click the Web Icon (`</>`) to add a Web App. Copy the `firebaseConfig` object values.

### STEP 2: Configure and Upload ESP32 Firmware
1. Open `/esp32_firmware/esp32_bridge/config.h` in the Arduino IDE.
2. Fill in:
   - WiFi SSID and Password.
   - Web API Key (found in your Firebase Project Settings).
   - Project ID.
   - Dedicated Device user credentials (created in Step 1.3).
3. In the Arduino Library Manager, search for and install:
   - `Firebase-ESP-Client` (by Mobizt)
   - `ArduinoJson` (by Benoit Blanchon)
4. Select board **DOIT ESP32 DEVKIT V1**, select your COM port, and upload.

### STEP 3: Setup Backend Seeder & Mock Data CLI
This script will seed 30 days of high-fidelity logs so your analytical graphs look realistic and dynamic.
1. Navigate to `D:\Projects\FYP2\SmartRecycling_IoT\backend\seeder\`
2. Create a `.env` file containing your Firebase credentials copied in Step 1.6:
   ```env
   FIREBASE_API_KEY=your-api-key
   FIREBASE_PROJECT_ID=your-project-id
   ```
3. Run in terminal:
   ```bash
   npm install
   npm run seed
   ```
4. *To simulate real-time operations without hardware connected during software debugging, run:*
   ```bash
   npm run simulate
   ```

### STEP 4: Run Vite React Admin WebApp
1. Navigate to `D:\Projects\FYP2\SmartRecycling_IoT\webapp\`
2. Open terminal and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open your browser to `http://localhost:3000`. Log in using your admin credentials (e.g. `ejaj@student.unikl.edu.my` / `admin123`).
4. To connect to Firebase: Go to **Machine Settings** -> Scroll to the **Live Firebase Credentials Injector** -> Paste your Web App config keys directly into the input fields and click **Inject Connection**. Your dashboard will immediately bind real-time Firestore listeners!

### STEP 5: Run Flutter App
1. Make sure Flutter SDK is installed.
2. Navigate to `D:\Projects\FYP2\SmartRecycling_IoT\flutter_app\`
3. Open terminal and run:
   ```bash
   flutter pub get
   flutter run
   ```

---

## 5. Official VIVA Demonstration Script (June 3rd, 2026)

Use this script during your presentation to Dr. Hannah and the panel examiners to showcase a highly organized, professional product demo.

### Part A: Introduction & Scope Alignment (1 minute)
> "Good morning, respected panel members. My Final Year Project 2 presents 'Smart Recycling: A Reward-Based Reverse Vending Machine Using Proximity Sensor Detection'. 
>
> The physical cabinet is controlled by an Arduino Mega 2560, running robust, real-time sensor-based state-machine logic. Today, I am demonstrating the completed IoT Scaling Bridge. By wiring an ESP32 bridge to the Mega over Serial1, machine events are uploaded to a cloud Firestore database in real-time, syncing to an administrative Web Dashboard and a mobile companion application."

### Part B: Showing the Physical Operation & State Transitions (2 minutes)
1. **Show LCD Boot**: Turn on the system. Point to the I2C LCD, which will display `SMART RECYCLER` and `INSERT BOTTLE`. Show that the Green LED is off, Red LED is off, and the gate is closed.
2. **Deposit PET Bottle (Plastic)**: 
   - Insert a clean plastic bottle.
   - Explain the logic: *"The IR entry sensor wakes the system. Proximity sensors evaluate the material inside a 1.5-second window. The capacitive sensor detects plastic while the inductive sensor checks for metal."*
   - Point to the LCD: Displays `PET ACCEPTED` and `THANK YOU`.
   - Point to the Actuators: The Green LED shines, the gate servo sweeps open (90°) for 1.5 seconds so the bottle falls into the bin, and the pen dispenser servo drops a reward pen!
3. **Deposit Metal Can (Rejection)**:
   - Insert a metal can.
   - Explain the logic: *"If the inductive sensor detects metal at any time in the window, metal rejection takes absolute priority."*
   - Point to the LCD: Displays `METAL DETECTED` and `PLEASE REMOVE`.
   - Point to the Actuators: The Red LED blinks, a low buzzer alarm sounds, and the gate remains closed. The user has to retrieve the object.

### Part C: Showcasing the Real-Time Cloud Integration (2 minutes)
1. Open your laptop to the **Vite React Web Dashboard** and hold up your Android phone with the **Flutter App**.
2. **Interactive Transaction Sync**: Point out the live telemetry stream. 
   - *"As soon as a bottle was accepted, the Arduino Mega sent a JSON Line event over Serial1 to the ESP32. The ESP32 immediately pushed the payload to Firestore. You can see the dashboard counters incremented instantly, and the mobile app showed a new event entry."*
3. **LCD Simulation**: Click the **Machine Simulator** tab on the web app. Show how the simulated character grid perfectly mirrors the message currently shown on the physical wooden RVM box.
4. **Trigger Bin Full Lockout**:
   - In the Web Simulator, click **Toggle Bin Full Alert** (or physically block the ultrasonic sensor on D22/23 within 8cm).
   - Point to the physical machine: The Red LED turns on, the buzzer sounds, and the LCD locks out with `BIN FULL! PLEASE TRY LATER`.
   - Point to the Web Dashboard and Flutter App: Point out the red glowing indicator, showing `CRITICAL DUSTBIN FULL` alarm under notifications.
   - Empty the bin: Click clear or remove obstruction. The system clears, sends `BIN_CLEARED`, and returns to `IDLE` state immediately.

### Part D: Conclusion & Reporting (30 seconds)
> "In conclusion, the system achieves all 3 project objectives: reliable material-specific classification, automated reward dispensing, and live, serverless IoT telemetry logs. The mock database seeder is preloaded with 30 days of historical transactions to demonstrate active analytics capability. Thank you, and I am ready for your questions."
