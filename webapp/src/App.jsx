import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Cpu, Activity, Bell, BarChart2, 
  Users, Settings as SettingsIcon, Wrench, ShieldAlert, 
  Trash2, Plus, LogOut, Sun, Moon, Wifi, CheckCircle2, 
  AlertTriangle, Play, Pause, Database, Download, FileText,
  Monitor, Zap, Signal, Package, Volume2, VolumeX,
  BarChart3, Globe, AlertCircle, Inbox, XCircle, Trophy,
  CircuitBoard, Gauge, Radio, Power, Eye, Cable
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, collection, doc, onSnapshot, updateDoc, 
  addDoc, query, orderBy, limit, setDoc, getDocs, Timestamp 
} from 'firebase/firestore';

// --- Default/Mock Data (Loaded as fallback or while seeding) ---
const INITIAL_MACHINE_MOCK = {
  machineId: "RVM001",
  name: "UniKL MIIT RVM - Lobby",
  location: "UniKL MIIT Main Building Lobby, Ground Floor",
  status: "online",
  binFull: false,
  acceptedCount: 428,
  rejectedCount: 114,
  penDispensedCount: 206,
  lastSeenAt: new Date(),
  firmwareVersion: "v3.1-IoT",
  esp32Version: "v1.0"
};

const INITIAL_MOCK_EVENTS = [
  { id: "e1", type: "PET_ACCEPTED", machineId: "RVM001", acceptedCount: 428, rejectedCount: 114, penCount: 206, binFull: false, timestamp: new Date(Date.now() - 60000) },
  { id: "e2", type: "HEARTBEAT", machineId: "RVM001", acceptedCount: 427, rejectedCount: 114, penCount: 205, binFull: false, timestamp: new Date(Date.now() - 120000) },
  { id: "e3", type: "METAL_REJECTED", machineId: "RVM001", acceptedCount: 427, rejectedCount: 114, penCount: 205, binFull: false, timestamp: new Date(Date.now() - 300000) }
];

const INITIAL_MOCK_ALERTS = [
  { id: "a1", machineId: "RVM001", type: "LOW_REWARD_STOCK", severity: "warning", status: "open", createdAt: new Date(Date.now() - 3600000) },
  { id: "a2", machineId: "RVM001", type: "BIN_FULL", severity: "critical", status: "resolved", createdAt: new Date(Date.now() - 86400000), resolvedAt: new Date(Date.now() - 82000000) }
];

const INITIAL_MOCK_USERS = [
  { uid: "u1", name: "MD Ejaj Mahmud", email: "ejaj@student.unikl.edu.my", role: "admin", createdAt: new Date(Date.now() - 2592000000) },
  { uid: "u2", name: "Dr. Hannah Sofian", email: "hannah@unikl.edu.my", role: "supervisor", createdAt: new Date(Date.now() - 2592000000) },
  { uid: "u3", name: "Sayed Aziz", email: "sayedaziz@unikl.edu.my", role: "technician", createdAt: new Date(Date.now() - 1728000000) }
];

const INITIAL_HISTORICAL_DATA = [
  { date: "May 23", accepted: 24, rejected: 8, pens: 12 },
  { date: "May 24", accepted: 32, rejected: 11, pens: 18 },
  { date: "May 25", accepted: 18, rejected: 5, pens: 10 },
  { date: "May 26", accepted: 40, rejected: 14, pens: 22 },
  { date: "May 27", accepted: 28, rejected: 9, pens: 15 },
  { date: "May 28", accepted: 35, rejected: 12, pens: 19 },
  { date: "May 29", accepted: 45, rejected: 15, pens: 24 }
];

