import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

async function check() {
  const docRef = doc(db, "machines", "RVM001");
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    console.log(`[RVM001 Telemetry Check]`);
    console.log(`Accepted PET Count : ${data.acceptedCount}`);
    console.log(`Pen Dispensed Count: ${data.penDispensedCount}`);
    console.log(`Rejected Can Count : ${data.rejectedCount}`);
    console.log(`Status             : ${data.status}`);
    console.log(`Bin Full           : ${data.binFull}`);
  } else {
    console.log("No telemetry document found for machine RVM001.");
  }
}

check();
