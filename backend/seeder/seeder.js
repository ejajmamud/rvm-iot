import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  Timestamp 
} from "firebase/firestore";
import * as dotenv from "dotenv";

dotenv.config();

// --- Firebase Web Configuration ---
// Update these values with your actual Firebase project settings
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.FIREBASE_APP_ID || "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const MACHINE_ID = "RVM001";

// Helper to check if credentials are still placeholder
function verifyConfig() {
  if (firebaseConfig.apiKey === "YOUR_API_KEY" || firebaseConfig.projectId === "YOUR_PROJECT_ID") {
    console.error("\n[Error] Please configure your actual Firebase credentials in your environment or directly inside seeder.js before running!");
    console.log("Create a .env file with:");
    console.log("FIREBASE_API_KEY=...");
    console.log("FIREBASE_PROJECT_ID=...\n");
    process.exit(1);
  }
}

// --- CLEAR DATABASE ---
async function clearDatabase() {
  verifyConfig();
  console.log("🧹 Clearing existing Firestore collections...");
  
  const collections = ["users", "machines", "events", "alerts", "settings", "auditLogs"];
  for (const collName of collections) {
    const qSnap = await getDocs(collection(db, collName));
    console.log(`Deleting ${qSnap.size} documents from '${collName}'...`);
    const promises = qSnap.docs.map(d => deleteDoc(doc(db, collName, d.id)));
    await Promise.all(promises);
  }
  console.log("✨ Database cleared successfully.");
}

// --- SEED SECTIONS ---
async function seedDatabase() {
  verifyConfig();
  console.log("🌱 Seeding Firestore with enterprise-grade mock data...");

  // 1. Seed Settings
  console.log("Settings up machine configuration...");
  await setDoc(doc(db, "settings", MACHINE_ID), {
    machineId: MACHINE_ID,
    binFullThresholdCm: 8,
    heartbeatInterval: 20000,
    notificationEnabled: true,
    maintenanceMode: false
  });

  // 2. Seed Users
  console.log("Creating default users...");
  const users = [
    {
      uid: "admin123",
      name: "MD Ejaj Mahmud (Admin)",
      email: "ejaj@student.unikl.edu.my",
      role: "admin",
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now()
    },
    {
      uid: "supervisor123",
      name: "Dr. Hannah Sofian (Supervisor)",
      email: "hannah@unikl.edu.my",
      role: "supervisor",
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now()
    },
    {
      uid: "tech123",
      name: "Sayed Aziz (Technician)",
      email: "sayedaziz@unikl.edu.my",
      role: "technician",
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now()
    },
    {
      uid: "viewer123",
      name: "Visitor Account (Viewer)",
      email: "visitor@unikl.edu.my",
      role: "viewer",
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now()
    }
  ];

  for (const user of users) {
    await setDoc(doc(db, "users", user.uid), user);
  }

  // 3. Seed 30 Days of Historical Event Data
  console.log("Generating 30 days of high-fidelity historical transaction data...");
  let totalAccepted = 0;
  let totalRejected = 0;
  let totalPens = 0;

  const now = new Date();
  
  for (let i = 30; i >= 1; i--) {
    const day = new Date();
    day.setDate(now.getDate() - i);
    
    // Random counts for each day
    // PET count: 12 to 35 per day. Rejections: 3 to 12.
    const dayAccepted = Math.floor(Math.random() * 24) + 12;
    const dayRejected = Math.floor(Math.random() * 10) + 3;
    const dayPens = Math.floor(dayAccepted / 2) + 2; // Roughly rewards dispensed

    totalAccepted += dayAccepted;
    totalRejected += dayRejected;
    totalPens += dayPens;

    console.log(` - Day -${i}: Accepted: ${dayAccepted}, Rejected: ${dayRejected}, Pens: ${dayPens}`);

    // Create a summarized event for analytics
    await addDoc(collection(db, "events"), {
      machineId: MACHINE_ID,
      type: "DAILY_SUMMARY",
      timestamp: Timestamp.fromDate(day),
      acceptedCount: dayAccepted,
      rejectedCount: dayRejected,
      penDispensedCount: dayPens,
      binFull: false,
      rawPayload: `Daily historical rollup summary for ${day.toDateString()}`
    });
  }

  // 4. Seed Machine Telemetry Document
  console.log("Creating main machine telemetry document...");
  await setDoc(doc(db, "machines", MACHINE_ID), {
    machineId: MACHINE_ID,
    name: "UniKL MIIT RVM - Lobby",
    location: "UniKL MIIT Main Building Lobby, Ground Floor",
    status: "online",
    binFull: false,
    acceptedCount: totalAccepted,
    rejectedCount: totalRejected,
    penDispensedCount: totalPens,
    lastSeenAt: Timestamp.now(),
    firmwareVersion: "v3.1-IoT",
    esp32Version: "v1.0"
  });

  // 5. Seed Alerts
  console.log("Creating template alerts...");
  const alerts = [
    {
      machineId: MACHINE_ID,
      type: "LOW_REWARD_STOCK",
      severity: "warning",
      status: "open",
      createdAt: Timestamp.fromDate(new Date(now.getTime() - 2 * 3600000)) // 2 hours ago
    },
    {
      machineId: MACHINE_ID,
      type: "BIN_FULL",
      severity: "critical",
      status: "resolved",
      createdAt: Timestamp.fromDate(new Date(now.getTime() - 24 * 3600000)), // 24 hours ago
      resolvedAt: Timestamp.fromDate(new Date(now.getTime() - 23 * 3600000))
    }
  ];

  for (const alert of alerts) {
    await addDoc(collection(db, "alerts"), alert);
  }

  // 6. Seed Audit Logs
  console.log("Creating system audit logs...");
  await addDoc(collection(db, "auditLogs"), {
    actorUid: "admin123",
    action: "SYSTEM_INITIALIZED",
    target: MACHINE_ID,
    timestamp: Timestamp.now(),
    metadata: { reason: "Initial database seed deployment" }
  });

  console.log("✅ Seeding completed! Database is fully operational.");
}