export default function App() {
  const [theme, setTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('rvm_logged_in_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('rvm_logged_in_user') !== null;
  });
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // --- Firebase Connection Configuration State ---
  const [fbConfig, setFbConfig] = useState(() => {
    const saved = localStorage.getItem('rvm_firebase_config');
    if (saved) return JSON.parse(saved);
    
    // Default to your newly created live Firebase project!
    return {
      apiKey: "AIzaSyDgBF-TVAZV6InC5eDihKksVbsnVS2GuBs",
      authDomain: "smart-rvm-ejaj-2026.firebaseapp.com",
      projectId: "smart-rvm-ejaj-2026",
      storageBucket: "smart-rvm-ejaj-2026.firebasestorage.app",
      messagingSenderId: "1037724937821",
      appId: "1:1037724937821:web:83ac5e83f406b3ebaa27b4"
    };
  });
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);

  // --- Real-time Firestore State ---
  const [machine, setMachine] = useState(INITIAL_MACHINE_MOCK);
  const [events, setEvents] = useState(INITIAL_MOCK_EVENTS);
  const [alerts, setAlerts] = useState(INITIAL_MOCK_ALERTS);
  const [users, setUsers] = useState(INITIAL_MOCK_USERS);
  const [settings, setSettings] = useState({ binFullThresholdCm: 8, heartbeatInterval: 20000 });
  const [maintenanceLogs, setMaintenanceLogs] = useState([
    { id: "m1", technician: "Sayed Aziz", action: "Calibrated proximity sensors", date: new Date(Date.now() - 172800000) },
    { id: "m2", technician: "Sayed Aziz", action: "Cleared minor chute obstruction", date: new Date(Date.now() - 86400000) }
  ]);
  const [auditLogs, setAuditLogs] = useState([
    { id: "au1", actor: "MD Ejaj Mahmud", action: "SYSTEM_INITIALIZED", target: "RVM001", timestamp: new Date(Date.now() - 2592000000) }
  ]);

  // --- Simulation states for local demo ---
  const [isSimulating, setIsSimulating] = useState(false);
  const simInterval = useRef(null);

  // --- Aligned Hardware Simulator & exact 3D/wiring states ---
  const [isPowerOn, setIsPowerOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showInternalChassis, setShowInternalChassis] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  
  const [lcdLine1, setLcdLine1] = useState("INSERT BOTTLE");
  const [lcdLine2, setLcdLine2] = useState("PET or CAN      ");
  const [greenLedGlow, setGreenLedGlow] = useState(false);
  const [redLedGlow, setRedLedGlow] = useState(false);
  
  // Real-time animated mechanical servos & sensors status
  const [gateAngle, setGateAngle] = useState(0); // 0deg (closed) -> 90deg (open)
  const [penAngle, setPenAngle] = useState(90); // 90deg (hold) -> 0deg (drop)
  const [sensorCapActive, setSensorCapActive] = useState(false);
  const [sensorIndActive, setSensorIndActive] = useState(false);
  const [sensorIRActive, setSensorIRActive] = useState(false);
  const [simulatedPenRewardCount, setSimulatedPenRewardCount] = useState(45);
  
  // Flash indicators for Arduino Serial Rx/Tx
  const [serialBlinkTx, setSerialBlinkTx] = useState(false);
  const [serialBlinkRx, setSerialBlinkRx] = useState(false);

  // Extra granular simulation states for 100% complete physical simulation
  const [depositItem, setDepositItem] = useState(null); // null | 'pet' | 'metal'
  const [depositStep, setDepositStep] = useState('idle'); // 'idle' | 'entry' | 'scanning' | 'uart' | 'firebase' | 'gate' | 'reward' | 'complete'
  const [scanProgress, setScanProgress] = useState(0);
  const [isWiFiActive, setIsWiFiActive] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [espSerialBlinkRx, setEspSerialBlinkRx] = useState(false);
  const [espSerialBlinkTx, setEspSerialBlinkTx] = useState(false);
  const [isPenInDrawer, setIsPenInDrawer] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Web Audio API Synth to play retro passive buzzer square wave tones!
  const playBuzzerTone = (frequency, durationMs) => {
    if (isMuted || !isPowerOn) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'square'; // square wave mimics active buzzer buzz
      osc.frequency.value = frequency;
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
      console.warn("Web Audio API blocked or not supported yet: ", e);
    }
  };

  const handlePowerToggle = () => {
    const nextPower = !isPowerOn;
    setIsPowerOn(nextPower);
    if (nextPower) {
      setIsBooting(true);
      setLcdLine1("SMART RECYCLER");
      setLcdLine2("SYSTEM STARTING");
      setTimeout(() => {
        playBuzzerTone(1000, 250);
      }, 100);
      setTimeout(() => {
        setIsBooting(false);
        setLcdLine1("INSERT BOTTLE");
        setLcdLine2("PET or CAN      ");
      }, 1800);
    } else {
      setIsSimulating(false);
      if (simInterval.current) clearInterval(simInterval.current);
      setLcdLine1("");
      setLcdLine2("");
      setGreenLedGlow(false);
      setRedLedGlow(false);
      setSensorCapActive(false);
      setSensorIndActive(false);
      setSensorIRActive(false);
      setGateAngle(0);
      setPenAngle(90);
    }
  };

  // Toggle Theme
  useEffect(() => {
    const body = document.body;
    if (theme === 'dark') {
      body.classList.add('dark-theme');
      body.classList.remove('light-theme');
    } else {
      body.classList.add('light-theme');
      body.classList.remove('dark-theme');
    }
  }, [theme]);

  // --- Initialize Firebase Real-time Bindings ---
  useEffect(() => {
    if (!fbConfig) {
      setIsFirebaseConnected(false);
      return;
    }

    try {
      let app;
      if (!getApps().length) {
        app = initializeApp(fbConfig);
      } else {
        app = getApps()[0];
      }
      const db = getFirestore(app);
      setIsFirebaseConnected(true);

      // 1. Listen to machine status
      const machineUnsub = onSnapshot(doc(db, "machines", "RVM001"), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Convert firestore timestamp
          if (data.lastSeenAt) {
            data.lastSeenAt = data.lastSeenAt.toDate();
          }
          setMachine(data);
          
          // Map database state to simulated LCD screen
          if (data.binFull) {
            setLcdLine1("BIN FULL!");
            setLcdLine2("PLEASE TRY LATER");
            setRedLedGlow(true);
            setGreenLedGlow(false);
          } else {
            setLcdLine1("INSERT BOTTLE");
            setLcdLine2("PET or CAN      ");
            setRedLedGlow(false);
          }
        }
      });

      // 2. Listen to events (ordered by timestamp)
      const eventsQuery = query(collection(db, "events"), orderBy("timestamp", "desc"), limit(30));
      const eventsUnsub = onSnapshot(eventsQuery, (qSnap) => {
        const evList = [];
        qSnap.forEach(d => {
          const item = d.data();
          item.id = d.id;
          if (item.timestamp) item.timestamp = item.timestamp.toDate();
          evList.push(item);
        });
        if (evList.length > 0) {
          setEvents(evList);
          
          // Map latest event to LCD feedback simulation
          const latest = evList[0];
          if (latest.type === "PET_ACCEPTED") {
            setLcdLine1("PET ACCEPTED");
            setLcdLine2("THANK YOU!");
            setGreenLedGlow(true);
            setRedLedGlow(false);
            setTimeout(() => {
              setGreenLedGlow(false);
              setLcdLine1("INSERT BOTTLE");
              setLcdLine2("PET or CAN      ");
            }, 3000);
          } else if (latest.type === "METAL_REJECTED") {
            setLcdLine1("METAL DETECTED");
            setLcdLine2("PLEASE REMOVE!");
            setRedLedGlow(true);
            setGreenLedGlow(false);
            setTimeout(() => {
              setRedLedGlow(false);
              setLcdLine1("INSERT BOTTLE");
              setLcdLine2("PET or CAN      ");
            }, 3000);
          }
        }
      });

      // 3. Listen to alerts
      const alertsUnsub = onSnapshot(collection(db, "alerts"), (qSnap) => {
        const alList = [];
        qSnap.forEach(d => {
          const item = d.data();
          item.id = d.id;
          if (item.createdAt) item.createdAt = item.createdAt.toDate();
          if (item.resolvedAt) item.resolvedAt = item.resolvedAt.toDate();
          alList.push(item);
        });
        setAlerts(alList);
      });

      // 4. Listen to settings
      const settingsUnsub = onSnapshot(doc(db, "settings", "RVM001"), (docSnap) => {
        if (docSnap.exists()) {
          setSettings(docSnap.data());
        }
      });

      // 5. Listen to users
      const usersUnsub = onSnapshot(collection(db, "users"), (qSnap) => {
        const usList = [];
        qSnap.forEach(d => {
          const item = d.data();
          item.id = d.id;
          usList.push(item);
        });
        setUsers(usList);
      });

      return () => {
        machineUnsub();
        eventsUnsub();
        alertsUnsub();
        settingsUnsub();
        usersUnsub();
      };

    } catch (e) {
      console.error("Firebase connection error: ", e);
      setIsFirebaseConnected(false);
    }
  }, [fbConfig]);

  // --- Handlers ---
  const handleLogin = (e) => {
    e.preventDefault();
    setAuthError('');
    
    // Look up email inside users list
    const foundUser = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase());
    
    if (foundUser) {
      setIsLoggedIn(true);
      setCurrentUser(foundUser);
      localStorage.setItem('rvm_logged_in_user', JSON.stringify(foundUser));
      logAudit(foundUser.name, "USER_LOGIN", "Logged into admin portal");
    } else {
      setAuthError("Unauthorized user. Only registered university accounts can log in.");
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      logAudit(currentUser.name, "USER_LOGOUT", "Logged out from portal");
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setEmailInput('');
    setPasswordInput('');
    localStorage.removeItem('rvm_logged_in_user');
  };

  const logAudit = async (actorName, action, target) => {
    const newLog = {
      id: "au_" + Date.now(),
      actor: actorName,
      action: action,
      target: target,
      timestamp: new Date()
    };
    
    // Local fallback
    setAuditLogs(prev => [newLog, ...prev]);

    // Firestore push
    if (isFirebaseConnected && fbConfig) {
      try {
        const app = getApps()[0];
        const db = getFirestore(app);
        await addDoc(collection(db, "auditLogs"), {
          actorUid: currentUser?.uid || "unauthenticated",
          action: action,
          target: target,
          timestamp: Timestamp.now(),
          metadata: { actorName }
        });
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Save Settings
  const handleSaveSettings = async (newThreshold, newInterval) => {
    const updatedSettings = {
      binFullThresholdCm: Number(newThreshold),
      heartbeatInterval: Number(newInterval)
    };
    setSettings(updatedSettings);
    logAudit(currentUser.name, "UPDATE_SETTINGS", `Updated bin threshold to ${newThreshold}cm`);
    
    if (isFirebaseConnected) {
      try {
        const app = getApps()[0];
        const db = getFirestore(app);
        await updateDoc(doc(db, "settings", "RVM001"), updatedSettings);
        showToast("Settings synchronized to machine database");
      } catch (e) {
        console.error("Firestore error saving settings: ", e);
      }
    } else {
      showToast("Settings updated locally (offline mode)", "info");
    }
  };

  // Add Maintenance Log
  const handleAddMaintenance = async (actionText) => {
    if (!actionText.trim()) return;
    const newLog = {
      id: "m_" + Date.now(),
      technician: currentUser.name,
      action: actionText,
      date: new Date()
    };
    setMaintenanceLogs(prev => [newLog, ...prev]);
    logAudit(currentUser.name, "MAINTENANCE_LOGGED", actionText);

    if (isFirebaseConnected) {
      try {
        const app = getApps()[0];
        const db = getFirestore(app);
        await addDoc(collection(db, "maintenanceLogs"), {
          technician: currentUser.name,
          action: actionText,
          date: Timestamp.now()
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Acknowledge / Resolve Alerts
  const handleAcknowledgeAlert = async (alertId) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "acknowledged", acknowledgedBy: currentUser.name } : a));
    logAudit(currentUser.name, "ACKNOWLEDGE_ALERT", `Alert ID: ${alertId}`);

    if (isFirebaseConnected) {
      try {
        const app = getApps()[0];
        const db = getFirestore(app);
        await updateDoc(doc(db, "alerts", alertId), {
          status: "acknowledged",
          acknowledgedBy: currentUser.uid
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleResolveAlert = async (alertId) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "resolved", resolvedAt: new Date() } : a));
    logAudit(currentUser.name, "RESOLVE_ALERT", `Alert ID: ${alertId}`);

    if (isFirebaseConnected) {
      try {
        const app = getApps()[0];
        const db = getFirestore(app);
        await updateDoc(doc(db, "alerts", alertId), {
          status: "resolved",
          resolvedAt: Timestamp.now()
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Promote / Manage User Roles
  const handleUpdateRole = async (userId, newRole) => {
    setUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole } : u));
    logAudit(currentUser.name, "USER_ROLE_PROMOTED", `UID: ${userId} to role ${newRole}`);

    if (isFirebaseConnected) {
      try {
        const app = getApps()[0];
        const db = getFirestore(app);
        await updateDoc(doc(db, "users", userId), { role: newRole });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // --- Real-time Simulator (Browser level) ---
  const handleToggleSimulator = () => {
    if (isSimulating) {
      clearInterval(simInterval.current);
      setIsSimulating(false);
    } else {
      setIsSimulating(true);
      simInterval.current = setInterval(() => {
        // Randomly simulate a bottle accepted (65% chance) or can rejected (35% chance)
        const isBottle = Math.random() < 0.65;
        simulateHardwareEvent(isBottle ? "PET_ACCEPTED" : "METAL_REJECTED");
      }, 8000);
    }
  };

  const simulateHardwareEvent = async (type) => {
    if (!isPowerOn) {
      showToast("Machine powered off — toggle the rocker switch first", "error");
      return;
    }
    if (machine.binFull) {
      showToast("Intake locked — bin at capacity. Empty the bin first", "error");
      return;
    }
    if (depositStep !== 'idle') {
      return; // Already running a deposit sequence!
    }

    const isAccepted = type === "PET_ACCEPTED";
    setDepositItem(isAccepted ? 'pet' : 'metal');
    setDepositStep('entry');
    
    // --- STAGE 1: Object Entry (TCRT5000 IR reflective sensor beam broken) ---
    setSensorIRActive(true);
    setSerialBlinkRx(true);
    setEspSerialBlinkTx(true);
    setTimeout(() => {
      setSerialBlinkRx(false);
      setEspSerialBlinkTx(false);
    }, 200);
    
    playBuzzerTone(1000, 100);
    setLcdLine1("OBJECT DETECTED ");
    setLcdLine2("WAKING UP STATE ");
    
    // --- STAGE 2: Scanning (Proximity classification window) ---
    setTimeout(() => {
      setDepositStep('scanning');
      setSensorIRActive(false);
      setSensorCapActive(true);
      if (!isAccepted) {
        setSensorIndActive(true); // Inductive spots metal can
      }
      
      setLcdLine1("CLASSIFYING...  ");
      setScanProgress(0);
      
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 10;
        setScanProgress(progress);
        const barLength = Math.floor(progress / 10);
        const barChar = "■";
        setLcdLine2(barChar.repeat(barLength).padEnd(16, " "));
        
        if (progress >= 100) {
          clearInterval(progressInterval);
        }
      }, 150);
      
    }, 800);
    
    // --- STAGE 3: Mega UART Ingestion Packet Compilation ---
    setTimeout(() => {
      setDepositStep('uart');
      setSensorCapActive(false);
      setSensorIndActive(false);
      
      setLcdLine1("TRANSMITTING...");
      setLcdLine2("UART UART UART  ");
      
      setSerialBlinkTx(true);
      setEspSerialBlinkRx(true);
      playBuzzerTone(1600, 80);
      
      setTimeout(() => {
        setSerialBlinkTx(false);
        setEspSerialBlinkRx(false);
      }, 400);
    }, 2500); // 800ms + 1700ms scan window
    
    // --- STAGE 4: ESP32 Cloud Upload or Offline Cache buffering ---
    setTimeout(() => {
      setDepositStep('firebase');
      
      if (isWiFiActive) {
        setLcdLine1("SYNCING TO CLOUD");
        setLcdLine2("SECURE TLS 1.3  ");
        setEspSerialBlinkTx(true);
        setTimeout(() => setEspSerialBlinkTx(false), 500);
      } else {
        setLcdLine1("WIFI OFFLINE!   ");
        setLcdLine2("SAVING TO CACHE ");
        setOfflineQueueCount(prev => prev + 1);
        playBuzzerTone(300, 200); // warning tone
      }
    }, 3300);
    
    // --- STAGE 5: Gate Actuation decision sweep ---
    setTimeout(() => {
      setDepositStep('gate');
      
      // Updates local machine states in database
      setMachine(prev => {
        const updated = {
          ...prev,
          acceptedCount: isAccepted ? prev.acceptedCount + 1 : prev.acceptedCount,
          rejectedCount: !isAccepted ? prev.rejectedCount + 1 : prev.rejectedCount,
          penDispensedCount: isAccepted ? prev.penDispensedCount + 1 : prev.penDispensedCount,
          lastSeenAt: new Date()
        };
        
        if (isFirebaseConnected && isWiFiActive) {
          const app = getApps()[0];
          const db = getFirestore(app);
          setDoc(doc(db, "machines", "RVM001"), updated, { merge: true });
        }
        return updated;
      });

      // Create Chronological Event Log
      const newEvent = {
        id: "ev_" + Date.now(),
        type: type,
        machineId: "RVM001",
        acceptedCount: machine.acceptedCount + (isAccepted ? 1 : 0),
        rejectedCount: machine.rejectedCount + (!isAccepted ? 1 : 0),
        penCount: machine.penDispensedCount + (isAccepted ? 1 : 0),
        binFull: machine.binFull,
        timestamp: new Date()
      };
      
      setEvents(prev => [newEvent, ...prev]);

      if (isFirebaseConnected && isWiFiActive) {
        try {
          const app = getApps()[0];
          const db = getFirestore(app);
          addDoc(collection(db, "events"), {
            machineId: "RVM001",
            type: type,
            acceptedCount: newEvent.acceptedCount,
            rejectedCount: newEvent.rejectedCount,
            penDispensedCount: newEvent.penCount,
            binFull: newEvent.binFull,
            timestamp: Timestamp.now(),
            rawPayload: `{\"type\":\"${type}\",\"machineId\":\"RVM001\",\"acceptedCount\":${newEvent.acceptedCount},\"rejectedCount\":${newEvent.rejectedCount},\"penCount\":${newEvent.penCount},\"binFull\":false}`
          });
        } catch (err) {
          console.error(err);
        }
      }

      if (isAccepted) {
        setLcdLine1("PET ACCEPTED    ");
        setLcdLine2("THANK YOU!      ");
        setGreenLedGlow(true);
        setRedLedGlow(false);
        
        // Success 8-bit diagnostic beep (2kHz for 500ms)
        playBuzzerTone(2000, 500);

        // Sweep gate servo open: CLOSED = 0deg, OPEN = 90deg
        setGateAngle(90);

        // Close gate after 1.8 seconds (Timing matches line 214 in Mega firmware)
        setTimeout(() => {
          setGateAngle(0);
          setGreenLedGlow(false);
        }, 1800);
      } else {
        // Can Rejected Sequence
        setLcdLine1("METAL DETECTED  ");
        setLcdLine2("PLEASE REMOVE!  ");
        setRedLedGlow(true);
        setGreenLedGlow(false);
        
        // Low Warning Buzz Tone (220Hz for 600ms)
        playBuzzerTone(220, 600);

        // Retain Red LED and hold gate locked for 3 seconds to let user clear chute
        setTimeout(() => {
          setRedLedGlow(false);
          setLcdLine1("INSERT BOTTLE   ");
          setLcdLine2("PET or CAN      ");
          setDepositStep('idle');
          setDepositItem(null);
        }, 3000);
      }
    }, 4300);

    // --- STAGE 6: Pen Reward Dispensing (for accepted plastic bottles) ---
    if (isAccepted) {
      setTimeout(() => {
        setDepositStep('reward');
        setLcdLine2("DISPENSING PEN..");
        setPenAngle(0);
        playBuzzerTone(1200, 180);
        setSimulatedPenRewardCount(prev => Math.max(0, prev - 1));
        setIsPenInDrawer(true); // Drop a pen into the interactive retrieval slot!
        
        setTimeout(() => {
          setPenAngle(90);
        }, 600);
        
        setTimeout(() => {
          logAudit("Arduino Mega", "PEN_DISPENSED", "Physical streak reward issued");
          setLcdLine1("INSERT BOTTLE   ");
          setLcdLine2("PET or CAN      ");
          setDepositStep('idle');
          setDepositItem(null);
        }, 800);
      }, 6200);
    }
  };

  const simulateToggleBinFull = async () => {
    if (!isPowerOn) {
      showToast("Machine powered off — cannot toggle bin status", "error");
      return;
    }
    const nextState = !machine.binFull;
    
    setMachine(prev => {
      const updated = { ...prev, binFull: nextState, status: nextState ? "maintenance" : "online" };
      if (isFirebaseConnected) {
        const app = getApps()[0];
        const db = getFirestore(app);
        setDoc(doc(db, "machines", "RVM001"), updated, { merge: true });
      }
      return updated;
    });

    if (nextState) {
      setLcdLine1("BIN FULL!");
      setLcdLine2("PLEASE TRY LATER");
      setRedLedGlow(true);
      setGreenLedGlow(false);
      
      // Warning beeping sound
      playBuzzerTone(400, 150);
      setTimeout(() => playBuzzerTone(400, 150), 300);

      const alertItem = {
        id: "al_" + Date.now(),
        machineId: "RVM001",
        type: "BIN_FULL",
        severity: "critical",
        status: "open",
        createdAt: new Date()
      };
      setAlerts(prev => [alertItem, ...prev]);

      if (isFirebaseConnected) {
        try {
          const app = getApps()[0];
          const db = getFirestore(app);
          await addDoc(collection(db, "alerts"), {
            machineId: "RVM001",
            type: "BIN_FULL",
            severity: "critical",
            status: "open",
            createdAt: Timestamp.now()
          });
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      setLcdLine1("INSERT BOTTLE");
      setLcdLine2("PET or CAN      ");
      setRedLedGlow(false);
      
      logAudit(currentUser?.name || "Simulator", "BIN_CLEARED", "RVM001 Bin emptied");
    }
  };

  // --- Export to CSV Generator ---
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Timestamp,Event Type,Accepted PET Count,Rejected Can Count,Rewards Dispensed,Bin Full State\n";
    
    events.forEach(e => {
      const dateStr = e.timestamp ? e.timestamp.toLocaleString() : 'N/A';
      csvContent += `"${dateStr}","${e.type}",${e.acceptedCount},${e.rejectedCount},${e.penCount || 0},${e.binFull}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rvm_recycling_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDFMock = () => {
    showToast("PDF report generated — ready for FYP2 review");
  };

  // Firebase Config Submitter
  const handleSaveFirebaseConfig = (e) => {
    e.preventDefault();
    const configData = {
      apiKey: e.target.apiKey.value,
      authDomain: e.target.authDomain.value,
      projectId: e.target.projectId.value,
      storageBucket: e.target.storageBucket.value,
      messagingSenderId: e.target.messagingSenderId.value,
      appId: e.target.appId.value
    };
    
    localStorage.setItem('rvm_firebase_config', JSON.stringify(configData));
    setFbConfig(configData);
    showToast("Firebase credentials injected — connecting to Firestore");
  };

  const handleClearFirebaseConfig = () => {
    localStorage.removeItem('rvm_firebase_config');
    setFbConfig(null);
    setIsFirebaseConnected(false);
    setMachine(INITIAL_MACHINE_MOCK);
    setEvents(INITIAL_MOCK_EVENTS);
    setAlerts(INITIAL_MOCK_ALERTS);
    showToast("Credentials cleared — using local simulator", "info");
  };

  // --- AUTH ROUTER WALL ---
  if (!isLoggedIn) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at top right, #091a24 0%, #06080d 100%)',
        padding: '16px',
        boxSizing: 'border-box'
      }}>
        <div className="glass-panel" style={{
          width: '100%',
          maxWidth: '400px',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '12px',
            borderRadius: '50%',
            marginBottom: '12px',
            color: 'var(--color-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <LayoutDashboard size={32} className="pulse-indicator" />
          </div>
          
          <h1 style={{
            fontSize: '1.4rem',
            textAlign: 'center',
            marginBottom: '4px',
            background: 'linear-gradient(135deg, #ffffff, var(--color-green))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 700
          }}>Smart Recycling Portal</h1>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            textAlign: 'center',
            marginBottom: '16px'
          }}>Final Year Project 2 Admin Portal</p>

          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>University Email</label>
              <input 
                type="email" 
                className="form-input" 
                placeholder="name@student.unikl.edu.my"
                required
                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Console Access Password</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="••••••••"
                required
                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
              />
            </div>

            {authError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-red)',
                padding: '8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                textAlign: 'center'
              }}>
                {authError}
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', padding: '10px', fontSize: '0.8rem' }}>
              Authenticate Portal Access
            </button>
          </form>

          {/* Quick Demo Login Buttons */}
          <div style={{
            width: '100%',
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <span style={{
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '2px'
            }}>
              Quick Demo Login
            </span>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px'
            }}>
              {[
                { name: "MD Ejaj", role: "Admin", email: "ejaj@student.unikl.edu.my" },
                { name: "Dr. Hannah", role: "Supervisor", email: "hannah@unikl.edu.my" },
                { name: "Sayed Aziz", role: "Technician", email: "sayedaziz@unikl.edu.my" },
                { name: "Visitor", role: "Viewer", email: "visitor@unikl.edu.my" }
              ].map((u, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setEmailInput(u.email);
                    setPasswordInput("demo123");
                    
                    // Look up user in active DB
                    const foundUser = users.find(user => user.email.toLowerCase() === u.email.toLowerCase());
                    if (foundUser) {
                      setIsLoggedIn(true);
                      setCurrentUser(foundUser);
                      localStorage.setItem('rvm_logged_in_user', JSON.stringify(foundUser));
                      logAudit(foundUser.name, "QUICK_DEMO_LOGIN", `Authenticated as ${u.role}`);
                    } else {
                      // Fallback
                      const fallbackUser = {
                        uid: "u_" + u.role.toLowerCase(),
                        name: u.name,
                        email: u.email,
                        role: u.role.toLowerCase(),
                        createdAt: new Date()
                      };
                      setIsLoggedIn(true);
                      setCurrentUser(fallbackUser);
                      localStorage.setItem('rvm_logged_in_user', JSON.stringify(fallbackUser));
                    }
                  }}
                  className="btn-secondary"
                  style={{
                    padding: '8px 10px',
                    fontSize: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '2px',
                    borderColor: 'rgba(16, 185, 129, 0.12)',
                    background: 'rgba(16, 185, 129, 0.01)',
                    borderRadius: 'var(--radius-sm)',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.72rem', color: '#fff' }}>{u.name}</span>
                  <span style={{
                    fontSize: '0.6rem',
                    background: u.role === 'Admin' ? 'rgba(59, 130, 246, 0.1)' : 
                               u.role === 'Supervisor' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
                    color: u.role === 'Admin' ? 'var(--color-blue)' : 
                           u.role === 'Supervisor' ? 'var(--color-green)' : 'var(--text-muted)',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    fontWeight: 700,
                    textTransform: 'uppercase'
                  }}>{u.role}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{
            marginTop: '16px',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            borderTop: '1px solid var(--border-primary)',
            paddingTop: '12px',
            width: '100%',
            lineHeight: '1.4'
          }}>
            MD Ejaj Mahmud | Student ID: 52222222123<br />
            UniKL MIIT Final Year Project 2 © 2026
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      
      {/* Inline Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          background: toastMessage.type === 'error' ? 'var(--color-red-dim)' : 
                     toastMessage.type === 'info' ? 'var(--color-blue-dim)' : 'var(--color-green-dim)',
          border: `1px solid ${toastMessage.type === 'error' ? 'var(--color-red)' : 
                                toastMessage.type === 'info' ? 'var(--color-blue)' : 'var(--color-green)'}`,
          color: toastMessage.type === 'error' ? 'var(--color-red)' : 
                 toastMessage.type === 'info' ? 'var(--color-blue)' : 'var(--color-green)',
          padding: '10px 18px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: 'var(--shadow-lg)',
          animation: 'toast-in 0.2s ease-out'
        }}>
          {toastMessage.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          {toastMessage.msg}
        </div>
      )}

      {/* --- SIDEBAR PANEL --- */}
      <aside className="glass-panel" style={{
        width: '260px',
        borderRadius: 0,
        borderRight: '1px solid var(--border-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px',
        zIndex: 10
      }}>
        <div>
          {/* Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--color-green), var(--color-green))',
              color: 'white',
              padding: 8,
              borderRadius: 'var(--radius-sm)'
            }}>
              <LayoutDashboard size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', lineHeight: 1.1 }}>RVM IoT Panel</h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>FYP2 Control Hub</span>
            </div>
          </div>

          {/* Quick Machine status widget */}
          <div className="glass-panel" style={{ padding: '16px', marginBottom: '28px', borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status: RVM001</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: machine.status === 'online' ? 'var(--color-green)' : 'var(--color-amber)'
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: machine.status === 'online' ? 'var(--color-green)' : 'var(--color-amber)'
                }} className="pulse-indicator" />
                {machine.status.toUpperCase()}
              </span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Bin Level:</span>
              <span style={{ fontWeight: 600 }}>{machine.binFull ? '100% (FULL)' : '24% (Normal)'}</span>
            </div>
            <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: machine.binFull ? '100%' : '24%',
                height: '100%',
                background: machine.binFull ? 'var(--color-red)' : 'var(--color-green)',
                transition: 'var(--transition-smooth)'
              }} />
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
              { id: 'simulator', label: 'Machine Simulator', icon: Cpu },
              { id: 'events', label: 'Live Events Feed', icon: Activity },
              { id: 'alerts', label: 'Alert Notification Center', icon: Bell, count: alerts.filter(a => a.status === 'open').length },
              { id: 'analytics', label: 'Analytics Console', icon: BarChart2 },
              { id: 'users', label: 'Users & Roles', icon: Users },
              { id: 'settings', label: 'Machine Settings', icon: SettingsIcon },
              { id: 'maintenance', label: 'Maintenance Logs', icon: Wrench },
              { id: 'audit', label: 'System Audit Trails', icon: ShieldAlert }
            ].map(item => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    border: 'none',
                    color: isActive ? 'var(--color-green)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: isActive ? 600 : 500,
                    textAlign: 'left',
                    transition: 'var(--transition-smooth)'
                  }}
                  className={isActive ? '' : 'glow-green'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <IconComp size={18} />
                    <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span style={{
                      background: 'var(--color-red)',
                      color: 'white',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '10px'
                    }}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info & theme controller */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button 
                onClick={() => setTheme('dark')} 
                style={{
                  border: 'none',
                  background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: theme === 'dark' ? 'var(--color-green)' : 'var(--text-muted)',
                  padding: 8,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                <Moon size={16} />
              </button>
              <button 
                onClick={() => setTheme('light')} 
                style={{
                  border: 'none',
                  background: theme === 'light' ? 'rgba(15,23,42,0.08)' : 'transparent',
                  color: theme === 'light' ? 'var(--color-green)' : 'var(--text-muted)',
                  padding: 8,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                <Sun size={16} />
              </button>
            </div>
            
            <span style={{
              fontSize: '0.7rem',
              color: isFirebaseConnected ? 'var(--color-green)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <Wifi size={14} />
              {isFirebaseConnected ? "Database Live" : "Local Simulator"}
            </span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--border-primary)',
            paddingTop: '16px'
          }}>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{currentUser.name}</div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Role: {currentUser.role}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              style={{
                border: 'none',
                background: 'rgba(239,68,68,0.1)',
                color: 'var(--color-red)',
                padding: 8,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer'
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* --- MAIN PAGE DISPLAY --- */}
      <main style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
        
        {/* --- HEADER CONTROL BAR --- */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '36px'
        }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: 4 }}>
              {activeTab === 'dashboard' && "System Overview"}
              {activeTab === 'simulator' && "Simulated Hardware Console"}
              {activeTab === 'events' && "Real-time Telemetry Events"}
              {activeTab === 'alerts' && "Alerts Notification Hub"}
              {activeTab === 'analytics' && "Data Analytics & Reporting"}
              {activeTab === 'users' && "User Directory & Access Controls"}
              {activeTab === 'settings' && "RVM Threshold Adjustments"}
              {activeTab === 'maintenance' && "Technician Operations Log"}
              {activeTab === 'audit' && "Security Audit Trails"}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {activeTab === 'dashboard' && "Real-time analytical and structural telemetry from RVM001."}
              {activeTab === 'simulator' && "Simulate machine inputs and character LCD readouts for visual presentations."}
              {activeTab === 'events' && "Continuous stream of chronological transactional telemetry."}
              {activeTab === 'alerts' && "Monitor active system malfunctions, full levels, and diagnostics."}
              {activeTab === 'analytics' && "Long-term historical rollups and system efficiency stats."}
              {activeTab === 'users' && "Adjust roles, view account activities, and govern administrative clearances."}
              {activeTab === 'settings' && "Recalibrate the physical triggers and diagnostic check frequencies."}
              {activeTab === 'maintenance' && "Review service records and submit field maintenance updates."}
              {activeTab === 'audit' && "Immutable security log tracing all database and portal operations."}
            </p>
          </div>

          {/* Quick simulator toggles */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              onClick={handleToggleSimulator} 
              className="btn-secondary"
              style={{
                borderColor: isSimulating ? 'var(--color-green)' : 'var(--border-primary)',
                color: isSimulating ? 'var(--color-green)' : 'var(--text-primary)',
              }}
            >
              {isSimulating ? <Pause size={16} /> : <Play size={16} />}
              {isSimulating ? "Simulating Events" : "Run Live Simulation"}
            </button>

            {/* Quick CSV Export */}
            <button onClick={handleExportCSV} className="btn-secondary">
              <Download size={16} />
              Export CSV
            </button>
          </div>
        </header>

        {/* --- VIEW ROUTER PANEL --- */}
        <section>
          
          {/* 1. DASHBOARD OVERVIEW PAGE */}
          {activeTab === 'dashboard' && (
            <div>
              {/* KPI Cards Grid */}
              <div className="dashboard-grid">
                {[
                  { title: "PET Accepted", value: machine.acceptedCount, desc: "Total Plastic Recycled", color: "var(--color-green)", glow: "glow-green" },
                  { title: "Metal Cans Rejected", value: machine.rejectedCount, desc: "Cans Blocked & Safe", color: "var(--color-red)", glow: "glow-red" },
                  { title: "Pens Dispensed", value: machine.penDispensedCount, desc: "Streak Rewards Issued", color: "var(--color-blue)", glow: "glow-blue" },
                  { title: "Active Alarms", value: alerts.filter(a => a.status === 'open').length, desc: "Requiring Attention", color: "var(--color-amber)", glow: "glow-amber" }
                ].map((kpi, idx) => (
                  <div key={idx} className={`stat-card ${kpi.glow}`} style={{ borderLeftColor: kpi.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{kpi.title}</span>
                      <h2 style={{ fontSize: '2.5rem', margin: '4px 0', color: kpi.color, fontFamily: 'var(--font-mono)', fontWeight: 800, letterSpacing: '-0.03em' }}>{kpi.value}</h2>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{kpi.desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Middle Section: Machine Telemetry & Simple Graph */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px', marginBottom: '24px' }}>
                
                {/* RVM Status Card */}
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>RVM Hardware Live Status</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Machine Reference:</span>
                      <span style={{ fontWeight: 600 }}>{machine.machineId}</span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Physical Location:</span>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right' }}>{machine.location}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Network Connectivity:</span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'var(--color-green)',
                        fontWeight: 600
                      }}>
                        <Wifi size={16} /> Online (Bridge active)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Bin Full Condition:</span>
                        <span style={{ fontWeight: 600, color: machine.binFull ? 'var(--color-red)' : 'var(--color-green)' }}>
                          {machine.binFull ? 'CRITICAL - EMPTY IMMEDIATELY' : 'Normal Operations (24%)'}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{
                          width: machine.binFull ? '100%' : '24%',
                          height: '100%',
                          background: machine.binFull ? 'var(--color-red)' : 'var(--color-green)',
                          transition: 'var(--transition-smooth)'
                        }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simulated Chart (Custom Premium SVG Chart) */}
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ fontSize: '1.2rem' }}>Weekly Recycling Efficiency (PET vs Metal)</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 7 Days Rollup</span>
                  </div>

                  {/* SVG Multi-line Graph */}
                  <div style={{ width: '100%', height: '220px', position: 'relative' }}>
                    <svg viewBox="0 0 500 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      {/* Grid Lines */}
                      <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="160" x2="500" y2="160" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="190" x2="500" y2="190" stroke="rgba(255,255,255,0.1)" />

                      {/* Line 1: PET Bottles (Green Accent) */}
                      <path
                        d="M 10 120 Q 80 80 150 140 T 290 50 T 430 80 L 490 60"
                        fill="none"
                        stroke="var(--color-green)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      {/* Line 2: Metal Cans (Red Accent) */}
                      <path
                        d="M 10 180 Q 80 160 150 170 T 290 140 T 430 160 L 490 150"
                        fill="none"
                        stroke="var(--color-red)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />

                      {/* X Axis Labels */}
                      {INITIAL_HISTORICAL_DATA.map((d, i) => (
                        <text key={i} x={10 + i * 80} y="210" fill="var(--text-muted)" fontSize="10" textAnchor="middle">
                          {d.date}
                        </text>
                      ))}
                    </svg>

                    {/* Chart Legend */}
                    <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                        <span style={{ width: 12, height: 4, background: 'var(--color-green)', display: 'block', borderRadius: 2 }} />
                        PET Bottles Accepted
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                        <span style={{ width: 12, height: 4, background: 'var(--color-red)', display: 'block', borderRadius: 2 }} />
                        Metal Cans Rejected
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Recent Events Timeline */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ fontSize: '1.2rem' }}>Live System Ingestion Stream</h3>
                  <button onClick={() => setActiveTab('events')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                    View All Ingested Lines
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {events.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="glass-panel" style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.01)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span style={{
                          background: ev.type === 'PET_ACCEPTED' ? 'rgba(16, 185, 129, 0.1)' : 
                                      ev.type === 'METAL_REJECTED' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.04)',
                          color: ev.type === 'PET_ACCEPTED' ? 'var(--color-green)' : 
                                 ev.type === 'METAL_REJECTED' ? 'var(--color-red)' : 'var(--text-muted)',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {ev.type}
                        </span>
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>RVM001 Log Entry</span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Machine State Counters: Accepted: {ev.acceptedCount} | Rejected: {ev.rejectedCount}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {ev.timestamp ? ev.timestamp.toLocaleTimeString() : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. MACHINE SIMULATOR PAGE */}
          {activeTab === 'simulator' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Segment Controller Bar */}
              <div className="glass-panel" style={{ padding: '8px', display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)' }}>
                <button 
                  onClick={() => setShowInternalChassis(false)} 
                  className={!showInternalChassis ? "btn-primary" : "btn-secondary"}
                  style={{ flex: 1, padding: '10px', fontSize: '0.85rem', justifyContent: 'center' }}
                >
                  FRONT CABINET PANEL VIEW
                </button>
                <button 
                  onClick={() => setShowInternalChassis(true)} 
                  className={showInternalChassis ? "btn-primary" : "btn-secondary"}
                  style={{ flex: 1, padding: '10px', fontSize: '0.85rem', justifyContent: 'center' }}
                >
                  INTERNAL WIRING CHASSIS VIEW
                </button>
              </div>

              {/* Layout splitter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', width: '100%' }}>
                
                {/* COLUMN 1: INTERACTIVE HARDWARE SIMULATION */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
                  
                  {/* CONDITIONAL RENDER VIEW */}
                  {!showInternalChassis ? (
                    /* Revamped Flat Obsidian Titanium Front Panel View */
                    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '16px' }}>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Monitor size={16} /> RVM Industrial Console Panel</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-green)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>100% Hardware Simulated</span>
                      </h3>
                      <div className="perspective-container" style={{ width: '100%' }}>
                        <div className="cabinet-3d-model" style={{ maxWidth: '100%' }}>
                          <div className="cabinet-front-panel" style={{ flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', width: '100%', gap: '24px', flexWrap: 'wrap' }}>
                            
                            {/* SUB-COLUMN A: CONTROL & POWER */}
                            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'space-between', order: 3 }}>
                              <div>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Control Panel HUD</span>
                                {/* SECTION 1: Blue 16x2 character LCD Screen */}
                                <div className={`blue-lcd-container interactive-component ${(!isPowerOn || (isBooting && lcdLine1 === "")) ? "power-off" : ""}`} style={{ maxWidth: '100%', marginBottom: '14px' }}>
                                  <div className="rvm-tooltip">
                                    <div className="rvm-tooltip-header">
                                      <span>Hitachi HD44780 LCD</span>
                                      <span style={{ fontSize: '0.6rem', color: 'var(--color-blue)' }}>I2C address: 0x27</span>
                                    </div>
                                    Alphanumeric Liquid Crystal Display. Powered by 5.0V. Integrates parallel matrix drivers over SCL/SDA lines. Displays state messages.
                                  </div>
                                  <div className="blue-lcd-line">{lcdLine1.padEnd(16)}</div>
                                  <div className="blue-lcd-line">{lcdLine2.padEnd(16)}</div>
                                </div>

                                {/* SECTION 2: Tactile Status Row (Accept LED, Buzzer, Reject LED) */}
                                <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', alignItems: 'center', marginTop: 4, padding: '8px 0', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
                                  {/* Accept Green LED (D7) */}
                                  <div className="interactive-component" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <div className="rvm-tooltip">
                                      <div className="rvm-tooltip-header">Green Accept LED</div>
                                      Connected to digital pin **D7**. Lights up upon successful PET plastic bottle classification.
                                    </div>
                                    <div className={`physical-led ${greenLedGlow ? "green-on" : ""}`}></div>
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)' }}>ACCEPT LED (D7)</span>
                                  </div>

                                  {/* Passive Buzzer (D8) */}
                                  <div className="interactive-component" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <div className="rvm-tooltip">
                                      <div className="rvm-tooltip-header">Passive Buzzer (D8)</div>
                                      Tuned to active digital pin **D8**. Utilizes microcontroller PWM `tone()` loops to emit startups, success sweeps, and warnings.
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                      <div className="physical-buzzer" onClick={() => playBuzzerTone(1000, 150)}></div>
                                      {isPowerOn && depositStep !== 'idle' && depositStep !== 'scanning' && depositStep !== 'firebase' && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '-6px', left: '-6px', right: '-6px', bottom: '-6px',
                                          border: '1px dashed var(--color-red)',
                                          borderRadius: '50%',
                                          animation: 'pulse 1s infinite'
                                        }} />
                                      )}
                                    </div>
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)' }}>BUZZER (D8)</span>
                                  </div>

                                  {/* Reject Red LED (D6) */}
                                  <div className="interactive-component" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <div className="rvm-tooltip">
                                      <div className="rvm-tooltip-header">Red Reject/Fault LED</div>
                                      Connected to digital pin **D6**. Triggers on metal rejects, ultrasonic bin full lockouts, or hardware alarms.
                                    </div>
                                    <div className={`physical-led ${redLedGlow ? "red-on" : ""}`}></div>
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)' }}>REJECT LED (D6)</span>
                                  </div>
                                </div>
                              </div>

                              {/* SECTION 4: Power Controls & Voltage monitors */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.15)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div className="interactive-component" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="rvm-tooltip">
                                      <div className="rvm-tooltip-header">VCC Rocker Switch</div>
                                      Red neon rocker. Completes/cuts the VCC 12V raw adapter feeds into Buck regulators.
                                    </div>
                                    <div onClick={handlePowerToggle} className={`rocker-switch-3d ${isPowerOn ? "powered-on" : "powered-off"}`}>
                                      <div className="rocker-switch-actuator"></div>
                                    </div>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>VCC 12V POWER</span>
                                  </div>

                                  <button 
                                    onClick={() => setIsMuted(!isMuted)} 
                                    className="btn-secondary" 
                                    style={{ padding: '6px 12px', fontSize: '0.65rem', justifyContent: 'center', borderColor: isMuted ? 'var(--color-red)' : 'var(--border-primary)', background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}
                                  >
                                    {isMuted ? <><VolumeX size={12} /> MUTED</> : <><Volume2 size={12} /> AUDIO ON</>}
                                  </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>BUCK 1 (SENSORS):</span>
                                    <div className={`seven-segment-display ${!isPowerOn ? "dark-display" : ""}`} style={{ fontSize: '0.75rem', padding: '2px 6px', minWidth: '46px' }}>
                                      {isPowerOn ? "7.58" : "0.00"}V
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>BUCK 2 (SERVOS):</span>
                                    <div className={`seven-segment-display ${!isPowerOn ? "dark-display" : ""}`} style={{ fontSize: '0.75rem', padding: '2px 6px', minWidth: '46px' }}>
                                      {isPowerOn ? "5.00" : "0.00"}V
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: 4, fontSize: '0.65rem' }}>
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>ESP32 BRIDGE:</span>
                                  <span style={{
                                    fontWeight: 700,
                                    color: !isPowerOn ? 'var(--text-muted)' : isWiFiActive ? 'var(--color-green)' : 'var(--color-red)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3
                                  }}>
                                    <span style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: '50%',
                                      background: !isPowerOn ? '#475569' : isWiFiActive ? 'var(--color-green)' : 'var(--color-red)'
                                    }} className={isPowerOn && isWiFiActive ? "pulse-indicator" : ""} />
                                    {!isPowerOn ? "POWER OFF" : isWiFiActive ? `ONLINE (DB)` : `OFFLINE (${offlineQueueCount})`}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* SUB-COLUMN B: INTAKE CHAMBER */}
                            <div style={{ flex: '1.2 1 340px', display: 'flex', flexDirection: 'column', gap: '16px', order: 2 }}>
                              {/* SECTION 3: High-Tech Interactive Waste Intake Chamber */}
                              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Waste Intake Classification Chamber</span>
                                
                                <div style={{ position: 'relative', width: '100%', height: '180px' }}>
                                  <svg viewBox="0 0 380 180" style={{ width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.8)', border: '2.5px solid #334155', borderRadius: '8px', overflow: 'visible' }}>
                                    <defs>
                                      <linearGradient id="chute-bg-grad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#070a13" />
                                        <stop offset="100%" stopColor="#0e1627" />
                                      </linearGradient>
                                      <linearGradient id="laser-collar" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="rgba(59, 130, 246, 0.4)" />
                                        <stop offset="50%" stopColor="rgba(191, 219, 254, 0.7)" />
                                        <stop offset="100%" stopColor="rgba(59, 130, 246, 0.4)" />
                                      </linearGradient>
                                    </defs>
                                    
                                    {/* Chamber backing */}
                                    <rect width="380" height="180" fill="url(#chute-bg-grad)" rx="6" />
                                    <path d="M 0 0 L 380 0 M 0 30 L 380 30 M 0 150 L 380 150 M 120 0 L 120 180 M 260 0 L 260 180" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
                                    
                                    {/* Intake hopper chute slides */}
                                    <path d="M 120 0 L 142 35 L 142 142 L 120 180" fill="none" stroke="#334155" strokeWidth="2.5" />
                                    <path d="M 260 0 L 238 35 L 238 142 L 260 180" fill="none" stroke="#334155" strokeWidth="2.5" />
                                    
                                    {/* TCRT5000 IR Collar sensor module */}
                                    <g transform="translate(85, 12)" className="interactive-component">
                                      <rect x="0" y="0" width="30" height="18" fill="#1e3a8a" rx="2" stroke="#2563eb" strokeWidth="0.8" />
                                      <circle cx="8" cy="9" r="3.2" fill="#0c0a09" stroke="#444" strokeWidth="0.5" />
                                      <circle cx="22" cy="9" r="3.2" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="0.5" />
                                      <circle cx="15" cy="4" r="1.2" fill={sensorIRActive ? "#ef4444" : "#022c22"} />
                                      <title>TCRT5000 IR sensor: Monitors entry throat. Emits a 950nm beam to sense objects (broken = wakes up Mega D11).</title>
                                    </g>
                                    
                                    {/* IR entry collar laser line */}
                                    <line x1="120" y1="21" x2="260" y2="21" 
                                          stroke={sensorIRActive ? "#ef4444" : "#a855f7"} 
                                          strokeWidth={sensorIRActive ? "2.5" : "1.2"} 
                                          strokeDasharray={sensorIRActive ? "4,4" : "0"} 
                                          style={{ opacity: isPowerOn ? 0.85 : 0.05 }} />

                                    {/* LJC18A3 Capacitive Sensor on the left */}
                                    <g transform="translate(68, 65)" className="interactive-component">
                                      <rect x="0" y="0" width="50" height="20" fill="url(#steel-metallic-grad)" stroke="#475569" strokeWidth="0.8" rx="2" />
                                      <rect x="42" y="0" width="8" height="20" fill="#ef4444" rx="1" />
                                      <circle cx="25" cy="10" r="4" fill={sensorCapActive ? "#10b981" : "#1e293b"} stroke="#fff" strokeWidth="0.4" />
                                      <title>LJC18A3 Capacitive Proximity Sensor: Utilizes capacitive coupling fields to sense non-metallic objects (connected to D5).</title>
                                    </g>
                                    {sensorCapActive && (
                                      <g>
                                        <path d="M 125 70 Q 133 75 125 80" fill="none" stroke="#10b981" strokeWidth="1.5" />
                                        <path d="M 129 65 Q 140 75 129 85" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.6" />
                                      </g>
                                    )}

                                    {/* LJ12A3 Inductive Sensor on the right */}
                                    <g transform="translate(262, 65)" className="interactive-component">
                                      <rect x="0" y="0" width="50" height="20" fill="url(#steel-metallic-grad)" stroke="#475569" strokeWidth="0.8" rx="2" />
                                      <rect x="0" y="0" width="8" height="20" fill="#eab308" rx="1" />
                                      <circle cx="25" cy="10" r="4" fill={sensorIndActive ? "#ef4444" : "#1e293b"} stroke="#fff" strokeWidth="0.4" />
                                      <title>LJ12A3-4-Z/BX Inductive Proximity Sensor: Detects electromagnetic changes to identify metallic cans (connected to D4).</title>
                                    </g>
                                    {sensorIndActive && (
                                      <g>
                                        <path d="M 255 70 Q 247 75 255 80" fill="none" stroke="#ef4444" strokeWidth="1.5" />
                                        <path d="M 251 65 Q 240 75 251 85" fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.6" />
                                      </g>
                                    )}

                                    {/* SG90 Gate Servo body mounted bottom left */}
                                    <g transform="translate(68, 135)" className="interactive-component">
                                      <rect width="36" height="28" fill="#2563eb" stroke="#1d4ed8" strokeWidth="0.8" rx="3" />
                                      <circle cx="26" cy="14" r="8" fill="#1d4ed8" />
                                      <circle cx="26" cy="14" r="4.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.4" />
                                      
                                      {/* White sweep horn rotating */}
                                      <g transform={`rotate(${gateAngle}, 26, 14)`} className="servo-arm" style={{ transformOrigin: '26px 14px' }}>
                                        <path d="M 23 14 L 23 -8 A 3 3 0 0 1 29 -8 L 29 14 Z" fill="#fff" stroke="#cbd5e1" strokeWidth="0.4" />
                                        <circle cx="26" cy="-5" r="0.8" fill="#475569" />
                                        <circle cx="26" cy="14" r="1.8" fill="#94a3b8" />
                                      </g>
                                      <title>SG90 Gate Servo Motor: Rotates horn to sweep open hopper gate bar (Pin D9 PWM).</title>
                                    </g>

                                    {/* Sliding physical gate bar */}
                                    <rect x={depositStep === 'gate' && depositItem === 'pet' ? "95" : "142"} 
                                          y="142" width="96" height="8" fill="#475569" stroke="#1e293b" strokeWidth="1" rx="2" 
                                          style={{ transition: 'x 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                                      <title>Mechanical RVM intake gate bar linked to D9 Servo.</title>
                                    </rect>

                                    {/* SLIDING HIGH-FIDELITY DEPOSIT ITEM */}
                                    {isPowerOn && depositItem && (
                                      <g transform={`translate(190, ${
                                        depositStep === 'entry' ? 21 :
                                        depositStep === 'scanning' ? 75 :
                                        depositStep === 'uart' || depositStep === 'firebase' ? 75 :
                                        depositStep === 'gate' && depositItem === 'pet' ? 142 : 75
                                      })`} style={{ transition: 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)', opacity: depositStep === 'idle' ? 0 : 1 }}>
                                        
                                        {depositItem === 'pet' ? (
                                          <g>
                                            <rect x="-9" y="-20" width="18" height="34" fill="url(#pet-bottle-grad)" stroke="#3b82f6" strokeWidth="0.8" rx="4" />
                                            <rect x="-5" y="-25" width="10" height="5" fill="url(#pet-bottle-grad)" stroke="#3b82f6" strokeWidth="0.8" rx="0.8" />
                                            <rect x="-6" y="-28" width="12" height="3" fill="#2563eb" rx="0.5" />
                                            <rect x="-9" y="-8" width="18" height="8" fill="rgba(255,255,255,0.4)" />
                                            <text x="0" y="-2" fill="#1e3a8a" fontSize="5.5" fontWeight="900" textAnchor="middle">PET</text>
                                          </g>
                                        ) : (
                                          <g>
                                            <rect x="-9" y="-17" width="18" height="30" fill="url(#metal-can-grad)" stroke="#475569" strokeWidth="0.8" rx="2.5" />
                                            <ellipse cx="0" cy="-17" rx="9" ry="1.8" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
                                            <ellipse cx="0" cy="13" rx="9" ry="1.8" fill="#64748b" stroke="#475569" strokeWidth="0.5" />
                                            <rect x="-9" y="-7" width="18" height="12" fill="rgba(239,68,68,0.18)" />
                                            <text x="0" y="2" fill="#b91c1c" fontSize="6" fontWeight="900" textAnchor="middle">CAN</text>
                                          </g>
                                        )}
                                      </g>
                                    )}
                                  </svg>
                                </div>
                              </div>
                            </div>

                            {/* SUB-COLUMN C: DIAGNOSTICS & VIEWPORTS */}
                            <div style={{ flex: '1.2 1 340px', display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'space-between', order: 1 }}>
                              {/* SECTION 5: Transparent Microcontroller Glass Diagnostic Bay */}
                              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Microcontroller Viewport</span>
                                
                                <div className="diagnostic-viewport-panel" style={{ height: '95px' }}>
                                  <svg viewBox="0 0 340 70" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                    {/* UART Orange/Yellow cable with flying dot sync packets */}
                                    <path d="M 125 35 Q 165 42 205 35" stroke="#f97316" strokeWidth="1.2" fill="none" style={{ opacity: isPowerOn ? 0.6 : 0.05 }} />
                                    <path d="M 205 28 Q 165 22 125 28" stroke="#ec4899" strokeWidth="1.2" fill="none" style={{ opacity: isPowerOn ? 0.6 : 0.05 }} />
                                    {isPowerOn && depositStep === 'uart' && (
                                      <circle r="2.5" fill="#f97316">
                                        <animateMotion dur="0.4s" repeatCount="indefinite" path="M 125 35 Q 165 42 205 35" />
                                      </circle>
                                    )}
                                    {isPowerOn && depositStep === 'uart' && (
                                      <circle r="2.5" fill="#ec4899">
                                        <animateMotion dur="0.4s" repeatCount="indefinite" path="M 205 28 Q 165 22 125 28" />
                                      </circle>
                                    )}

                                    {/* ARDUINO MEGA CARD */}
                                    <g transform="translate(5, 5)" className="interactive-component">
                                      <rect width="120" height="60" fill="url(#mega-pcb-grad)" rx="4" stroke="#1e40af" strokeWidth="1" />
                                      <rect x="3" y="3" width="114" height="54" fill="none" stroke="rgba(255,255,255,0.12)" rx="3" />
                                      <rect x="8" y="18" width="18" height="24" fill="url(#ic-body-grad)" stroke="#475569" rx="1.5" />
                                      <text x="17" y="32" fill="#fff" fontSize="5" fontWeight="800" textAnchor="middle">MEGA</text>
                                      
                                      {/* Arduino Mega RX/TX leds */}
                                      <circle cx="85" cy="20" r="1.5" fill={isPowerOn && serialBlinkTx ? "#ef4444" : "#3b0709"} />
                                      <circle cx="85" cy="26" r="1.5" fill={isPowerOn && serialBlinkRx ? "#10b981" : "#022c22"} />
                                      <text x="91" y="21" fill="#64748b" fontSize="4.5">TX</text>
                                      <text x="91" y="27" fill="#64748b" fontSize="4.5">RX</text>

                                      <rect x="5" y="-3" width="15" height="10" fill="url(#silver-metallic-grad)" rx="0.5" />
                                      <text x="60" y="52" fill="#fff" fontSize="7" fontWeight="900" textAnchor="middle" letterSpacing="0.05em">ARDUINO MEGA</text>
                                      <title>Arduino Mega 2560 board: central logic unit. Controls D9/D10 servos, reads proximity lines, and serializes packets.</title>
                                    </g>

                                    {/* ESP32 BRIDGE CARD */}
                                    <g transform="translate(215, 5)" className="interactive-component">
                                      <rect width="120" height="60" fill="url(#esp32-pcb-grad)" rx="4" stroke="#292524" strokeWidth="1" />
                                      <rect x="3" y="3" width="114" height="54" fill="none" stroke="rgba(255,255,255,0.08)" rx="3" />
                                      <rect x="18" y="14" width="30" height="32" fill="url(#silver-metallic-grad)" stroke="#475569" rx="1.5" />
                                      <text x="33" y="32" fill="#1e293b" fontSize="5" fontWeight="900" textAnchor="middle">ESP32</text>
                                      
                                      <circle cx="85" cy="22" r="2.8" fill={
                                        !isPowerOn ? "#1e293b" :
                                        !isWiFiActive ? "#ef4444" :
                                        (depositStep === 'firebase' ? "#3b82f6" : "#10b981")
                                      } className={isPowerOn && isWiFiActive && depositStep === 'firebase' ? "pulse-indicator" : ""} />
                                      <text x="85" y="32" fill="#64748b" fontSize="4.5" textAnchor="middle" fontWeight="800">WIFI LED</text>

                                      {/* ESP32 serial blinks */}
                                      <circle cx="104" cy="18" r="1.5" fill={isPowerOn && espSerialBlinkRx ? "#10b981" : "#022c22"} />
                                      <circle cx="104" cy="24" r="1.5" fill={isPowerOn && espSerialBlinkTx ? "#ef4444" : "#3b0709"} />

                                      <rect x="50" y="56" width="15" height="7" fill="url(#silver-metallic-grad)" rx="0.5" />
                                      <text x="60" y="50" fill="#fff" fontSize="6.5" fontWeight="900" textAnchor="middle" letterSpacing="0.05em">ESP32 DevKit V1</text>
                                      <title>ESP32 DevKit V1: WiFi & Database bridge. Ingests packages over TX1/RX2, rings offline memory if internet fails.</title>
                                    </g>
                                  </svg>
                                </div>
                              </div>

                              {/* SECTION 6: Viewport splits (Ultrasonic collection bin and Dispenser drawer) */}
                              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1.4fr 1.6fr', gap: '14px' }}>
                                
                                {/* A. Waste bin with HC-SR04 ultrasonic */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Collection Bin Viewport</span>
                                  
                                  <div className="waste-viewport-bin">
                                    <svg viewBox="0 0 160 110" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                      {/* Bin glass tint */}
                                      <rect width="160" height="110" fill={machine.binFull ? "rgba(239, 68, 68, 0.08)" : "rgba(15, 23, 42, 0.2)"} rx="6" />
                                      
                                      {/* HC-SR04 Ultrasonic sensor modules pointing down */}
                                      <g transform="translate(48, 5)" className="interactive-component">
                                        <rect width="64" height="24" fill="#0369a1" rx="2" stroke="#0284c7" strokeWidth="0.8" />
                                        <circle cx="18" cy="12" r="9" fill="url(#steel-metallic-grad)" stroke="#334155" strokeWidth="0.5" />
                                        <circle cx="18" cy="12" r="6" fill="#0f172a" />
                                        <circle cx="46" cy="12" r="9" fill="url(#steel-metallic-grad)" stroke="#334155" strokeWidth="0.5" />
                                        <circle cx="46" cy="12" r="6" fill="#0f172a" />
                                        <title>HC-SR04 Ultrasonic Sensor: measures bin depth content. Lockouts machine if waste height reaches D22/D23 threshold (8 cm).</title>
                                      </g>

                                      {/* Sonar emission wave arcs */}
                                      {isPowerOn && (
                                        <g style={{ opacity: machine.binFull ? 0.8 : 0.4 }}>
                                          <line x1="66" y1="32" x2="66" y2="70" stroke="var(--color-green)" strokeWidth="1" strokeDasharray="3,3" />
                                          <line x1="94" y1="32" x2="94" y2="70" stroke="var(--color-green)" strokeWidth="1" strokeDasharray="3,3" />
                                        </g>
                                      )}

                                      {/* Visual representation of accumulated bottles at the bottom */}
                                      {machine.binFull ? (
                                        <g>
                                          <rect x="10" y="45" width="140" height="60" fill="rgba(239,68,68,0.25)" rx="4" />
                                          <ellipse cx="80" cy="45" rx="70" ry="8" fill="rgba(239,68,68,0.3)" />
                                          <rect x="25" y="55" width="26" height="12" fill="url(#pet-bottle-grad)" rx="2" transform="rotate(15, 25, 55)" />
                                          <rect x="65" y="70" width="26" height="12" fill="url(#metal-can-grad)" rx="2" transform="rotate(-30, 65, 70)" />
                                          <rect x="110" y="60" width="26" height="12" fill="url(#pet-bottle-grad)" rx="2" transform="rotate(45, 110, 60)" />
                                          <rect x="45" y="80" width="26" height="12" fill="url(#pet-bottle-grad)" rx="2" transform="rotate(-10, 45, 80)" />
                                          <rect x="95" y="82" width="26" height="12" fill="url(#metal-can-grad)" rx="2" transform="rotate(20, 95, 82)" />
                                        </g>
                                      ) : machine.acceptedCount > 0 ? (
                                        <g>
                                          <rect x="10" y="80" width="140" height="25" fill="rgba(16, 185, 129, 0.08)" rx="4" />
                                          <ellipse cx="80" cy="80" rx="70" ry="4" fill="rgba(16, 185, 129, 0.12)" />
                                          <rect x="40" y="86" width="26" height="11" fill="url(#pet-bottle-grad)" rx="2.5" transform="rotate(-8, 40, 86)" />
                                          {machine.acceptedCount > 2 && (
                                            <rect x="90" y="85" width="26" height="11" fill="url(#pet-bottle-grad)" rx="2.5" transform="rotate(25, 90, 85)" />
                                          )}
                                        </g>
                                      ) : (
                                        <text x="80" y="85" fill="#475569" fontSize="6.5" fontWeight="700" textAnchor="middle">BIN EMPTY</text>
                                      )}

                                      <rect x="15" y="88" width="130" height="16" fill="rgba(0,0,0,0.75)" rx="3" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                                      <text x="80" y="99" fill={machine.binFull ? "var(--color-red)" : "var(--color-green)"} fontSize="7" fontWeight="900" textAnchor="middle" fontFamily="monospace">
                                        {machine.binFull ? "8.0 cm (100% FULL)" : `${(26.4 - Math.min(15, machine.acceptedCount * 0.4)).toFixed(1)} cm (24%)`}
                                      </text>
                                    </svg>
                                  </div>
                                </div>

                                {/* B. Reward dispenser drawer (Carousel & slide drawer) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Reward Stock</span>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--color-blue)' }}>{simulatedPenRewardCount}/50</span>
                                  </div>

                                  <div className="glass-panel" style={{
                                    height: '110px',
                                    background: 'rgba(15, 23, 42, 0.75)',
                                    borderRadius: 8,
                                    border: '2px solid #475569',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: 'inset 0 0 15px rgba(0,0,0,0.9)'
                                  }}>
                                    <div style={{ position: 'absolute', top: 5, left: 10, width: 45, height: 45, border: '1px dashed #334155', borderRadius: 4, display: 'flex', flexDirection: 'column-reverse', gap: 3, padding: 3, background: 'rgba(0,0,0,0.2)' }}>
                                      {Array.from({ length: Math.min(4, Math.ceil(simulatedPenRewardCount / 12)) }).map((_, i) => (
                                        <div key={i} style={{ width: '100%', height: '5px', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: 2, boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }} />
                                      ))}
                                    </div>

                                    <div className="interactive-component" style={{ position: 'absolute', top: 5, right: 10 }}>
                                      <svg width="34" height="34" viewBox="0 0 54 54" style={{ overflow: 'visible' }}>
                                        <rect width="54" height="54" fill="#2563eb" stroke="#1d4ed8" strokeWidth="1.8" rx="6" />
                                        <circle cx="27" cy="27" r="10" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />
                                        <g transform={`rotate(${penAngle}, 27, 27)`} className="servo-arm" style={{ transformOrigin: '27px 27px' }}>
                                          <path d="M 24 27 L 24 -15 A 3 3 0 0 1 30 -15 L 30 27 Z" fill="#fff" stroke="#cbd5e1" strokeWidth="0.5" />
                                          <circle cx="27" cy="-10" r="1.5" fill="#475569" />
                                          <circle cx="27" cy="27" r="3" fill="#94a3b8" />
                                        </g>
                                      </svg>
                                      <title>SG90 Reward Servo: Rotates white sweep horn to drop reward pens (connected to Mega PWM Pin D10).</title>
                                    </div>

                                    <div style={{
                                      position: 'absolute',
                                      bottom: 0, left: 0, right: 0,
                                      height: '42px',
                                      background: isPenInDrawer ? 'rgba(16, 185, 129, 0.08)' : '#070a13',
                                      borderTop: '2px solid #475569',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.3s ease'
                                    }}>
                                      {isPenInDrawer ? (
                                        <div 
                                          onClick={() => {
                                            setIsPenInDrawer(false);
                                            playBuzzerTone(1500, 100);
                                            setTimeout(() => playBuzzerTone(1800, 150), 120);
                                            logAudit(currentUser?.name || "User", "CLAIM_REWARD", "Dispensed pen retrieved from drawer");
                                            showToast("Reward claimed — pen retrieved from drawer");
                                          }}
                                          style={{
                                            width: '90%',
                                            height: '24px',
                                            background: 'linear-gradient(90deg, #10b981, #059669)',
                                            borderRadius: 4,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            color: '#fff',
                                            fontSize: '0.62rem',
                                            fontWeight: '900',
                                            boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
                                            letterSpacing: '0.02em',
                                            animation: 'none'
                                          }}
                                        >
                                          CLAIM REWARD
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '0.62rem', color: '#334155', fontWeight: 800 }}>DRAWER EMPTY</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Internal wiring dashboard controls */
                    <div className="glass-panel" style={{ padding: '24px' }}>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Internal Chassis Status Panel</h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0,0,0,0.2)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
                            LM2596 STEP-DOWN BUCK REGULATORS
                          </span>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {/* Buck 1 */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, borderRight: '1px solid var(--border-primary)' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>SENSORS RAIL BUCK</span>
                              <div className={`seven-segment-display ${!isPowerOn ? "dark-display" : ""}`}>
                                {isPowerOn ? "7.58" : "0.00"} V
                              </div>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Calibrated Proximity sensors</span>
                            </div>

                            {/* Buck 2 */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>SERVOS RAIL BUCK</span>
                              <div className={`seven-segment-display ${!isPowerOn ? "dark-display" : ""}`}>
                                {isPowerOn ? "5.00" : "0.00"} V
                              </div>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Calibrated SG90 Servos</span>
                            </div>
                          </div>
                        </div>

                        {/* Telemetry diagnostics */}
                        <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            SENSORS REAL-TIME TELEMETRY
                          </span>
                          
                          {[
                            { name: "IR Entry sensor (D11)", active: sensorIRActive, color: "#3b82f6", desc: "Object entry trigger" },
                            { name: "Capacitive sensor (D5)", active: sensorCapActive, color: "#10b981", desc: "Plastic / Object detection" },
                            { name: "Inductive sensor (D4)", active: sensorIndActive, color: "#ef4444", desc: "Metal presence detection" },
                            { name: "Ultrasonic sensor (D22/D23)", active: machine.binFull, color: "#f59e0b", desc: "Dustbin capacity levels" }
                          ].map((sens, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                              <div>
                                <span style={{ fontWeight: 600 }}>{sens.name}</span>
                                <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{sens.desc}</span>
                              </div>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: sens.active ? `${sens.color}20` : 'rgba(255,255,255,0.05)',
                                color: sens.active ? sens.color : 'var(--text-muted)',
                                border: `1px solid ${sens.active ? sens.color : 'transparent'}`
                              }}>
                                {sens.active ? "ACTIVE" : "IDLE"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Operations board */}
                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Simulator Test Triggers</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <button 
                        onClick={() => simulateHardwareEvent("PET_ACCEPTED")}
                        className="btn-primary" 
                        style={{ justifyContent: 'center' }}
                        disabled={!isPowerOn}
                      >
                        Simulate PET Plastic Bottle Deposit
                      </button>
                      
                      <button 
                        onClick={() => simulateHardwareEvent("METAL_REJECTED")}
                        className="btn-secondary" 
                        style={{ justifyContent: 'center', border: '1px solid var(--color-red)', color: 'var(--color-red)', background: 'rgba(239, 68, 68, 0.05)' }}
                        disabled={!isPowerOn}
                      >
                        Simulate Metal Can Deposit (Reject)
                      </button>

                      <button 
                        onClick={simulateToggleBinFull}
                        className="btn-secondary" 
                        style={{ justifyContent: 'center', border: '1px solid var(--border-primary)' }}
                        disabled={!isPowerOn}
                      >
                        {machine.binFull ? "Empty simulated dustbin (GND Reset)" : "Fill simulated dustbin to capacity (BIN FULL)"}
                      </button>

                      {/* ESP32 WiFi / Offline Buffer Simulation Controllers */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: 12 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>ESP32 Bridge Network Status</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => {
                              const nextWifi = !isWiFiActive;
                              setIsWiFiActive(nextWifi);
                              if (nextWifi && offlineQueueCount > 0) {
                                // Flush offline queue like real ESP32 recovery!
                                setLcdLine1("FLUSHING CACHE  ");
                                setLcdLine2(`UPLOADING ${offlineQueueCount} EVTS`);
                                playBuzzerTone(1500, 300);
                                setTimeout(() => {
                                  setOfflineQueueCount(0);
                                  setLcdLine1("INSERT BOTTLE   ");
                                  setLcdLine2("PET or CAN      ");
                                }, 1800);
                              }
                            }}
                            className="btn-secondary"
                            style={{ flex: 1, padding: '8px', fontSize: '0.75rem', justifyContent: 'center', borderColor: isWiFiActive ? 'var(--color-green)' : 'var(--color-red)', color: isWiFiActive ? 'var(--color-green)' : 'var(--color-red)' }}
                            disabled={!isPowerOn}
                          >
                            {isWiFiActive ? <><Globe size={12} /> WiFi Connected</> : <><AlertCircle size={12} /> WiFi Disconnected</>}
                          </button>
                          {offlineQueueCount > 0 && (
                            <button
                              onClick={() => {
                                setOfflineQueueCount(0);
                                playBuzzerTone(400, 200);
                              }}
                              className="btn-secondary"
                              style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--color-red)', borderColor: 'rgba(239,68,68,0.2)' }}
                            >
                              Reset Queue ({offlineQueueCount})
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: INTERNAL WIRING SCHEMATIC */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="wiring-chassis-wrapper">
                    <div className="chassis-grid-overlay"></div>
                    
                    {/* SVG wiring panel canvas */}
                    <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 3 }}>
                      <h4 style={{ fontSize: '1rem', color: '#fff', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>HARDWARE WIRING SCHEMATIC</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>hover components for pins & calibrations</span>
                      </h4>

                      <svg viewBox="0 0 850 550" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                        
                        {/* PHOTOREALISTIC GRAPHICS DEFINITIONS */}
                        <defs>
                          {/* Board PCB substrates */}
                          <linearGradient id="mega-pcb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#1e3a8a" />
                            <stop offset="60%" stopColor="#172554" />
                            <stop offset="100%" stopColor="#0f172a" />
                          </linearGradient>

                          <linearGradient id="esp32-pcb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#1c1917" />
                            <stop offset="50%" stopColor="#0c0a09" />
                            <stop offset="100%" stopColor="#1c1917" />
                          </linearGradient>

                          <linearGradient id="buck-pcb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#0284c7" />
                            <stop offset="100%" stopColor="#075985" />
                          </linearGradient>

                          {/* Metallic cylinders */}
                          <linearGradient id="steel-metallic-grad" x1="0%" y1="50%" x2="100%" y2="50%">
                            <stop offset="0%" stopColor="#cbd5e1" />
                            <stop offset="25%" stopColor="#f1f5f9" />
                            <stop offset="50%" stopColor="#94a3b8" />
                            <stop offset="85%" stopColor="#475569" />
                            <stop offset="100%" stopColor="#334155" />
                          </linearGradient>

                          <linearGradient id="silver-metallic-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#94a3b8" />
                            <stop offset="30%" stopColor="#f1f5f9" />
                            <stop offset="70%" stopColor="#cbd5e1" />
                            <stop offset="100%" stopColor="#64748b" />
                          </linearGradient>

                          <linearGradient id="brass-screw-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#fbbf24" />
                            <stop offset="50%" stopColor="#d97706" />
                            <stop offset="100%" stopColor="#78350f" />
                          </linearGradient>

                          {/* Passive Components */}
                          <linearGradient id="capacitor-grad" x1="0%" y1="50%" x2="100%" y2="50%">
                            <stop offset="0%" stopColor="#1e293b" />
                            <stop offset="80%" stopColor="#0f172a" />
                            <stop offset="100%" stopColor="#334155" />
                          </linearGradient>

                          <linearGradient id="copper-toroid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="35%" stopColor="#b45309" />
                            <stop offset="70%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#78350f" />
                          </linearGradient>

                          <linearGradient id="ic-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#334155" />
                            <stop offset="50%" stopColor="#1e293b" />
                            <stop offset="100%" stopColor="#0f172a" />
                          </linearGradient>

                          {/* Translucent light blue PET gradient */}
                          <linearGradient id="pet-bottle-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.4)" />
                            <stop offset="30%" stopColor="rgba(191, 219, 254, 0.75)" />
                            <stop offset="70%" stopColor="rgba(59, 130, 246, 0.5)" />
                            <stop offset="100%" stopColor="rgba(29, 78, 216, 0.6)" />
                          </linearGradient>

                          {/* Metallic can sheen */}
                          <linearGradient id="metal-can-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#94a3b8" />
                            <stop offset="40%" stopColor="#f8fafc" />
                            <stop offset="80%" stopColor="#cbd5e1" />
                            <stop offset="100%" stopColor="#475569" />
                          </linearGradient>
                        </defs>

                        {/* ==========================================
                           INTAKE CHUTE AND PHYSICAL OBJECT ANIMATIONS
                           ========================================== */}
                        {/* Transparent grey intake tube outline */}
                        <path d="M 590 10 L 710 230" stroke="rgba(255,255,255,0.06)" strokeWidth="65" strokeLinecap="round" fill="none" />
                        <path d="M 590 10 L 710 230" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="60" strokeLinecap="round" fill="none" />
                        
                        {/* Slide bottle / can visual indicators */}
                        {depositItem === 'pet' && (
                          <g transform={`translate(${
                            depositStep === 'entry' ? '590, 10' :
                            depositStep === 'scanning' ? '640, 100' :
                            depositStep === 'gate' ? '680, 180' : '710, 240'
                          })`} style={{ transition: 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                            {/* Translucent PET plastic bottle cylinder */}
                            <rect x="-14" y="-30" width="28" height="50" fill="url(#pet-bottle-grad)" stroke="#3b82f6" strokeWidth="1.2" rx="6" />
                            <rect x="-8" y="-38" width="16" height="8" fill="url(#pet-bottle-grad)" stroke="#3b82f6" strokeWidth="1.2" rx="1.5" />
                            <rect x="-10" y="-42" width="20" height="4" fill="#2563eb" rx="1" /> {/* Blue bottle cap */}
                            <rect x="-14" y="-12" width="28" height="12" fill="rgba(255,255,255,0.4)" /> {/* Plastic label */}
                            <text x="0" y="-3" fill="#1e3a8a" fontSize="6" fontWeight="900" textAnchor="middle">PET</text>
                          </g>
                        )}

                        {depositItem === 'metal' && (
                          <g transform={`translate(${
                            depositStep === 'entry' ? '590, 10' :
                            depositStep === 'scanning' ? '640, 100' : '655, 130'
                          })`} style={{ transition: 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                            {/* Aluminum Beverage Can */}
                            <rect x="-13" y="-25" width="26" height="46" fill="url(#metal-can-grad)" stroke="#475569" strokeWidth="1.2" rx="4" />
                            <ellipse cx="0" cy="-25" rx="13" ry="3" fill="#cbd5e1" stroke="#475569" strokeWidth="0.8" />
                            <ellipse cx="0" cy="21" rx="13" ry="3" fill="#64748b" stroke="#475569" strokeWidth="0.8" />
                            {/* Coca-cola-like red accent lines */}
                            <rect x="-13" y="-12" width="26" height="20" fill="rgba(239,68,68,0.2)" />
                            <text x="0" y="2" fill="#b91c1c" fontSize="7" fontWeight="900" textAnchor="middle">CAN</text>
                          </g>
                        )}

                        {/* ==========================================
                           NATURAL SAG JUMPER WIRES (BEZIER CURVES)
                           ========================================== */}
                        
                        {/* 1. 12V Main DC Adapter Feeds (Red/Black) */}
                        <path d="M 20 80 Q 200 30 430 50" stroke="#ef4444" strokeWidth="2.5" fill="none" className="schematic-wire" color="#ef4444">
                          <title>VCC 12V Input (Red): Direct raw adapter feed routed to LM2596 Buck 1 In+ input.</title>
                        </path>
                        <path d="M 20 80 Q 200 120 430 145" stroke="#ef4444" strokeWidth="2.5" fill="none" className="schematic-wire" color="#ef4444">
                          <title>VCC 12V Input (Red): Direct raw adapter feed routed to LM2596 Buck 2 In+ input.</title>
                        </path>
                        <path d="M 20 95 Q 200 70 430 95" stroke="#111" strokeWidth="2.5" fill="none" className="schematic-wire" color="#111">
                          <title>Common ground return adapter feed (Black) to Buck 1 In-.</title>
                        </path>

                        {/* 2. 7.58V Proximity Sensors Power Rail (Buck 1 Out+ -> Sensor VCC) */}
                        <path d="M 545 50 Q 640 50 640 270 L 730 270" stroke="#f59e0b" strokeWidth="2.2" fill="none" className="schematic-wire" color="#f59e0b">
                          <title>Sensors Power Rail (7.58V DC): Tuning output feed from Buck 1 Out+ specifically driving LJC18A3 Cap sensor VCC.</title>
                        </path>
                        <path d="M 545 50 Q 650 50 650 370 L 730 370" stroke="#f59e0b" strokeWidth="2.2" fill="none" className="schematic-wire" color="#f59e0b">
                          <title>Sensors Power Rail (7.58V DC): Tuning output feed from Buck 1 Out+ specifically driving LJ12A3 Ind sensor VCC.</title>
                        </path>

                        {/* 3. 5.00V Servos Power Rail (Buck 2 Out+ -> Servos VCC) */}
                        <path d="M 545 145 Q 680 145 680 48 L 730 48" stroke="#ef4444" strokeWidth="2.2" fill="none" className="schematic-wire" color="#ef4444">
                          <title>Servos Power Rail (5.00V DC): Output feed from Buck 2 Out+ driving SG90 Gate servo VCC.</title>
                        </path>
                        <path d="M 545 145 Q 670 145 670 138 L 730 138" stroke="#ef4444" strokeWidth="2.2" fill="none" className="schematic-wire" color="#ef4444">
                          <title>Servos Power Rail (5.00V DC): Output feed from Buck 2 Out+ driving SG90 Reward servo VCC.</title>
                        </path>

                        {/* 4. Common GND Reference ties */}
                        <path d="M 281 277 Q 160 277 160 408 L 61 408" stroke="#0f172a" strokeWidth="2.2" fill="none" className="schematic-wire" color="#0f172a">
                          <title>Common Ground Bridge: Ties ESP32 Board GND directly to Arduino Mega GND.</title>
                        </path>
                        <path d="M 545 95 Q 630 95 630 304 L 730 304" stroke="#111" strokeWidth="2" fill="none" className="schematic-wire" color="#111">
                          <title>Capacitive Proximity GND: Buck 1 Out- to LJC18A3 Cap Sensor GND.</title>
                        </path>
                        <path d="M 545 95 Q 640 95 640 404 L 730 404" stroke="#111" strokeWidth="2" fill="none" className="schematic-wire" color="#111">
                          <title>Inductive Proximity GND: Buck 1 Out- to LJ12A3 Ind Sensor GND.</title>
                        </path>
                        <path d="M 545 190 Q 690 190 690 56 L 730 56" stroke="#111" strokeWidth="2" fill="none" className="schematic-wire" color="#111">
                          <title>Gate Servo GND: Buck 2 Out- to Gate Servo GND.</title>
                        </path>
                        <path d="M 545 190 Q 680 190 680 146 L 730 146" stroke="#111" strokeWidth="2" fill="none" className="schematic-wire" color="#111">
                          <title>Reward Servo GND: Buck 2 Out- to Reward Servo GND.</title>
                        </path>

                        {/* 5. Proximity Sensor outputs -> Resistor Dividers -> Arduino Pins */}
                        <path d="M 730 287 Q 560 287 560 445 L 280 445" stroke="#10b981" strokeWidth="1.8" fill="none" className="schematic-wire" color="#10b981">
                          <title>Capacitive Proximity Output (7.58V peak): passes signal to Breadboard Divider 1.</title>
                        </path>
                        <path d="M 730 387 Q 550 387 550 445 L 340 445" stroke="#84cc16" strokeWidth="1.8" fill="none" className="schematic-wire" color="#84cc16">
                          <title>Inductive Proximity Output (7.58V peak): passes signal to Breadboard Divider 2.</title>
                        </path>
                        <path d="M 300 445 Q 200 445 160 380 Q 120 380 61 318" stroke="#10b981" strokeWidth="1.8" fill="none" className="schematic-wire" color="#10b981">
                          <title>Divided safe Capacitive peak (3.79V TTL) entering Arduino Mega Pin D5.</title>
                        </path>
                        <path d="M 360 445 Q 210 455 160 390 Q 110 390 61 308" stroke="#84cc16" strokeWidth="1.8" fill="none" className="schematic-wire" color="#84cc16">
                          <title>Divided safe Inductive peak (3.79V TTL) entering Arduino Mega Pin D4.</title>
                        </path>

                        {/* 6. TCRT5000 IR & HC-SR04 signals to Mega */}
                        <path d="M 250 70 Q 150 70 61 378" stroke="#a855f7" strokeWidth="1.8" fill="none" className="schematic-wire" color="#a855f7">
                          <title>TCRT5000 Presence IR Signal (5V active-LOW) entering Arduino Mega Pin D11.</title>
                        </path>
                        <path d="M 250 160 Q 210 160 209 268" stroke="#3b82f6" strokeWidth="1.8" fill="none" className="schematic-wire" color="#3b82f6">
                          <title>HC-SR04 Trigger pulse line connected to Mega D22.</title>
                        </path>
                        <path d="M 250 175 Q 220 175 209 278" stroke="#06b6d4" strokeWidth="1.8" fill="none" className="schematic-wire" color="#06b6d4">
                          <title>HC-SR04 Echo capture pulse line connected to Mega D23.</title>
                        </path>

                        {/* 7. SG90 Servos PWM wires from Mega D9 & D10 */}
                        <path d="M 61 358 Q 380 20 730 40" stroke="#3b82f6" strokeWidth="1.8" fill="none" className="schematic-wire" color="#3b82f6">
                          <title>Gate Servo control (Mega PWM Pin D9).</title>
                        </path>
                        <path d="M 61 368 Q 390 120 730 130" stroke="#6366f1" strokeWidth="1.8" fill="none" className="schematic-wire" color="#6366f1">
                          <title>Reward Servos trigger control (Mega PWM Pin D10).</title>
                        </path>

                        {/* 8. ESP32 UART2 Bridge wiring routes (Mega D18 & D19) */}
                        <path d="M 61 448 Q 170 475 280 475" stroke="#f97316" strokeWidth="2" fill="none" id="wire-mega-tx" className="schematic-wire" color="#f97316">
                          <title>Mega UART1 TX1 (Pin 18): Sends 5V serial lines into Breadboard Divider 3.</title>
                        </path>
                        <path d="M 300 475 Q 300 321 281 321" stroke="#facc15" strokeWidth="2" fill="none" id="wire-esp-rx" className="schematic-wire" color="#facc15">
                          <title>Divided safe UART Signal: 3.3V serial package entering ESP32 RX2 (GPIO16).</title>
                        </path>
                        <path d="M 281 332 Q 170 332 61 458" stroke="#ec4899" strokeWidth="2" fill="none" className="schematic-wire" color="#ec4899">
                          <title>ESP32 UART2 TX2 (GPIO17) to Mega RX1 (Pin 19) direct connection.</title>
                        </path>

                        {/* ==========================================
                           ANIMATED DATA PACKET MOTION DOTS
                           ========================================== */}
                        {depositStep === 'entry' && (
                          <circle r="4" fill="#a855f7" filter="drop-shadow(0 0 3px #a855f7)">
                            <animateMotion dur="0.5s" repeatCount="indefinite" path="M 250 70 Q 150 70 61 378" />
                          </circle>
                        )}
                        
                        {depositStep === 'scanning' && depositItem === 'pet' && (
                          <>
                            <circle r="4.5" fill="#10b981" filter="drop-shadow(0 0 3px #10b981)">
                              <animateMotion dur="0.8s" repeatCount="indefinite" path="M 730 287 Q 560 287 560 445 L 280 445" />
                            </circle>
                            <circle r="3.5" fill="#10b981" filter="drop-shadow(0 0 3px #10b981)">
                              <animateMotion dur="0.8s" repeatCount="indefinite" path="M 300 445 Q 200 445 160 380 Q 120 380 61 318" />
                            </circle>
                          </>
                        )}

                        {depositStep === 'scanning' && depositItem === 'metal' && (
                          <>
                            <circle r="4.5" fill="#facc15" filter="drop-shadow(0 0 3px #facc15)">
                              <animateMotion dur="0.8s" repeatCount="indefinite" path="M 730 387 Q 550 387 550 445 L 340 445" />
                            </circle>
                            <circle r="3.5" fill="#facc15" filter="drop-shadow(0 0 3px #facc15)">
                              <animateMotion dur="0.8s" repeatCount="indefinite" path="M 360 445 Q 210 455 160 390 Q 110 390 61 308" />
                            </circle>
                          </>
                        )}

                        {depositStep === 'uart' && (
                          <>
                            <circle r="4.5" fill="#f97316" filter="drop-shadow(0 0 3px #f97316)">
                              <animateMotion dur="0.6s" repeatCount="indefinite" path="M 61 448 Q 170 475 280 475" />
                            </circle>
                            <circle r="4" fill="#facc15" filter="drop-shadow(0 0 3px #facc15)">
                              <animateMotion dur="0.6s" repeatCount="indefinite" path="M 300 475 Q 300 321 281 321" />
                            </circle>
                          </>
                        )}

                        {/* ==========================================
                           PHOTOREALISTIC HARDWARE BOARD GRAPHICS
                           ========================================== */}

                        {/* COMPONENT 1: ARDUINO MEGA 2560 */}
                        <g transform="translate(50, 240)" className="interactive-component">
                          {/* Board substrate */}
                          <rect width="170" height="260" fill="url(#mega-pcb-grad)" stroke="#1e40af" strokeWidth="2.5" rx="8" />
                          <rect x="6" y="6" width="158" height="248" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" rx="6" />

                          {/* USB & Power jacks */}
                          <rect x="15" y="-12" width="28" height="40" fill="url(#silver-metallic-grad)" stroke="#475569" rx="2" />
                          <rect x="130" y="-10" width="24" height="32" fill="#0f172a" stroke="#1e293b" rx="2" />
                          <circle cx="142" cy="18" r="4.5" fill="url(#silver-metallic-grad)" />

                          {/* MCU Chip ATmega2560 */}
                          <rect x="58" y="95" width="56" height="56" fill="url(#ic-body-grad)" stroke="#475569" rx="3" />
                          {/* silver TQFP legs */}
                          {Array.from({ length: 12 }).map((_, i) => (
                            <g key={i}>
                              <line x1="53" y1={String(100 + i * 4)} x2="58" y2={String(100 + i * 4)} stroke="#e2e8f0" strokeWidth="0.8" />
                              <line x1="114" y1={String(100 + i * 4)} x2="119" y2={String(100 + i * 4)} stroke="#e2e8f0" strokeWidth="0.8" />
                              <line x1={String(63 + i * 4)} y1="90" x2={String(63 + i * 4)} y2="95" stroke="#e2e8f0" strokeWidth="0.8" />
                              <line x1={String(63 + i * 4)} y1="151" x2={String(63 + i * 4)} y2="156" stroke="#e2e8f0" strokeWidth="0.8" />
                            </g>
                          ))}
                          <circle cx="64" cy="101" r="1.5" fill="#ca8a04" />
                          <text x="86" y="127" fill="#e2e8f0" fontSize="8" fontWeight="800" textAnchor="middle" letterSpacing="0.05em">ATMEGA</text>

                          {/* RX/TX blinkers */}
                          <circle cx="28" cy="65" r="3" fill={serialBlinkTx ? "#ef4444" : "#450a0a"} stroke={serialBlinkTx ? "#f87171" : "#1e0000"} strokeWidth="0.5" />
                          <text x="36" y="68" fill="#94a3b8" fontSize="6" fontWeight="700">TX</text>
                          <circle cx="28" cy="77" r="3" fill={serialBlinkRx ? "#10b981" : "#022c22"} stroke={serialBlinkRx ? "#34d399" : "#021e14"} strokeWidth="0.5" />
                          <text x="36" y="80" fill="#94a3b8" fontSize="6" fontWeight="700">RX</text>

                          {/* Golden header pin blocks */}
                          <rect x="6" y="20" width="10" height="225" fill="#0f172a" stroke="#334155" rx="1" />
                          {Array.from({ length: 22 }).map((_, i) => (
                            <circle key={i} cx="11" cy={28 + i * 10} r="1.5" fill="#ca8a04" />
                          ))}
                          <text x="20" y="28" fill="rgba(255,255,255,0.4)" fontSize="6">D0-D21</text>

                          <rect x="154" y="20" width="10" height="225" fill="#0f172a" stroke="#334155" rx="1" />
                          {Array.from({ length: 22 }).map((_, i) => (
                            <circle key={i} cx="159" cy={28 + i * 10} r="1.5" fill="#ca8a04" />
                          ))}
                          <text x="148" y="28" fill="rgba(255,255,255,0.4)" fontSize="6" textAnchor="end">D22-D53</text>

                          <text x="85" y="246" fill="#f8fafc" fontSize="10" fontWeight="900" textAnchor="middle" letterSpacing="0.08em">ARDUINO MEGA 2560</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">Arduino Mega 2560</div>
                            Central controller unit reading physical sensors and driving SG90 sweeps. Connects to ESP32 over serial line TX1/RX1.
                          </div>
                        </g>

                        {/* COMPONENT 2: [NEW] ESP32 DEVKIT V1 BRIDGE */}
                        <g transform="translate(270, 240)" className="interactive-component">
                          {/* Board PCB substrate */}
                          <rect width="110" height="160" fill="url(#esp32-pcb-grad)" stroke="#292524" strokeWidth="2.5" rx="6" />
                          <rect x="4" y="4" width="102" height="152" fill="none" stroke="rgba(255,255,255,0.12)" rx="5" />

                          {/* ESP32 WROOM metal shield module */}
                          <rect x="30" y="15" width="50" height="60" fill="url(#silver-metallic-grad)" stroke="#475569" strokeWidth="1" rx="3" />
                          <rect x="38" y="17" width="34" height="24" fill="none" stroke="#64748b" strokeWidth="0.8" />
                          <text x="55" y="26" fill="#1e293b" fontSize="5" fontWeight="900" textAnchor="middle">ESP-WROOM-32</text>
                          <text x="55" y="32" fill="#334155" fontSize="4.5" textAnchor="middle">FCC ID: 2AC7Z-ESPWROOM32</text>

                          {/* WiFi wavy antenna lines on PCB head */}
                          <path d="M 32 10 L 78 10 L 78 5 L 32 5 Z" fill="#0f172a" />
                          <path d="M 35 12 L 40 8 L 45 12 L 50 8 L 55 12 L 60 8 L 65 12 L 70 8 L 75 12" stroke="#e2e8f0" strokeWidth="0.8" fill="none" />

                          {/* Dual inline header sockets */}
                          <rect x="6" y="20" width="10" height="130" fill="#0f172a" rx="1" />
                          <rect x="94" y="20" width="10" height="130" fill="#0f172a" rx="1" />
                          {Array.from({ length: 12 }).map((_, i) => (
                            <g key={i}>
                              <circle cx="11" cy={26 + i * 11} r="1.5" fill="#ca8a04" />
                              <circle cx="99" cy={26 + i * 11} r="1.5" fill="#ca8a04" />
                            </g>
                          ))}

                          {/* Status/WiFi Connection glowing LED */}
                          <circle cx="22" cy="115" r="4.5" fill={
                            !isPowerOn ? "#1e293b" :
                            !isWiFiActive ? "#ef4444" : // Red for wifi disconnected
                            (depositStep === 'firebase' ? "#3b82f6" : "#10b981") // Blue for upload ping, green for connected idle
                          } className={isPowerOn && isWiFiActive && depositStep === 'firebase' ? "pulse-indicator" : ""} />
                          <text x="22" y="127" fill="#78716c" fontSize="5" fontWeight="800" textAnchor="middle">WIFI LED</text>

                          {/* RX/TX blinks for bridge Uart */}
                          <circle cx="88" cy="115" r="2.5" fill={espSerialBlinkRx ? "#10b981" : "#062f19"} />
                          <circle cx="88" cy="123" r="2.5" fill={espSerialBlinkTx ? "#ef4444" : "#4c050a"} />
                          <text x="78" y="121" fill="#78716c" fontSize="5" fontWeight="700">RX2/TX2</text>

                          {/* Micro USB Port */}
                          <rect x="42" y="146" width="26" height="15" fill="url(#silver-metallic-grad)" stroke="#475569" rx="1.5" />

                          <text x="55" y="92" fill="#fff" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.05em">ESP32 DEVKIT</text>
                          <text x="55" y="99" fill="var(--color-green)" fontSize="6" fontWeight="700" textAnchor="middle">
                            {isWiFiActive ? "ONLINE" : `OFFLINE (${offlineQueueCount})`}
                          </text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">ESP32 DevKit V1</div>
                            IoT bridge board. Receives telemetry packets from Mega TX1, buffers offline events if WiFi drops, and patches documents securely to Firestore when online.
                          </div>
                        </g>

                        {/* COMPONENT 3: [NEW] TCRT5000 IR REFLECTIVE SENSOR */}
                        <g transform="translate(250, 40)" className="interactive-component">
                          {/* Board substrate */}
                          <rect width="80" height="60" fill="#1e3a8a" stroke="#2563eb" strokeWidth="1.5" rx="4" />
                          <rect x="4" y="4" width="72" height="52" fill="none" stroke="rgba(255,255,255,0.12)" rx="2" />

                          {/* Black Emitter and Blue photodiode pointing down (drawn side by side) */}
                          <rect x="25" y="-12" width="12" height="15" fill="#1e293b" stroke="#475569" rx="1" />
                          <circle cx="31" cy="-12" r="3.5" fill="#0f172a" stroke="#475569" /> {/* Emitter */}
                          
                          <rect x="43" y="-12" width="12" height="15" fill="#1e293b" stroke="#475569" rx="1" />
                          <circle cx="49" cy="-12" r="3.5" fill="#3b82f6" stroke="#2563eb" /> {/* Photodiode */}

                          {/* Blue trim potentiometer screw */}
                          <rect x="10" y="20" width="15" height="15" fill="#2563eb" rx="1.5" />
                          <circle cx="17.5" cy="27.5" r="3" fill="url(#brass-screw-grad)" stroke="#a16207" strokeWidth="0.5" />

                          <text x="50" y="28" fill="#fff" fontSize="6.5" fontWeight="900">TCRT5000</text>
                          <text x="50" y="36" fill="#93c5fd" fontSize="5.5" fontWeight="700">IR ENTRY</text>

                          {/* Status indicator line glow */}
                          <circle cx="40" cy="48" r="3.5" fill={sensorIRActive ? "#ef4444" : "#1e293b"} />

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">TCRT5000 IR Sensor</div>
                            Reflective optical sensor mounted inside the entry collar. Uses a 950nm IR emitter to spot bottle entry (breaks D11 threshold).
                          </div>
                        </g>

                        {/* COMPONENT 4: [NEW] HC-SR04 ULTRASONIC SENSOR */}
                        <g transform="translate(250, 135)" className="interactive-component">
                          {/* Board substrate */}
                          <rect width="95" height="65" fill="#0369a1" stroke="#0284c7" strokeWidth="1.5" rx="4" />
                          <rect x="4" y="4" width="87" height="57" fill="none" stroke="rgba(255,255,255,0.12)" rx="2" />

                          {/* Two large steel eyes (Transducer cylinders) */}
                          <circle cx="28" cy="25" r="18" fill="url(#steel-metallic-grad)" stroke="#475569" strokeWidth="1" />
                          <circle cx="28" cy="25" r="14" fill="#0f172a" />
                          <text x="28" y="28" fill="#334155" fontSize="8" fontWeight="800" textAnchor="middle">T</text>

                          <circle cx="68" cy="25" r="18" fill="url(#steel-metallic-grad)" stroke="#475569" strokeWidth="1" />
                          <circle cx="68" cy="25" r="14" fill="#0f172a" />
                          <text x="68" y="28" fill="#334155" fontSize="8" fontWeight="800" textAnchor="middle">R</text>

                          {/* Crystal and pins */}
                          <rect x="44" y="48" width="8" height="12" fill="url(#silver-metallic-grad)" rx="2" />
                          <text x="48" y="58" fill="#fff" fontSize="5" textAnchor="middle">HC-SR04</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">HC-SR04 Ultrasonic</div>
                            Dustbin level sensor. Emits high-frequency ultrasonic waves (Trig D22) and reads return pulse (Echo D23) to measure depth in CM.
                          </div>
                        </g>

                        {/* COMPONENT 5: LM2596 BUCK REGULATOR 1 */}
                        <g transform="translate(430, 40)" className="interactive-component">
                          <rect width="115" height="70" fill="url(#buck-pcb-grad)" stroke="#0284c7" strokeWidth="1.8" rx="6" />
                          <rect x="4" y="4" width="107" height="62" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" rx="4" />

                          {/* Gold Toroidal Inductor coil */}
                          <circle cx="22" cy="24" r="13" fill="none" stroke="url(#copper-toroid-grad)" strokeWidth="4" />
                          <circle cx="22" cy="24" r="9" fill="#78350f" stroke="#000" strokeWidth="0.8" />

                          {/* Electrolyte Capacitor cylinder */}
                          <rect x="6" y="44" width="14" height="20" fill="url(#capacitor-grad)" stroke="#475569" rx="1.5" />
                          <ellipse cx="13" cy="44" rx="7" ry="2.5" fill="#94a3b8" stroke="#cbd5e1" strokeWidth="0.5" />

                          {/* Potentiometer adjustment dial */}
                          <rect x="85" y="6" width="16" height="16" fill="#1d4ed8" stroke="#172554" rx="1.5" />
                          <circle cx="93" cy="14" r="3.2" fill="url(#brass-screw-grad)" stroke="#ca8a04" strokeWidth="0.5" />
                          <line x1="91" y1="12" x2="95" y2="16" stroke="#451a03" strokeWidth="0.8" />

                          {/* glowing segment display output */}
                          <rect x="44" y="34" width="52" height="24" fill="#000" rx="3" stroke="#334155" strokeWidth="1" />
                          <text x="70" y="51" fill={isPowerOn ? "#ef4444" : "#2d0606"} fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="monospace" textShadow={isPowerOn ? "0 0 5px #ef4444" : "none"}>
                            {isPowerOn ? "7.58" : "0.00"}
                          </text>

                          <text x="65" y="14" fill="#e0f2fe" fontSize="6.5" fontWeight="800" textAnchor="middle">LM2596 SENSORS</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">LM2596 Buck Regulator 1</div>
                            Dedicated sensor step-down power rail. Drops raw 12V inputs down to a stable 7.58V required to trigger LJC18A3 proximity sensors accurately.
                          </div>
                        </g>

                        {/* COMPONENT 6: LM2596 BUCK REGULATOR 2 */}
                        <g transform="translate(430, 135)" className="interactive-component">
                          <rect width="115" height="70" fill="url(#buck-pcb-grad)" stroke="#0284c7" strokeWidth="1.8" rx="6" />
                          <rect x="4" y="4" width="107" height="62" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" rx="4" />

                          <circle cx="22" cy="24" r="13" fill="none" stroke="url(#copper-toroid-grad)" strokeWidth="4" />
                          <circle cx="22" cy="24" r="9" fill="#78350f" stroke="#000" strokeWidth="0.8" />

                          <rect x="6" y="44" width="14" height="20" fill="url(#capacitor-grad)" stroke="#475569" rx="1.5" />
                          <ellipse cx="13" cy="44" rx="7" ry="2.5" fill="#94a3b8" stroke="#cbd5e1" strokeWidth="0.5" />

                          <rect x="85" y="6" width="16" height="16" fill="#1d4ed8" stroke="#172554" rx="1.5" />
                          <circle cx="93" cy="14" r="3.2" fill="url(#brass-screw-grad)" stroke="#ca8a04" strokeWidth="0.5" />
                          <line x1="91" y1="12" x2="95" y2="16" stroke="#451a03" strokeWidth="0.8" />

                          <rect x="44" y="34" width="52" height="24" fill="#000" rx="3" stroke="#334155" strokeWidth="1" />
                          <text x="70" y="51" fill={isPowerOn ? "#ef4444" : "#2d0606"} fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="monospace" textShadow={isPowerOn ? "0 0 5px #ef4444" : "none"}>
                            {isPowerOn ? "5.00" : "0.00"}
                          </text>

                          <text x="65" y="14" fill="#e0f2fe" fontSize="6.5" fontWeight="800" textAnchor="middle">LM2596 SERVOS</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">LM2596 Buck Regulator 2</div>
                            Dedicated servo step-down power rail. Drops raw 12V inputs down to 5.00V to deliver high-amperage feeds required to sweep SG90 servos.
                          </div>
                        </g>

                        {/* COMPONENT 7: BREADBOARD VOLTAGE DIVIDERS */}
                        <g transform="translate(270, 430)" className="interactive-component">
                          {/* White breadboard substrate */}
                          <rect width="110" height="75" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2.5" rx="5" />
                          <line x1="5" y1="8" x2="105" y2="8" stroke="#ef4444" strokeWidth="0.8" />
                          <line x1="5" y1="67" x2="105" y2="67" stroke="#2563eb" strokeWidth="0.8" />

                          {/* Resistor dividers pair */}
                          <g transform="translate(15, 20)">
                            <line x1="-5" y1="5" x2="35" y2="5" stroke="#cbd5e1" strokeWidth="1" />
                            <rect width="25" height="10" fill="#fed7aa" stroke="#f97316" rx="2.5" />
                            <rect x="4" y="0" width="2" height="10" fill="#78350f" /> {/* Brown */}
                            <rect x="8" y="0" width="2" height="10" fill="#000" />    {/* Black */}
                            <rect x="12" y="0" width="2" height="10" fill="#ea580c" />   {/* Orange */}
                            <rect x="18" y="0" width="2" height="10" fill="#ca8a04" />   {/* Gold */}
                          </g>

                          <g transform="translate(65, 20)">
                            <line x1="-5" y1="5" x2="35" y2="5" stroke="#cbd5e1" strokeWidth="1" />
                            <rect width="25" height="10" fill="#fed7aa" stroke="#f97316" rx="2.5" />
                            <rect x="4" y="0" width="2" height="10" fill="#78350f" />
                            <rect x="8" y="0" width="2" height="10" fill="#000" />
                            <rect x="12" y="0" width="2" height="10" fill="#ea580c" />
                            <rect x="18" y="0" width="2" height="10" fill="#ca8a04" />
                          </g>

                          {/* Serial 1k/2k divider resistors */}
                          <g transform="translate(15, 45)">
                            <line x1="-5" y1="5" x2="35" y2="5" stroke="#cbd5e1" strokeWidth="1" />
                            <rect width="25" height="10" fill="#fed7aa" stroke="#3b82f6" rx="2.5" />
                            <rect x="4" y="0" width="2" height="10" fill="#78350f" /> {/* Brown */}
                            <rect x="8" y="0" width="2" height="10" fill="#000" />    {/* Black */}
                            <rect x="12" y="0" width="2" height="10" fill="#ea580c" />   {/* Red */}
                            <rect x="18" y="0" width="2" height="10" fill="#ca8a04" />   {/* Gold */}
                          </g>

                          <text x="55" y="62" fill="#64748b" fontSize="6.5" fontWeight="900" textAnchor="middle">VOLTAGE DIVIDERS</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">Voltage Divider Board</div>
                            10kΩ/10kΩ proximity dividers and 1kΩ/2kΩ serial dividers. Splits high-voltage peak signals down to safe operational logic levels readable by Mega / ESP32.
                          </div>
                        </g>

                        {/* COMPONENT 8: SG90 SERVO GATE */}
                        <g transform="translate(730, 30)" className="interactive-component">
                          <rect width="54" height="54" fill="rgba(37, 99, 235, 0.9)" stroke="#1d4ed8" strokeWidth="1.8" rx="6" />
                          <circle cx="27" cy="27" r="14" fill="rgba(245, 158, 11, 0.3)" stroke="rgba(217, 119, 6, 0.3)" strokeWidth="0.8" />
                          <circle cx="27" cy="27" r="10" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />

                          {/* Dynamic horn sweep animation */}
                          <g transform={`rotate(${gateAngle}, 27, 27)`} className="servo-arm">
                            <path d="M 24 27 L 24 -15 A 3 3 0 0 1 30 -15 L 30 27 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.5" />
                            <circle cx="27" cy="-10" r="1.5" fill="#475569" />
                            <circle cx="27" cy="27" r="3" fill="#94a3b8" />
                          </g>
                          <text x="27" y="48" fill="#fff" fontSize="8" fontWeight="900" textAnchor="middle">GATE</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">SG90 Servo Gate (D9)</div>
                            High-speed rotary servo sweeping plastic bottles down the intake hopper, or keeping locked for metal cans.
                          </div>
                        </g>

                        {/* COMPONENT 9: SG90 REWARD SERVO */}
                        <g transform="translate(730, 120)" className="interactive-component">
                          <rect width="54" height="54" fill="rgba(37, 99, 235, 0.9)" stroke="#1d4ed8" strokeWidth="1.8" rx="6" />
                          <circle cx="27" cy="27" r="14" fill="rgba(245, 158, 11, 0.3)" stroke="rgba(217, 119, 6, 0.3)" strokeWidth="0.8" />
                          <circle cx="27" cy="27" r="10" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />

                          <g transform={`rotate(${penAngle}, 27, 27)`} className="servo-arm">
                            <path d="M 24 27 L 24 -15 A 3 3 0 0 1 30 -15 L 30 27 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.5" />
                            <circle cx="27" cy="-10" r="1.5" fill="#475569" />
                            <circle cx="27" cy="27" r="3" fill="#94a3b8" />
                          </g>
                          <text x="27" y="48" fill="#fff" fontSize="8" fontWeight="900" textAnchor="middle">REWARD</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">SG90 Servo Reward (D10)</div>
                            Dual share-drive dispenser servos. Sweeps holding frame to release a reward pen for accepted recyclables.
                          </div>
                        </g>

                        {/* COMPONENT 10: LJC18A3 CAPACITIVE PROXIMITY SENSOR */}
                        <g transform="translate(730, 260)" className="interactive-component">
                          {/* metallic sleeve cylinder */}
                          <rect x="14" y="14" width="28" height="34" fill="url(#steel-metallic-grad)" stroke="#475569" strokeWidth="0.8" />
                          {Array.from({ length: 6 }).map((_, i) => (
                            <line key={i} x1="14" y1={String(20 + i * 5)} x2="42" y2={String(20 + i * 5)} stroke="#334155" strokeWidth="0.8" />
                          ))}
                          
                          {/* clamping brass hex nuts */}
                          <rect x="10" y="24" width="36" height="6" fill="url(#brass-screw-grad)" stroke="#a16207" rx="1.5" />

                          {/* red capacitive face cover */}
                          <rect x="18" y="2" width="20" height="12" fill="#e11d48" rx="1" />

                          {/* signal indicator glow */}
                          <circle cx="28" cy="30" r="8" fill={sensorCapActive ? "#10b981" : "#1e293b"} stroke="#fff" strokeWidth="0.5" />
                          <text x="28" y="33" fill="#fff" fontSize="7.5" fontWeight="900" textAnchor="middle">CAP</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">LJC18A3 Capacitive Sensor</div>
                            Proximity switch calibrated to 7.58V power. Uses electric field shifts to detect non-metallic density (plastic bottle thickness).
                          </div>
                        </g>

                        {/* COMPONENT 11: LJ12A3 INDUCTIVE PROXIMITY SENSOR */}
                        <g transform="translate(730, 360)" className="interactive-component">
                          <rect x="17" y="14" width="22" height="34" fill="url(#steel-metallic-grad)" stroke="#475569" strokeWidth="0.8" />
                          {Array.from({ length: 6 }).map((_, i) => (
                            <line key={i} x1="17" y1={String(20 + i * 5)} x2="39" y2={String(20 + i * 5)} stroke="#334155" strokeWidth="0.8" />
                          ))}

                          <rect x="13" y="24" width="30" height="6" fill="url(#brass-screw-grad)" stroke="#a16207" rx="1.5" />

                          {/* yellow inductive plastic cap face */}
                          <rect x="20" y="2" width="16" height="12" fill="#eab308" rx="1" />

                          <circle cx="28" cy="30" r="8" fill={sensorIndActive ? "#ef4444" : "#1e293b"} stroke="#fff" strokeWidth="0.5" />
                          <text x="28" y="33" fill="#fff" fontSize="7.5" fontWeight="900" textAnchor="middle">IND</text>

                          <div className="rvm-tooltip">
                            <div className="rvm-tooltip-header">LJ12A3 Inductive Sensor</div>
                            Proximity switch. Detects electromagnetic field disturbances to identify high magnetic metallic targets (metal cans).
                          </div>
                        </g>
                      </svg>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 3. LIVE EVENTS FEED */}
          {activeTab === 'events' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h3 style={{ fontSize: '1.2rem' }}>Chronological UART Event Ingestion</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Total events stored: {events.length}
                </span>
              </div>

              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Origin Machine</th>
                      <th>Event Type</th>
                      <th>Accepted PET</th>
                      <th>Rejected Cans</th>
                      <th>Dispensed Rewards</th>
                      <th>Bin Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>{e.timestamp ? e.timestamp.toLocaleString() : 'N/A'}</td>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>RVM001</span></td>
                        <td>
                          <span style={{
                            background: e.type === 'PET_ACCEPTED' ? 'rgba(16, 185, 129, 0.1)' : 
                                        e.type === 'METAL_REJECTED' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                            color: e.type === 'PET_ACCEPTED' ? 'var(--color-green)' : 
                                   e.type === 'METAL_REJECTED' ? 'var(--color-red)' : 'var(--text-muted)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {e.type}
                          </span>
                        </td>
                        <td>{e.acceptedCount}</td>
                        <td>{e.rejectedCount}</td>
                        <td>{e.penCount || 0}</td>
                        <td>
                          <span style={{ color: e.binFull ? 'var(--color-red)' : 'var(--color-green)' }}>
                            {e.binFull ? "FULL" : "OK"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. ALERTS / NOTIFICATIONS */}
          {activeTab === 'alerts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* Critical Alerts List */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>Open Malfunctions & Alerts</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {alerts.filter(a => a.status === 'open').length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      <CheckCircle2 size={40} style={{ color: 'var(--color-green)', marginBottom: 12 }} />
                      <p>All clear! There are currently no active warnings or structural alarms logged.</p>
                    </div>
                  ) : (
                    alerts.filter(a => a.status === 'open').map(alert => (
                      <div key={alert.id} className="glass-panel" style={{
                        padding: '20px',
                        borderLeft: `5px solid ${alert.severity === 'critical' ? 'var(--color-red)' : 'var(--color-amber)'}`,
                        background: 'rgba(255,255,255,0.01)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                          <AlertTriangle size={24} style={{ color: alert.severity === 'critical' ? 'var(--color-red)' : 'var(--color-amber)' }} />
                          <div>
                            <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                              {alert.type === 'BIN_FULL' ? 'COLLECTION DUSTBIN AT CAPACITY' : 
                               alert.type === 'LOW_REWARD_STOCK' ? 'REWARD PENS STOCK LOW (<10%)' : 'SYSTEM MALFUNCTION ALARM'}
                            </span>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              Severity: <strong style={{ color: alert.severity === 'critical' ? 'var(--color-red)' : 'var(--color-amber)' }}>{alert.severity.toUpperCase()}</strong> | 
                              Logged: {alert.createdAt.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <button 
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            className="btn-secondary" 
                            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                          >
                            Acknowledge
                          </button>
                          <button 
                            onClick={() => handleResolveAlert(alert.id)}
                            className="btn-primary" 
                            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                          >
                            Resolve Alert
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Resolved Alerts List */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>Resolved Historical Alarms</h3>

                <div className="table-container">
                  <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Date Triggered</th>
                        <th>Alert Type</th>
                        <th>Severity</th>
                        <th>Date Resolved</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.filter(a => a.status === 'resolved' || a.status === 'acknowledged').map(a => (
                        <tr key={a.id}>
                          <td>{a.createdAt.toLocaleString()}</td>
                          <td><strong>{a.type}</strong></td>
                          <td style={{ color: a.severity === 'critical' ? 'var(--color-red)' : 'var(--color-amber)' }}>
                            {a.severity.toUpperCase()}
                          </td>
                          <td>{a.resolvedAt ? a.resolvedAt.toLocaleString() : 'Acknowledged'}</td>
                          <td>
                            <span style={{
                              color: 'var(--color-green)',
                              fontSize: '0.8rem',
                              fontWeight: 600
                            }}>
                              Resolved
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. DATA ANALYTICS */}
          {activeTab === 'analytics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* Analytics Top widgets */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                
                {/* Large Line graph */}
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h3 style={{ fontSize: '1.2rem' }}>PET Bottles Recycled Trend (Monthly)</h3>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={handleExportCSV} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                        <Download size={14} /> Export CSV
                      </button>
                      <button onClick={handleExportPDFMock} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                        <FileText size={14} /> PDF Report
                      </button>
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '240px' }}>
                    <svg viewBox="0 0 500 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="160" x2="500" y2="160" stroke="rgba(255,255,255,0.05)" />
                      <line x1="0" y1="190" x2="500" y2="190" stroke="rgba(255,255,255,0.1)" />

                      <path
                        d="M 10 150 L 80 120 L 150 160 L 220 90 L 290 140 L 360 70 L 430 40 L 490 20"
                        fill="none"
                        stroke="var(--color-green)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      
                      <circle cx="430" cy="40" r="5" fill="var(--color-green)" />
                      <circle cx="490" cy="20" r="5" fill="var(--color-green)" />

                      {INITIAL_HISTORICAL_DATA.map((d, i) => (
                        <text key={i} x={10 + i * 80} y="210" fill="var(--text-muted)" fontSize="10" textAnchor="middle">
                          {d.date}
                        </text>
                      ))}
                    </svg>
                  </div>
                </div>

                {/* Efficiency metrics circular charts */}
                <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Recycling Efficiency</h3>

                  <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
                    {/* Simulated Donut Chart */}
                    <div style={{
                      width: 120,
                      height: 120,
                      borderRadius: '50%',
                      background: 'conic-gradient(var(--color-green) 0% 78%, var(--color-red) 78% 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}>
                      <div style={{
                        width: 90,
                        height: 90,
                        borderRadius: '50%',
                        background: 'var(--bg-base)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-green)' }}>78.9%</span>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>PET BOTTLES</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Total Plastic Accepted:</span>
                      <span style={{ fontWeight: 600 }}>{machine.acceptedCount} units</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Total Metal Rejected:</span>
                      <span style={{ fontWeight: 600 }}>{machine.rejectedCount} units</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary table */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>Recycling Database Log Rollups</h3>
                
                <div className="table-container">
                  <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Date Range</th>
                        <th>Device Name</th>
                        <th>Plastic Waste Accepted</th>
                        <th>Metal Blocked</th>
                        <th>Rewards Claims</th>
                        <th>Efficiency Index</th>
                      </tr>
                    </thead>
                    <tbody>
                      {INITIAL_HISTORICAL_DATA.map((h, i) => {
                        const totalVal = h.accepted + h.rejected;
                        const indexVal = ((h.accepted / totalVal) * 100).toFixed(1);
                        return (
                          <tr key={i}>
                            <td>{h.date}, 2026</td>
                            <td>RVM001</td>
                            <td><strong style={{ color: 'var(--color-green)' }}>{h.accepted} items</strong></td>
                            <td><strong style={{ color: 'var(--color-red)' }}>{h.rejected} items</strong></td>
                            <td>{h.pens} items</td>
                            <td>{indexVal}% Plastic</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 6. USERS & ROLES PAGE */}
          {activeTab === 'users' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h3 style={{ fontSize: '1.2rem' }}>Portal User Accounts</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Only logged-in **Admin** can edit clearances.
                </span>
              </div>

              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Email Address</th>
                      <th>Assigned Role</th>
                      <th>Authorized Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.uid}>
                        <td><strong>{u.name}</strong></td>
                        <td>{u.email}</td>
                        <td>
                          <span style={{
                            background: u.role === 'admin' ? 'rgba(59, 130, 246, 0.1)' : 
                                        u.role === 'supervisor' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
                            color: u.role === 'admin' ? 'var(--color-blue)' : 
                                   u.role === 'supervisor' ? 'var(--color-green)' : 'var(--text-muted)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          {currentUser.role === 'admin' && currentUser.uid !== u.uid ? (
                            <select 
                              value={u.role} 
                              onChange={e => handleUpdateRole(u.uid, e.target.value)}
                              className="form-input"
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            >
                              <option value="admin">Admin</option>
                              <option value="supervisor">Supervisor</option>
                              <option value="technician">Technician</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Immutable Clearance</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. MACHINE SETTINGS PAGE */}
          {activeTab === 'settings' && (
            <div className="glass-panel" style={{ padding: '28px', maxWidth: '600px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: 24 }}>Hardware Calibrations Settings</h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                handleSaveSettings(e.target.threshold.value, e.target.interval.value);
              }} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Bin Full Ultrasonic Threshold (CM)</label>
                  <input 
                    type="number" 
                    name="threshold"
                    className="form-input" 
                    defaultValue={settings.binFullThresholdCm}
                    min={3}
                    max={50}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Trigger full lockout when bin content distance is equal to or less than this value (Tuned to machine bin height).
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Heartbeat Diagnostics Interval (ms)</label>
                  <input 
                    type="number" 
                    name="interval"
                    className="form-input" 
                    defaultValue={settings.heartbeatInterval}
                    min={5000}
                    max={120000}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Frequence interval at which Arduino Mega pushes SYSTEM_HEARTBEAT packets to maintain web online monitoring.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-primary)', paddingTop: 20 }}>
                  <button type="submit" className="btn-primary">
                    Sync Configurations
                  </button>
                </div>
              </form>

              {/* Dynamic Firebase configuration injector panel */}
              <div className="glass-panel" style={{ padding: '20px', marginTop: 40, borderStyle: 'dashed', borderColor: 'var(--color-blue)' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--color-blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={16} /> Live Firebase Credentials Injector
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  Connect this React Dashboard to your own live Firebase database! Fill in your Web App config credentials below, and the app will instantly bind live Firestore document listeners.
                </p>

                {fbConfig ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: 12, borderRadius: 4 }}>
                      <CheckCircle2 size={14} style={{ color: 'var(--color-green)' }} /> <strong>Active Connection:</strong> Connected to project <code>{fbConfig.projectId}</code>
                    </div>
                    <button onClick={handleClearFirebaseConfig} className="btn-secondary" style={{ color: 'var(--color-red)', borderColor: 'var(--color-red)', padding: '6px 12px', fontSize: '0.8rem', justifyContent: 'center' }}>
                      Disconnect & Use Simulator
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSaveFirebaseConfig} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input type="text" name="apiKey" placeholder="apiKey" required className="form-input" style={{ padding: 6, fontSize: '0.75rem' }} />
                      <input type="text" name="authDomain" placeholder="authDomain" required className="form-input" style={{ padding: 6, fontSize: '0.75rem' }} />
                      <input type="text" name="projectId" placeholder="projectId" required className="form-input" style={{ padding: 6, fontSize: '0.75rem' }} />
                      <input type="text" name="storageBucket" placeholder="storageBucket" required className="form-input" style={{ padding: 6, fontSize: '0.75rem' }} />
                      <input type="text" name="messagingSenderId" placeholder="messagingSenderId" required className="form-input" style={{ padding: 6, fontSize: '0.75rem' }} />
                      <input type="text" name="appId" placeholder="appId" required className="form-input" style={{ padding: 6, fontSize: '0.75rem' }} />
                    </div>
                    <button type="submit" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', justifyContent: 'center' }}>
                      Inject Connection
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* 8. MAINTENANCE LOG PAGE */}
          {activeTab === 'maintenance' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '30px' }}>
              
              {/* Form to submit maintenance */}
              <div className="glass-panel" style={{ padding: '28px', height: 'fit-content' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: 20 }}>Submit Maintenance Entry</h3>
                
                <form onSubmit={(e) => {
                  e.preventDefault();
                  handleAddMaintenance(e.target.actionText.value);
                  e.target.reset();
                }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Assigned Technician</label>
                    <input type="text" className="form-input" value={currentUser.name} readOnly style={{ background: 'rgba(255,255,255,0.03)' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Maintenance Tasks Completed</label>
                    <textarea 
                      name="actionText" 
                      className="form-input" 
                      placeholder="e.g. Cleared stuck plastic bottle from intake, refilled pen reward inventory."
                      rows={4}
                      required
                      style={{ resize: 'none' }}
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
                    File Maintenance Record
                  </button>
                </form>
              </div>

              {/* Maintenance Log history */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: 20 }}>Historical Field Services</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {maintenanceLogs.map(m => (
                    <div key={m.id} className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ color: 'var(--color-blue)', fontSize: '0.9rem' }}>{m.technician}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.date.toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {m.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 9. SHIELD AUDIT PAGE */}
          {activeTab === 'audit' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h3 style={{ fontSize: '1.2rem' }}>Immutable Security Log</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Total audit lines: {auditLogs.length}
                </span>
              </div>

              <div className="table-container">
                <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor Operator</th>
                      <th>Trigger Action</th>
                      <th>Operation Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.timestamp.toLocaleString()}</td>
                        <td><strong style={{ color: 'var(--color-blue)' }}>{log.actor}</strong></td>
                        <td>
                          <span style={{
                            background: 'rgba(59, 130, 246, 0.08)',
                            color: 'var(--color-blue)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td>{log.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
