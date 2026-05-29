import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import * as dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: "AIzaSyDgBF-TVAZV6InC5eDihKksVbsnVS2GuBs",
  authDomain: "smart-rvm-ejaj-2026.firebaseapp.com",
  projectId: "smart-rvm-ejaj-2026",
  storageBucket: "smart-rvm-ejaj-2026.firebasestorage.app",
  messagingSenderId: "1037724937821",
  appId: "1:1037724937821:web:83ac5e83f406b3ebaa27b4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function register() {
  console.log("Attempting to create ESP32 Device User in Firebase Auth...");
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, "rvm001@recycle.com", "rvm001pass");
    console.log("✅ SUCCESS! User created successfully inside Firebase Auth.");
    console.log("User UID:", userCredential.user.uid);
  } catch (error) {
    console.error("❌ ERROR creating user:");
    console.error("Error Code:", error.code);
    console.error("Error Message:", error.message);
    
    if (error.code === "auth/operation-not-allowed") {
      console.log("\n⚠️ [Action Required] The Email/Password provider is currently DISABLED in your Firebase Console.");
      console.log("Please go to: Console -> Build -> Authentication -> Sign-in method -> Email/Password -> Enable.");
    }
  }
}

register();