// --- SIMULATE REAL-TIME EVENT STREAM ---
async function runSimulation() {
  verifyConfig();
  console.log(`🚀 Starting active RVM simulator for machine [${MACHINE_ID}]...`);
  console.log("Press Ctrl+C to terminate the stream.\n");

  let acceptedTotal = 1520;
  let rejectedTotal = 412;
  let penTotal = 740;

  // Let's pull the current counters from the database if they exist
  try {
    const snap = await getDocs(query(collection(db, "machines"), where("machineId", "==", MACHINE_ID)));
    if (!snap.empty) {
      const data = snap.docs[0].data();
      acceptedTotal = data.acceptedCount || acceptedTotal;
      rejectedTotal = data.rejectedCount || rejectedTotal;
      penTotal = data.penDispensedCount || penTotal;
      console.log(`🔋 Connected! Resuming from database state: Accepted: ${acceptedTotal}, Rejected: ${rejectedTotal}, Pens: ${penTotal}`);
    }
  } catch (err) {
    console.log("⚠️ Could not load initial database counts. Operating from default starting numbers.");
  }

  const loop = async () => {
    // 80% chance of Heartbeat, 15% Accepted PET, 5% Rejected Metal
    const rand = Math.random();
    let eventType = "HEARTBEAT";
    let binFull = false;

    // Check if bin is close to full (1 in 30 chance of triggering bin-full in simulation)
    if (Math.random() < 0.03) {
      eventType = "BIN_FULL";
      binFull = true;
      console.log("🚨 SIMULATOR ALERT: Bin is full!");
    } else if (rand < 0.20) {
      eventType = "PET_ACCEPTED";
      acceptedTotal++;
      if (Math.random() < 0.8) {
        penTotal++; // dispense pen
      }
    } else if (rand < 0.28) {
      eventType = "METAL_REJECTED";
      rejectedTotal++;
    }

    console.log(`[${new Date().toLocaleTimeString()}] Pushing event: ${eventType} | Accepted: ${acceptedTotal} | Rejected: ${rejectedTotal} | Pens: ${penTotal}`);

    try {
      // 1. Log event
      await addDoc(collection(db, "events"), {
        machineId: MACHINE_ID,
        type: eventType,
        timestamp: Timestamp.now(),
        acceptedCount: acceptedTotal,
        rejectedCount: rejectedTotal,
        penDispensedCount: penTotal,
        binFull: binFull,
        rawPayload: "Simulator Engine Stream Output"
      });

      // 2. Update Machine Status
      await setDoc(doc(db, "machines", MACHINE_ID), {
        machineId: MACHINE_ID,
        name: "UniKL MIIT RVM - Lobby",
        location: "UniKL MIIT Main Building Lobby, Ground Floor",
        status: binFull ? "maintenance" : "online",
        binFull: binFull,
        acceptedCount: acceptedTotal,
        rejectedCount: rejectedTotal,
        penDispensedCount: penTotal,
        lastSeenAt: Timestamp.now(),
        firmwareVersion: "v3.1-IoT",
        esp32Version: "v1.0"
      }, { merge: true });

      // 3. Trigger Alert if Bin Full
      if (binFull) {
        await addDoc(collection(db, "alerts"), {
          machineId: MACHINE_ID,
          type: "BIN_FULL",
          severity: "critical",
          status: "open",
          createdAt: Timestamp.now()
        });
      }
      
      // If we randomly triggered bin full, let's clear it automatically after 20 seconds to keep simulation playing
      if (binFull) {
        setTimeout(async () => {
          console.log("\n🔧 SIMULATOR: Technician cleared the bin!");
          await setDoc(doc(db, "machines", MACHINE_ID), { binFull: false, status: "online" }, { merge: true });
          await addDoc(collection(db, "events"), {
            machineId: MACHINE_ID,
            type: "BIN_CLEARED",
            timestamp: Timestamp.now(),
            acceptedCount: acceptedTotal,
            rejectedCount: rejectedTotal,
            penDispensedCount: penTotal,
            binFull: false,
            rawPayload: "Simulator Auto Clear Process"
          });
        }, 20000);
      }

    } catch (e) {
      console.error("❌ Pushing error: ", e.message);
    }

    // Schedule next event (every 8 to 15 seconds)
    const nextSecs = Math.floor(Math.random() * 7000) + 8000;
    setTimeout(loop, nextSecs);
  };

  // Run initial event
  loop();
}

// --- CLI SELECTOR ---
const arg = process.argv[2];
if (arg === "--seed") {
  seedDatabase();
} else if (arg === "--simulate") {
  runSimulation();
} else if (arg === "--clear") {
  clearDatabase();
} else {
  console.log("Reverse Vending Machine Firebase CLI Seeder & Simulator");
  console.log("Usage:");
  console.log("  npm run seed      - Seeds database with users, configuration settings, and 30-day logs");
  console.log("  npm run simulate  - Launches an active simulated telemetry stream");
  console.log("  npm run clear     - Deletes all collections in Firestore");
}
