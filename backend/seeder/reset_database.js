import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDgBF-TVAZV6InC5eDihKksVbsnVS2GuBs",
  authDomain: "smart-rvm-ejaj-2026.firebaseapp.com",
  projectId: "smart-rvm-ejaj-2026",
  storageBucket: "smart-rvm-ejaj-2026.firebasestorage.app",
  messagingSenderId: "1037724937821",
  appId: "1:1037724937821:web:83ac5e83f406b3ebaa27b4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const MACHINE_ID = "RVM001";

async function reset() {
  console.log("🧹 Starting database counts reset process...");

  // 1. Clear transaction events, alerts, and audit logs
  const collectionsToClear = ["events", "alerts", "auditLogs"];
  for (const collName of collectionsToClear) {
    const qSnap = await getDocs(collection(db, collName));
    console.log(`Deleting ${qSnap.size} documents from collection '${collName}'...`);
    const promises = qSnap.docs.map(d => deleteDoc(doc(db, collName, d.id)));
    await Promise.all(promises);
  }

  // 2. Reset machine telemetry counters to 0
  console.log("Resetting RVM001 telemetry counters to 0...");
  await setDoc(doc(db, "machines", MACHINE_ID), {
    machineId: MACHINE_ID,
    name: "UniKL MIIT RVM - Lobby",
    location: "UniKL MIIT Main Building Lobby, Ground Floor",
    status: "online",
    binFull: false,
    acceptedCount: 0,
    rejectedCount: 0,
    penDispensedCount: 0,
    lastSeenAt: new Date(),
    firmwareVersion: "v3.1-IoT",
    esp32Version: "v1.0"
  });

  console.log("✨ SUCCESS! Telemetry counts are reset to 0, history cleared, and default users/settings preserved.");
}

reset();
