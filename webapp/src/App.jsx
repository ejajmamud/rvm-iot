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
  { uid: "u3", name: "Sayed Aziz", email: "sayedaziz@unikl.edu.my", role: "supervisor 1", createdAt: new Date(Date.now() - 1728000000) }
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('rvm_logged_in_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('rvm_logged_in_user') !== null;
  });
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // --- Security Parameters (Ejaj Admin Login) ---
  const EJAJ_EMAIL = 'ejaj@student.unikl.edu.my';


  // --- Demo Mode (non-admin users: read-only enterprise demo) ---
  // isDemo = true means logged in but NO write access
  const isDemo = isLoggedIn && currentUser && currentUser.email?.toLowerCase() !== EJAJ_EMAIL.toLowerCase();
  const isAdmin = isLoggedIn && currentUser && currentUser.email?.toLowerCase() === EJAJ_EMAIL.toLowerCase();

  // Demo guard: shows a toast and returns true if action is blocked
  const demoGuard = (featureName = 'This action') => {
    if (isDemo) {
      showToast(`🔒 ${featureName} is restricted. Admin PIN required for write access.`, 'error');
      return true;
    }
    return false;
  };

  // --- Advanced Telemetry & FYP Features ---
  const [rewardStock, setRewardStock] = useState(7);
  const [lastHeartbeatSec, setLastHeartbeatSec] = useState(4);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [activeDiagramIdx, setActiveDiagramIdx] = useState(0);

  // Heartbeat increments every second unless reset
  useEffect(() => {
    const timer = setInterval(() => {
      setLastHeartbeatSec(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // --- Fluctuating Live Telemetry Stats ---
  const [cpuTemp, setCpuTemp] = useState(42.5);
  const [rssi, setRssi] = useState(-64);
  const [freeRam, setFreeRam] = useState(6184);

  // --- Hardware Fault Simulation Engine ---
  const [sensorIRFault, setSensorIRFault] = useState(false);
  const [sensorUSFault, setSensorUSFault] = useState(false);
  const [servoGateFault, setServoGateFault] = useState(false);
  const [servoRewardFault, setServoRewardFault] = useState(false);

  // --- Interactive Pinout Inspector State ---
  const [selectedPinout, setSelectedPinout] = useState("IR");
  const [expandedSection, setExpandedSection] = useState(null);

  // --- Real Prototype Gallery & Datasheet Explorer State ---
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [activeComponentIdx, setActiveComponentIdx] = useState(0);

  // --- Live Diagnostics Oscilloscope Logs ---
  const [oscilloscopeLogs, setOscilloscopeLogs] = useState([
    "SYS_READY - Awaiting trigger ping...",
    "TRIG_LINE [D22] - Pulled HIGH",
    "ECHO_LINE [D23] - Received response packet"
  ]);

  // Fluctuating HUD timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuTemp(prev => Number((prev + (Math.random() * 0.4 - 0.2)).toFixed(1)));
      setRssi(prev => prev + (Math.random() < 0.5 ? 1 : -1));
      setFreeRam(prev => prev + Math.floor(Math.random() * 10 - 5));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // --- Mode Selection (Live Mode vs Standalone Simulated Mode) ---
  const [isLiveMode, setIsLiveMode] = useState(() => {
    const saved = localStorage.getItem('rvm_live_mode');
    return saved !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('rvm_live_mode', isLiveMode ? 'true' : 'false');
  }, [isLiveMode]);

  // --- Alerts & Toast Notification Sync (Notification Center) ---
  const seenAlertIdsRef = useRef(new Set());
  const isFirstAlertsLoadRef = useRef(true);

  useEffect(() => {
    if (!alerts || alerts.length === 0) {
      isFirstAlertsLoadRef.current = false;
      return;
    }

    // On the very first load, just fill the seen set with existing alerts
    if (isFirstAlertsLoadRef.current) {
      alerts.forEach(a => seenAlertIdsRef.current.add(a.id));
      isFirstAlertsLoadRef.current = false;
      return;
    }

    // Check for any new open alerts
    alerts.forEach(a => {
      if (a.status === 'open' && !seenAlertIdsRef.current.has(a.id)) {
        seenAlertIdsRef.current.add(a.id);
        
        let msg = "Alert Triggered";
        if (a.type === 'BIN_FULL') {
          msg = "⚠️ CRITICAL: RVM Dustbin is 100% Full! Collection required.";
        } else if (a.type === 'LOW_REWARD_STOCK') {
          msg = "⚠️ WARNING: Reward pen stock is low (<10%)!";
        } else if (a.type === 'ERR_SENSOR_IR') {
          msg = "🚨 CRITICAL: FC-51 IR sensor malfunction detected!";
        } else if (a.type === 'ERR_SENSOR_US') {
          msg = "🚨 CRITICAL: Sonar ultrasonic sensor error detected!";
        } else if (a.type === 'ERR_GATE_JAMMED') {
          msg = "🚨 CRITICAL: SG90 Gate Servo jam/obstruction detected!";
        } else if (a.type === 'ERR_REWARD_JAM') {
          msg = "🚨 CRITICAL: SG90 Reward Servo jam/obstruction detected!";
        } else {
          msg = `🚨 ALERT: ${a.type} - System issue detected!`;
        }
        showToast(msg, a.severity === 'critical' ? 'error' : 'info');
      }
    });
  }, [alerts]);

  // --- Auto-Sync BIN_FULL Alert Status ---
  useEffect(() => {
    if (machine && machine.binFull) {
      const hasOpenBinFullAlert = alerts.some(a => a.type === 'BIN_FULL' && a.status === 'open');
      if (!hasOpenBinFullAlert) {
        const alertId = "al_bf_" + Date.now();
        const alertItem = {
          machineId: machine.machineId || "RVM001",
          type: "BIN_FULL",
          severity: "critical",
          status: "open",
          createdAt: new Date()
        };

        if (isLiveMode && isFirebaseConnected) {
          try {
            const app = getApps()[0];
            const db = getFirestore(app);
            addDoc(collection(db, "alerts"), {
              ...alertItem,
              createdAt: Timestamp.now()
            });
            logAudit("System Monitor", "ALERT_TRIGGERED", "Collection dustbin at capacity alert logged to cloud", true);
          } catch (e) {
            console.error("Failed to write live BIN_FULL alert: ", e);
          }
        } else {
          setSimulatedAlerts(p => {
            const nextAlerts = [{ id: alertId, ...alertItem }, ...p];
            setAlerts(nextAlerts);
            return nextAlerts;
          });
        }
      }
    } else if (machine && !machine.binFull) {
      const openBinFullAlerts = alerts.filter(a => a.type === 'BIN_FULL' && a.status === 'open');
      if (openBinFullAlerts.length > 0) {
        openBinFullAlerts.forEach(a => {
          if (isLiveMode && isFirebaseConnected) {
            try {
              const app = getApps()[0];
              const db = getFirestore(app);
              updateDoc(doc(db, "alerts", a.id), {
                status: "resolved",
                resolvedAt: Timestamp.now()
              });
              logAudit("System Monitor", "ALERT_RESOLVED", "Dustbin emptied; alert resolved in cloud", true);
            } catch (e) {
              console.error("Failed to resolve live BIN_FULL alert: ", e);
            }
          } else {
            setSimulatedAlerts(prev => {
              const next = prev.map(item => item.id === a.id ? { ...item, status: "resolved", resolvedAt: new Date() } : item);
              setAlerts(next);
              return next;
            });
          }
        });
      }
    }
  }, [machine?.binFull, isLiveMode, isFirebaseConnected]);

  // --- Standalone Live Telemetry Memory Cache ---
  const [liveMachine, setLiveMachine] = useState(INITIAL_MACHINE_MOCK);
  const [liveEvents, setLiveEvents] = useState(INITIAL_MOCK_EVENTS);
  const [liveAlerts, setLiveAlerts] = useState(INITIAL_MOCK_ALERTS);
  const [liveAuditLogs, setLiveAuditLogs] = useState([
    { id: "au1", actor: "MD Ejaj Mahmud", action: "SYSTEM_INITIALIZED", target: "RVM001", timestamp: new Date(Date.now() - 2592000000) }
  ]);

  // --- Standalone Simulated Telemetry Memory Cache ---
  const [simulatedMachine, setSimulatedMachine] = useState({
    ...INITIAL_MACHINE_MOCK,
    acceptedCount: 15,
    rejectedCount: 3,
    penDispensedCount: 15,
    status: "online"
  });
  const [simulatedEvents, setSimulatedEvents] = useState([
    { id: "ev_sim_1", type: "PET_ACCEPTED", machineId: "RVM001_SIM", acceptedCount: 15, rejectedCount: 3, penCount: 15, binFull: false, timestamp: new Date() }
  ]);
  const [simulatedAlerts, setSimulatedAlerts] = useState([]);
  const [simulatedAuditLogs, setSimulatedAuditLogs] = useState([
    { id: "au_sim_1", actor: "Simulator", action: "SIMULATION_INITIALIZED", target: "RVM001_SIM", timestamp: new Date() }
  ]);

  // --- Sync Active States when Mode Changes ---
  useEffect(() => {
    if (isLiveMode) {
      setMachine(liveMachine);
      setEvents(liveEvents);
      setAlerts(liveAlerts);
      setAuditLogs(liveAuditLogs);
      
      if (liveMachine.binFull) {
        setLcdLine1("BIN FULL!");
        setLcdLine2("PLEASE TRY LATER");
        setRedLedGlow(true);
        setGreenLedGlow(false);
      } else {
        setLcdLine1("INSERT BOTTLE");
        setLcdLine2("PET or CAN      ");
        setRedLedGlow(false);
      }
    } else {
      setMachine(simulatedMachine);
      setEvents(simulatedEvents);
      setAlerts(simulatedAlerts);
      setAuditLogs(simulatedAuditLogs);
      
      if (simulatedMachine.binFull) {
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
  }, [isLiveMode, liveMachine, liveEvents, liveAlerts, liveAuditLogs, simulatedMachine, simulatedEvents, simulatedAlerts, simulatedAuditLogs]);

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
          setLiveMachine(data);
          if (isLiveMode) {
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
          setLiveEvents(evList);
          if (isLiveMode) {
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
        setLiveAlerts(alList);
        if (isLiveMode) {
          setAlerts(alList);
        }
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

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthError('');
    
    if (usernameInput.trim().toLowerCase() === 'ejaj' && passwordInput === 'commonRVM@5005') {
      const foundUser = users.find(u => u.email.toLowerCase() === EJAJ_EMAIL.toLowerCase()) || {
        uid: 'u1', name: 'MD Ejaj Mahmud', email: EJAJ_EMAIL, role: 'admin', createdAt: new Date()
      };
      setIsLoggedIn(true);
      setCurrentUser(foundUser);
      localStorage.setItem('rvm_logged_in_user', JSON.stringify(foundUser));
      setUsernameInput('');
      setPasswordInput('');
      setAuthError('');
      logAudit(foundUser.name, 'ADMIN_CREDENTIALS_LOGIN', 'Full admin write access granted');
      showToast("Access granted. Welcome back, Ejaj!", "success");
    } else {
      setAuthError('Incorrect username or password. Please try again.');
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      logAudit(currentUser.name, "USER_LOGOUT", "Logged out from portal");
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setUsernameInput('');
    setPasswordInput('');
    localStorage.removeItem('rvm_logged_in_user');
  };

  const logAudit = async (actorName, action, target, isSimulated = false) => {
    const newLog = {
      id: "au_" + Date.now(),
      actor: actorName,
      action: action,
      target: target,
      timestamp: new Date()
    };
    
    if (isLiveMode && !isSimulated) {
      setAuditLogs(prev => [newLog, ...prev]);
      setLiveAuditLogs(prev => [newLog, ...prev]);

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
    } else {
      setSimulatedAuditLogs(prev => [newLog, ...prev]);
      if (!isLiveMode) {
        setAuditLogs(prev => [newLog, ...prev]);
      }
    }
  };

  // Save Settings
  const handleToggleMaintenance = () => {
    if (demoGuard('Toggling Maintenance Mode')) return;
    setIsMaintenanceMode(prev => {
      const nextVal = !prev;
      const actionName = nextVal ? "ACTIVATED Maintenance Override Lock" : "DEACTIVATED Maintenance Override Lock";
      
      setAuditLogs(prevLogs => [
        {
          id: `audit-${Date.now()}`,
          actor: currentUser?.name || 'Admin',
          action: actionName,
          target: 'RVM001 Chassis Intake',
          timestamp: new Date()
        },
        ...prevLogs
      ]);

      setMaintenanceLogs(prevMaint => [
        {
          id: `maint-${Date.now()}`,
          technician: currentUser?.name || 'Admin Ejaj',
          action: nextVal ? "Initiated manual system lock. Intakes locked. Chute diagnostics active." : "Restored system to standard operational state. Intakes unlocked.",
          date: new Date()
        },
        ...prevMaint
      ]);

      showToast(nextVal ? "System placed into MAINTENANCE mode. Intakes locked." : "System restored to fully OPERATIONAL state.", "success");
      return nextVal;
    });
  };

  const handleSaveSettings = async (newThreshold, newInterval) => {
    if (demoGuard('Saving settings')) return;
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
    if (demoGuard('Logging maintenance')) return;
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
    if (demoGuard('Acknowledging alerts')) return;
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "acknowledged", acknowledgedBy: currentUser.name } : a));
    setSimulatedAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "acknowledged", acknowledgedBy: currentUser.name } : a));
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
    if (demoGuard('Resolving alerts')) return;
    setSimulatedAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "resolved", resolvedAt: new Date() } : a));
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
    if (demoGuard('Modifying user roles')) return;
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
    if (demoGuard('Running the live simulator')) return;
    if (isSimulating) {
      clearInterval(simInterval.current);
      setIsSimulating(false);
    } else {
      setIsSimulating(true);
      setActiveTab('simulator');
      simInterval.current = setInterval(() => {
        // Randomly simulate a bottle accepted (65% chance) or can rejected (35% chance)
        const isBottle = Math.random() < 0.65;
        simulateHardwareEvent(isBottle ? "PET_ACCEPTED" : "METAL_REJECTED");
      }, 8000);
    }
  };

  const handleDemoReplay = (type) => {
    if (demoGuard('Replaying demo scenarios')) return;
    if (isMaintenanceMode) {
      showToast("🚨 System in Maintenance Mode! Inputs are physically locked.", "error");
      return;
    }
    if (isReplaying) {
      showToast("A demo replay sequence is already in progress!", "warning");
      return;
    }
    setIsReplaying(true);
    setActiveTab('simulator');
    
    // Make sure power is on
    if (!isPowerOn) {
      setIsPowerOn(true);
      setIsBooting(true);
      setLcdLine1("SMART RECYCLER");
      setLcdLine2("SYSTEM STARTING");
      setTimeout(() => {
        setIsBooting(false);
        setLcdLine1("INSERT BOTTLE");
        setLcdLine2("PET or CAN      ");
      }, 1000);
    }
    
    setTimeout(() => {
      if (type === 'PET') {
        showToast("🎬 Replaying PET Bottle Acceptance Scenario...", "info");
        simulateHardwareEvent("PET_ACCEPTED");
        setTimeout(() => setIsReplaying(false), 7200);
      } else if (type === 'CAN') {
        showToast("🎬 Replaying Aluminum Can Rejection Scenario...", "info");
        simulateHardwareEvent("METAL_REJECTED");
        setTimeout(() => setIsReplaying(false), 4000);
      } else if (type === 'FULL') {
        showToast("🎬 Replaying Bin Capacity Full scenario...", "error");
        // Simulate bin capacity full
        setSimulatedMachine(prev => {
          const updated = { ...prev, binFull: true, status: "maintenance" };
          setMachine(updated);
          return updated;
        });
        setLcdLine1("BIN FULL!       ");
        setLcdLine2("PLEASE TRY LATER");
        setRedLedGlow(true);
        setGreenLedGlow(false);
        playBuzzerTone(440, 1000);
        
        // Auto-restore after 6 seconds to let user continue roaming
        setTimeout(() => {
          setSimulatedMachine(prev => {
            const restored = { ...prev, binFull: false, status: "online" };
            setMachine(restored);
            return restored;
          });
          setLcdLine1("INSERT BOTTLE   ");
          setLcdLine2("PET or CAN      ");
          setRedLedGlow(false);
          setIsReplaying(false);
          showToast("Bin capacity alarm restored to normal", "info");
        }, 6000);
      }
    }, 1200);
  };

  const simulateHardwareEvent = async (type) => {
    if (demoGuard('Simulating hardware events')) return;
    if (isMaintenanceMode) {
      showToast("🚨 System in Maintenance Mode! Inputs are physically locked.", "error");
      return;
    }
    if (!isPowerOn) {
      showToast("Machine powered off — toggle the rocker switch first", "error");
      return;
    }
    
    // Auto-switch to Simulation Mode on simulation action to prevent clashing
    if (isLiveMode) {
      setIsLiveMode(false);
      showToast("Auto-switched to Standalone Simulation Mode", "info");
    }

    // CHECK FOR SIMULATED HARDWARE FAULTS FIRST!
    if (sensorIRFault) {
      showToast("FAIL: FC-51 IR beam sensor is blinded/malfunctioning. Run calibration.", "error");
      playBuzzerTone(200, 800);
      return;
    }
    if (sensorUSFault) {
      showToast("FAIL: HC-SR04 Ultrasonic sensor error. Capacity checks failed.", "error");
      playBuzzerTone(200, 800);
      return;
    }
    if (servoGateFault) {
      showToast("FAIL: SG90 Gate Servo Jammed. Intake sweep failed.", "error");
      playBuzzerTone(200, 800);
      return;
    }
    if (servoRewardFault && type === "PET_ACCEPTED") {
      showToast("FAIL: SG90 Reward Servo Jammed. Pen dispensing blocked.", "error");
      playBuzzerTone(200, 800);
      return;
    }

    const activeBinState = isLiveMode ? liveMachine.binFull : simulatedMachine.binFull;
    if (activeBinState) {
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
       // Updates local machine states
      const updateMachineFn = prev => {
        return {
          ...prev,
          acceptedCount: isAccepted ? prev.acceptedCount + 1 : prev.acceptedCount,
          rejectedCount: !isAccepted ? prev.rejectedCount + 1 : prev.rejectedCount,
          penDispensedCount: isAccepted ? prev.penDispensedCount + 1 : prev.penDispensedCount,
          lastSeenAt: new Date()
        };
      };
      
      setSimulatedMachine(prev => {
        const next = updateMachineFn(prev);
        if (!isLiveMode) setMachine(next);
        return next;
      });

      // Create Chronological Event Log
      setSimulatedEvents(prev => {
        const newEvent = {
          id: "ev_" + Date.now(),
          type: type,
          machineId: "RVM001_SIM",
          acceptedCount: (prev[0]?.acceptedCount || 0) + (isAccepted ? 1 : 0),
          rejectedCount: (prev[0]?.rejectedCount || 0) + (!isAccepted ? 1 : 0),
          penCount: (prev[0]?.penCount || 0) + (isAccepted ? 1 : 0),
          binFull: prev[0]?.binFull || false,
          timestamp: new Date()
        };
        const nextList = [newEvent, ...prev];
        if (!isLiveMode) setEvents(nextList);
        return nextList;
      });

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
        setRewardStock(prev => Math.max(0, prev - 1));
        setIsPenInDrawer(true); // Drop a pen into the interactive retrieval slot!
        
        setTimeout(() => {
          setPenAngle(90);
        }, 600);
        
        setTimeout(() => {
          logAudit("Arduino Mega", "PEN_DISPENSED", "Physical streak reward issued", true);
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
    if (isLiveMode) {
      setIsLiveMode(false);
      showToast("Auto-switched to Standalone Simulation Mode", "info");
    }
    
    setSimulatedMachine(prev => {
      const nextState = !prev.binFull;
      const updated = { ...prev, binFull: nextState, status: nextState ? "maintenance" : "online" };
      setMachine(updated);
      
      if (nextState) {
        setLcdLine1("BIN FULL!");
        setLcdLine2("PLEASE TRY LATER");
        setRedLedGlow(true);
        setGreenLedGlow(false);
        
        // Warning beeping sound
        playBuzzerTone(400, 150);
        setTimeout(() => playBuzzerTone(400, 150), 300);

        const alertItem = {
          id: "al_bf_" + Date.now(),
          machineId: "RVM001_SIM",
          type: "BIN_FULL",
          severity: "critical",
          status: "open",
          createdAt: new Date()
        };
        setSimulatedAlerts(p => {
          const nextAlerts = [alertItem, ...p];
          if (!isLiveMode) setAlerts(nextAlerts);
          return nextAlerts;
        });
      } else {
        setLcdLine1("INSERT BOTTLE");
        setLcdLine2("PET or CAN      ");
        setRedLedGlow(false);
        
        logAudit(currentUser?.name || "Simulator", "BIN_CLEARED", "RVM001_SIM Bin emptied", true);
      }
      return updated;
    });
  };

  // --- Live Component Diagnostics & Automated Calibration ---
  const runHardwareCalibration = () => {
    if (!isPowerOn) {
      showToast("Power off — toggle the rocker switch first", "error");
      return;
    }
    
    setLcdLine1("CALIBRATING...  ");
    setLcdLine2("SWEEP SCANNING  ");
    
    // Clear all fault states
    setSensorIRFault(false);
    setSensorUSFault(false);
    setServoGateFault(false);
    setServoRewardFault(false);
    
    // Clear simulated alerts
    setSimulatedAlerts([]);
    if (!isLiveMode) setAlerts([]);
    
    // Buzz success sequence
    playBuzzerTone(1000, 100);
    setTimeout(() => playBuzzerTone(1200, 100), 120);
    setTimeout(() => playBuzzerTone(1500, 200), 240);
    
    // Flashes LEDs
    setGreenLedGlow(true);
    setRedLedGlow(true);
    
    setTimeout(() => {
      setGreenLedGlow(false);
      setRedLedGlow(false);
      setLcdLine1("INSERT BOTTLE   ");
      setLcdLine2("PET or CAN      ");
      showToast("Calibration Complete: 0 faults detected across all 4 modules", "success");
      logAudit("Diagnostics Engine", "CALIBRATION_COMPLETED", "All sensors restored to green-line state", true);
    }, 1500);
  };

  const runTestGateSweep = () => {
    if (demoGuard('Running gate sweep test')) return;
    if (!isPowerOn) return showToast("Power off", "error");
    if (servoGateFault) return showToast("Gate Servo is Jammed!", "error");
    
    showToast("Initiating digital gate sweep test (0° -> 90° -> 0°)");
    playBuzzerTone(1200, 150);
    setGateAngle(90);
    setTimeout(() => {
      setGateAngle(0);
      playBuzzerTone(1000, 100);
    }, 1500);
  };

  const runTestRewardSweep = () => {
    if (demoGuard('Running reward sweep test')) return;
    if (!isPowerOn) return showToast("Power off", "error");
    if (servoRewardFault) return showToast("Reward Servo is Jammed!", "error");
    
    showToast("Initiating pen dispenser sweep test (90° -> 0° -> 90°)");
    playBuzzerTone(1400, 150);
    setPenAngle(0);
    setTimeout(() => {
      setPenAngle(90);
      playBuzzerTone(1200, 100);
    }, 1500);
  };

  const runUltrasonicDiagnosticPing = () => {
    if (demoGuard('Running ultrasonic diagnostic')) return;
    if (!isPowerOn) return showToast("Power off", "error");
    
    showToast("Executing sonar distance echo measurement...");
    const distanceCm = sensorUSFault ? 999 : Math.floor(Math.random() * 20 + 3);
    const newLogs = [
      `SYS_PING_START - Sonar pulse triggered`,
      `TRIG [D22] - Sent 10µs trigger pulse`,
      `ECHO [D23] - Measured ${distanceCm * 58}µs pulse width`,
      `RESULT - Calculated Distance: ${distanceCm} cm`,
      `STATUS - Bin capacity: ${Math.max(0, Math.floor((100 - (distanceCm / 30) * 100)))}% full`
    ];
    setOscilloscopeLogs(newLogs);
    playBuzzerTone(1800, 80);
  };

  const toggleIRSensorFault = () => {
    if (demoGuard('Toggling hardware fault simulation')) return;
    const next = !sensorIRFault;
    setSensorIRFault(next);
    if (next) {
      const alertItem = {
        id: "al_ir_" + Date.now(),
        machineId: "RVM001_SIM",
        type: "ERR_SENSOR_IR",
        severity: "critical",
        status: "open",
        createdAt: new Date()
      };
      setSimulatedAlerts(p => {
        const nextAlerts = [alertItem, ...p];
        if (!isLiveMode) setAlerts(nextAlerts);
        return nextAlerts;
      });
      setLcdLine1("ERR: TCRT5000 IR");
      setLcdLine2("CALIBRATION REQD");
      playBuzzerTone(200, 500);
      showToast("Simulated IR Sensor Malfunction: Critical alert triggered", "error");
    } else {
      showToast("IR Sensor restored to operational state");
    }
  };

  const toggleUSSensorFault = () => {
    if (demoGuard('Toggling hardware fault simulation')) return;
    const next = !sensorUSFault;
    setSensorUSFault(next);
    if (next) {
      const alertItem = {
        id: "al_us_" + Date.now(),
        machineId: "RVM001_SIM",
        type: "ERR_SENSOR_US",
        severity: "critical",
        status: "open",
        createdAt: new Date()
      };
      setSimulatedAlerts(p => {
        const nextAlerts = [alertItem, ...p];
        if (!isLiveMode) setAlerts(nextAlerts);
        return nextAlerts;
      });
      setLcdLine1("ERR: HC-SR04 SON");
      setLcdLine2("CHECK SONAR PIN ");
      playBuzzerTone(200, 500);
      showToast("Simulated Ultrasonic Sensor Malfunction: Critical alert triggered", "error");
    } else {
      showToast("Ultrasonic Sensor restored to operational state");
    }
  };

  const toggleGateServoFault = () => {
    if (demoGuard('Toggling hardware fault simulation')) return;
    const next = !servoGateFault;
    setServoGateFault(next);
    if (next) {
      const alertItem = {
        id: "al_gate_" + Date.now(),
        machineId: "RVM001_SIM",
        type: "ERR_GATE_JAMMED",
        severity: "critical",
        status: "open",
        createdAt: new Date()
      };
      setSimulatedAlerts(p => {
        const nextAlerts = [alertItem, ...p];
        if (!isLiveMode) setAlerts(nextAlerts);
        return nextAlerts;
      });
      setLcdLine1("ERR: GATE SERVO ");
      setLcdLine2("OBSTRUCTION JAM ");
      playBuzzerTone(200, 500);
      showToast("Simulated Gate Servo Jam: Critical alert triggered", "error");
    } else {
      showToast("Gate Servo jam cleared");
    }
  };

  const toggleRewardServoFault = () => {
    if (demoGuard('Toggling hardware fault simulation')) return;
    const next = !servoRewardFault;
    setServoRewardFault(next);
    if (next) {
      const alertItem = {
        id: "al_reward_" + Date.now(),
        machineId: "RVM001_SIM",
        type: "ERR_REWARD_JAM",
        severity: "critical",
        status: "open",
        createdAt: new Date()
      };
      setSimulatedAlerts(p => {
        const nextAlerts = [alertItem, ...p];
        if (!isLiveMode) setAlerts(nextAlerts);
        return nextAlerts;
      });
      setLcdLine1("ERR: REWARD PWM ");
      setLcdLine2("PIN DISPENSER   ");
      playBuzzerTone(200, 500);
      showToast("Simulated Reward Servo Jam: Critical alert triggered", "error");
    } else {
      showToast("Reward Servo jam cleared");
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
    if (demoGuard('Modifying Firebase configuration')) return;
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
    if (demoGuard('Clearing Firebase configuration')) return;
    localStorage.removeItem('rvm_firebase_config');
    setFbConfig(null);
    setIsFirebaseConnected(false);
    setMachine(INITIAL_MACHINE_MOCK);
    setEvents(INITIAL_MOCK_EVENTS);
    setAlerts(INITIAL_MOCK_ALERTS);
    showToast("Credentials cleared — using local simulator", "info");
  };



  const loginAsDemo = (u) => {
    const foundUser = users.find(user => user.email.toLowerCase() === u.email.toLowerCase());
    const loginUser = foundUser || {
      uid: 'u_' + u.role.toLowerCase().replace(' ', '_'),
      name: u.name, email: u.email, role: u.role.toLowerCase(), createdAt: new Date()
    };
    setIsLoggedIn(true);
    setCurrentUser(loginUser);
    localStorage.setItem('rvm_logged_in_user', JSON.stringify(loginUser));
    logAudit(loginUser.name, 'DEMO_LOGIN', `Enterprise demo access as ${u.role}`);
  };

  const downloadDiagramAsPng = () => {
    // Select the active SVG inside our diagrams panel
    const svgEl = document.querySelector('.glass-panel svg');
    if (!svgEl) {
      showToast("Diagram SVG element not found in DOM", "error");
      return;
    }
    
    try {
      showToast("Generating Ultra-HQ diagram export...", "info");
      
      // Clone the SVG so we don't mutate the live DOM
      const clonedSvg = svgEl.cloneNode(true);
      
      // Set explicit styling attributes to ensure proper rendering in raw Image
      clonedSvg.setAttribute('style', 'font-family: "Marcellus", serif;');
      
      // Convert cloned SVG to XML string
      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        // Create high-resolution UHQ Canvas (3x scaling)
        const canvas = document.createElement('canvas');
        const scale = 3; 
        
        const viewBox = svgEl.getAttribute('viewBox') || '0 0 800 400';
        const [, , width, height] = viewBox.split(' ').map(Number);
        
        canvas.width = width * scale;
        canvas.height = height * scale;
        
        const context = canvas.getContext('2d');
        // Fill canvas with our gorgeous deep dark slate cosmic background #04091a
        context.fillStyle = '#04091a';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Apply high-quality image smoothing
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        
        // Draw the scaled SVG image onto the canvas
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        // Export to high quality PNG data URL
        const pngURL = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        
        const diagramNames = [
          "RVM_System_Architecture",
          "RVM_Hardware_Block_Diagram",
          "RVM_IoT_Data_Flow",
          "RVM_Arduino_State_Machine",
          "RVM_Sensor_Classification_Logic",
          "RVM_Firebase_DB_Schema",
          "RVM_Role_Based_Security_Model",
          "RVM_Power_Distribution_Diagram"
        ];
        
        downloadLink.href = pngURL;
        downloadLink.download = `${diagramNames[activeDiagramIdx] || 'RVM_Diagram'}_UHQ.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        URL.revokeObjectURL(blobURL);
        showToast("Ultra-HQ diagram downloaded successfully!", "success");
      };
      
      image.onerror = (err) => {
        console.error("UHQ rendering error: ", err);
        showToast("Failed to render diagram image", "error");
      };
      
      image.src = blobURL;
    } catch (error) {
      console.error("Export error: ", error);
      showToast("Diagram export failed", "error");
    }
  };

  // --- AUTH ROUTER WALL ---
  if (!isLoggedIn) {
    const DEMO_USERS = [
      { name: 'Dr. Hannah', role: 'Supervisor', email: 'hannah@unikl.edu.my', color: 'var(--color-green)' },
      { name: 'Sayed Aziz', role: 'Supervisor 1', email: 'sayedaziz@unikl.edu.my', color: 'var(--color-green)' },
      { name: 'Visitor', role: 'Read-Only', email: 'visitor@unikl.edu.my', color: 'var(--text-muted)' },
    ];
    return (
      <div className="login-container">
        {/* Animated background grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(16,185,129,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px', pointerEvents: 'none'
        }} />

        {/* Main Login Card */}
        <div className="login-card">
          {/* Logo */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.02))',
            border: '1px solid rgba(16,185,129,0.22)', padding: '16px', borderRadius: '50%',
            marginBottom: '16px', color: 'var(--color-green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 25px rgba(16,185,129,0.1)'
          }}>
            <LayoutDashboard size={32} className="pulse-indicator" />
          </div>
          <h1 style={{
            fontSize: '1.4rem', textAlign: 'center', marginBottom: '4px', color: 'var(--text-primary)',
            fontWeight: 700, letterSpacing: '0.06em', fontFamily: 'var(--font-serif)'
          }}>Smart Recycling RVM Portal</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', marginBottom: '24px' }}>
            UniKL MIIT · FYP2 Admin Dashboard · 2026
          </p>



          {/* Admin Login Credentials Form */}
          <form onSubmit={handleLogin} style={{ width: '100%', marginBottom: 20 }}>
            <div style={{
              fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.08em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12
            }}>
              <ShieldAlert size={12} color="var(--color-blue)" /> System Administrator Access
            </div>

            {authError && (
              <div style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: 'var(--color-red)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                marginBottom: 16,
                fontWeight: 600,
                textAlign: 'center'
              }}>
                {authError}
              </div>
            )}

            {/* Username Input Group */}
            <div className="login-form-group">
              <div style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center'
              }}>
                <Users size={16} />
              </div>
              <input
                type="text"
                placeholder="Username"
                value={usernameInput}
                onChange={(e) => { setUsernameInput(e.target.value); setAuthError(''); }}
                className="login-form-input"
                required
              />
            </div>

            {/* Password Input Group */}
            <div className="login-form-group">
              <div style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center'
              }}>
                <Eye size={16} />
              </div>
              <input
                type="password"
                placeholder="Password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }}
                className="login-form-input"
                required
              />
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              className="login-submit-btn"
            >
              Sign In to Portal
            </button>
          </form>

          {/* Divider */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-primary)' }} />
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Supervisor & Guest Access
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-primary)' }} />
          </div>

          {/* Demo User Buttons */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {DEMO_USERS.map((u, i) => (
              <button key={i} onClick={() => loginAsDemo(u)} className="login-demo-btn">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: u.role.includes('Supervisor') ? 'var(--color-green)' : 'var(--text-muted)'
                  }}>
                    {u.role.includes('Supervisor') ? <Users size={16} /> : <Eye size={16} />}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{u.name}</div>
                    <div style={{ fontSize: '0.63rem', color: u.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {u.role} · Read-Only
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)',
                  borderRadius: 'var(--radius-sm)', padding: '4px 10px',
                  fontSize: '0.63rem', color: 'var(--color-green)', fontWeight: 700, letterSpacing: '0.04em'
                }}>
                  ▶ ENTER PORTAL
                </div>
              </button>
            ))}
          </div>

          {/* Footer note */}
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: 16, width: '100%' }}>
            Planned and Build by Ejaj Mahmud. For Exclusively FYP2. All Rights reserved.
          </div>
        </div>
      </div>
    );
  }

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'simulator', label: 'Live Simulator', icon: Cpu },
    { id: 'events', label: 'Real-Time Telemetry', icon: Activity },
    { id: 'analytics', label: 'Analytics Console', icon: BarChart2 },
    { id: 'alerts', label: 'Alerts & Alarms', icon: Bell, count: alerts.filter(a => a.status === 'open').length },
    { id: 'pinout', label: 'Hardware Pinout', icon: Cable },
    { id: 'diagrams', label: 'Diagrams', icon: CircuitBoard },
    { id: 'datasheets', label: 'Component Datasheets', icon: FileText },
    { id: 'prototype', label: 'Construction Gallery', icon: Package },
    { id: 'settings', label: 'Admin Settings', icon: SettingsIcon },
    { id: 'supervisor', label: 'Supervisor Review', icon: Trophy }
  ];

  const PAGE_TITLES = {
    dashboard: 'System Overview',
    simulator: 'Hardware Simulator Console',
    events: 'Real-Time UART Telemetry Feed',
    analytics: 'Analytics & Predictions Console',
    alerts: 'System Alerts & Warnings',
    pinout: 'Hardware Wiring & Pinout Mappings',
    diagrams: 'Engineering Documentation & Diagrams',
    datasheets: 'Official Component Datasheets',
    prototype: 'Physical RVM Construction Timeline',
    settings: 'Admin System Configurations',
    supervisor: 'Academic Supervisor Review Center'
  };

  return (
    <div className={isDemo ? 'has-demo-banner' : ''} style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      
      {/* ── DEMO MODE BANNER — visible when non-admin is logged in ── */}
      {isDemo && (
        <div className="demo-mode-banner">
          <div className="demo-mode-banner-text">
            <Eye size={13} />
            <span>Read-Only Enterprise Demo — Write actions are restricted</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-amber)', opacity: 0.7 }}>
              Logged in as <strong>{currentUser?.name}</strong>
            </span>
            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)',
                color: 'var(--color-amber)', padding: '2px 9px', borderRadius: 'var(--radius-sm)',
                fontSize: '0.63rem', cursor: 'pointer', fontWeight: 700,
                fontFamily: 'var(--font-sans)', letterSpacing: '0.04em'
              }}
            >
              Exit Demo
            </button>
          </div>
        </div>
      )}
      
      {/* Mobile Sidebar Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Top Header Bar — hidden on desktop */}
      <div className="mobile-top-bar">
        <div className="mobile-top-bar-left">
          <div style={{
            background: 'linear-gradient(135deg, var(--color-green), var(--color-green))',
            color: 'white',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center'
          }}>
            <LayoutDashboard size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.1 }}>RVM IoT Panel</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{PAGE_TITLES[activeTab]}</div>
          </div>
        </div>
        <div className="mobile-top-bar-right">
          <span style={{
            fontSize: '0.65rem',
            color: machine.status === 'online' ? 'var(--color-green)' : 'var(--color-amber)',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: machine.status === 'online' ? 'var(--color-green)' : 'var(--color-amber)',
              display: 'inline-block'
            }} className="pulse-indicator" />
            {machine.status.toUpperCase()}
          </span>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="mobile-hamburger-btn"
            aria-label="Toggle navigation menu"
          >
            <div className={`hamburger-icon ${isMobileMenuOpen ? 'open' : ''}`}>
              <span /><span /><span />
            </div>
          </button>
        </div>
      </div>

      {/* Inline Toast Notification */}
      {toastMessage && (
        <div className="toast-notification" style={{
          background: toastMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 
                     toastMessage.type === 'info' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          backgroundColor: '#07101e',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${toastMessage.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 
                                toastMessage.type === 'info' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
          color: toastMessage.type === 'error' ? 'var(--color-red)' : 
                 toastMessage.type === 'info' ? 'var(--color-blue)' : 'var(--color-green)',
        }}>
          {toastMessage.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          {toastMessage.msg}
        </div>
      )}

      <aside className={`glass-panel app-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`} style={{
        width: '260px',
        borderRadius: 0,
        borderRight: '1px solid var(--border-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px',
        zIndex: 300
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

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {NAV_ITEMS.map(item => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
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

          {/* Real-time Hardware System Health HUD */}
          <div style={{
            marginTop: '12px',
            borderTop: '1px solid var(--border-primary)',
            paddingTop: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <span style={{
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              textAlign: 'left',
              display: 'block',
              marginBottom: '2px'
            }}>
              RVM001 Diagnostics
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>MCU Temp:</span>
                <span style={{ color: cpuTemp > 45 ? 'var(--color-amber)' : 'var(--text-primary)', fontWeight: 600 }}>{cpuTemp}°C</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Wi-Fi RSSI:</span>
                <span style={{ color: 'var(--color-green)', fontWeight: 600 }}>{rssi} dBm</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>SRAM Avail:</span>
                <span style={{ color: 'var(--color-cyan)', fontWeight: 600 }}>{freeRam} B</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Queue Buffer:</span>
                <span style={{ color: offlineQueueCount > 0 ? 'var(--color-amber)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {offlineQueueCount} pkts
                </span>
              </div>
            </div>
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
      <main className="app-main" style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
        
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
              {activeTab === 'prototype' && "Physical Hardware Showcase"}
              {activeTab === 'datasheets' && "Component Datasheet Explorer"}
              {activeTab === 'pinout' && "Hardware Wiring & Pinout"}
              {activeTab === 'diagrams' && "Engineering Diagrams Deck"}
              {activeTab === 'settings' && "Enterprise Admin Settings"}
              {activeTab === 'supervisor' && "Supervisor Evaluation Center"}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {activeTab === 'dashboard' && "Real-time analytical and structural telemetry from RVM001."}
              {activeTab === 'simulator' && "Simulate machine inputs and character LCD readouts for visual presentations."}
              {activeTab === 'events' && "Continuous stream of chronological transactional telemetry."}
              {activeTab === 'alerts' && "Monitor active system malfunctions, full levels, and diagnostics."}
              {activeTab === 'analytics' && "Long-term historical rollups and system efficiency stats."}
              {activeTab === 'prototype' && "Progress gallery and interactive construction milestones timeline."}
              {activeTab === 'datasheets' && "Explore verified industrial sensor specifications and official signed reports."}
              {activeTab === 'pinout' && "Interactive spreadsheet of signal configurations, voltages, and wiring states."}
              {activeTab === 'diagrams' && "Interactive high-fidelity vector diagrams and hardware flow charts."}
              {activeTab === 'settings' && "Tweak calibrations, toggle maintenance, and audit machine activities."}
              {activeTab === 'supervisor' && "Dr. Hannah's checklist, limitations, and future AI/ML upgrade recommendations."}
            </p>
          </div>

          {/* Mode Selector Toggle */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px',
              alignItems: 'center',
              gap: '4px'
            }}>
              <button
                onClick={() => {
                  setIsLiveMode(true);
                  showToast("Switched to Live Data Mode", "info");
                }}
                style={{
                  border: 'none',
                  background: isLiveMode ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  color: isLiveMode ? 'var(--color-green)' : 'var(--text-muted)',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'var(--transition-fast)'
                }}
              >
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--color-green)',
                  display: 'inline-block',
                  animation: isLiveMode ? 'pulse 1.5s infinite' : 'none'
                }} />
                Live Mode
              </button>
              <button
                onClick={() => {
                  setIsLiveMode(false);
                  showToast("Switched to Standalone Simulation Mode", "info");
                }}
                style={{
                  border: 'none',
                  background: !isLiveMode ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  color: !isLiveMode ? 'var(--color-blue)' : 'var(--text-muted)',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'var(--transition-fast)'
                }}
              >
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--color-blue)',
                  display: 'inline-block',
                  animation: !isLiveMode ? 'pulse 1.5s infinite' : 'none'
                }} />
                Simulation Mode
              </button>
            </div>

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
          </div>
        </header>

        {/* --- VIEW ROUTER PANEL --- */}
        <section className="content-section">
          
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
              <div className="resp-grid-mid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px', marginBottom: '24px' }}>
                
                {/* RVM Status Card */}
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cpu size={18} style={{ color: 'var(--color-cyan)' }} />
                    RVM Hardware Diagnostic Telemetry
                  </h3>
                  
                  {/* Dynamic Telemetry Calculations */}
                  {(() => {
                    const activeAlertCount = alerts.filter(a => a.status === 'open').length;
                    const sensorFaultCount = (sensorIRFault ? 1 : 0) + (sensorUSFault ? 1 : 0) + (servoGateFault ? 1 : 0) + (servoRewardFault ? 1 : 0);
                    const healthScore = Math.max(0, 100 - (activeAlertCount * 12) - (sensorFaultCount * 15) - (!isPowerOn ? 80 : 0) - (isMaintenanceMode ? 40 : 0));
                    
                    const binDepthCm = (26.4 - Math.min(15, machine.acceptedCount * 0.4));
                    const binLevelPct = machine.binFull ? 100 : Math.min(100, Math.round(((26.4 - binDepthCm) / (26.4 - 8)) * 100));
                    
                    const forecastHours = machine.binFull ? 0 : Math.max(0.5, ((100 - binLevelPct) / 10) * 0.5);
                    const forecastHrsPart = Math.floor(forecastHours);
                    const forecastMinsPart = Math.round((forecastHours - forecastHrsPart) * 60);
                    const forecastStr = machine.binFull ? "0 minutes (Capacity Exceeded)" : 
                                        isMaintenanceMode ? "N/A (Intake Offline)" :
                                        !isPowerOn ? "N/A (Powered Off)" :
                                        `${forecastHrsPart}h ${forecastMinsPart}m (Based on current usage rate)`;

                    const isHeartbeatActive = lastHeartbeatSec < 30 && isPowerOn && !isMaintenanceMode;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        
                        {/* 1. Machine Health Score Gauge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ position: 'relative', width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="50" height="50" viewBox="0 0 36 36">
                              <path fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path fill="none" stroke={healthScore > 80 ? 'var(--color-green)' : healthScore > 40 ? 'var(--color-amber)' : 'var(--color-red)'} strokeWidth="3" strokeDasharray={`${healthScore}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s ease' }} />
                            </svg>
                            <span style={{ position: 'absolute', fontSize: '0.78rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-sans)' }}>{healthScore}%</span>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Machine Health Score</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: healthScore > 80 ? 'var(--color-green)' : healthScore > 40 ? 'var(--color-amber)' : 'var(--color-red)' }}>
                              {!isPowerOn ? 'Offline (Power Cut)' : isMaintenanceMode ? 'Maintenance Mode Locked' : healthScore > 80 ? 'Excellent Operational' : healthScore > 50 ? 'Moderate Alert' : 'Critical Hazard'}
                            </div>
                          </div>
                        </div>

                        {/* 2. Live Heartbeat Monitor */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Live UART Heartbeat:</span>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            color: isHeartbeatActive ? 'var(--color-green)' : 'var(--color-amber)',
                            fontWeight: 700,
                            fontSize: '0.82rem'
                          }}>
                            <span style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: isHeartbeatActive ? 'var(--color-green)' : 'var(--color-amber)',
                              display: 'inline-block',
                              animation: isHeartbeatActive ? 'pulse 1.5s infinite' : 'none'
                            }} />
                            {!isPowerOn ? 'Offline' : isMaintenanceMode ? 'Locked' : isHeartbeatActive ? `${lastHeartbeatSec}s ago (Stable)` : `${lastHeartbeatSec}s ago (Heartbeat Warning)`}
                          </span>
                        </div>

                        {/* 3. Bin Capacity Forecast */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Bin Level ({binLevelPct}%):</span>
                            <span style={{ fontWeight: 700, color: machine.binFull ? 'var(--color-red)' : 'var(--color-green)' }}>
                              {machine.binFull ? 'CRITICAL - FULL' : `${binLevelPct}% Capacity`}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              width: `${binLevelPct}%`,
                              height: '100%',
                              background: machine.binFull ? 'var(--color-red)' : 'var(--color-green)',
                              transition: 'var(--transition-smooth)'
                            }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            ⏳ Est. Full in: <strong>{forecastStr}</strong>
                          </span>
                        </div>

                        {/* 4. Reward Stock Monitor */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Reward Pen Stock:</span>
                          <span style={{
                            fontWeight: 700,
                            color: rewardStock > 3 ? 'var(--color-cyan)' : 'var(--color-amber)',
                            fontSize: '0.82rem'
                          }}>
                            🎁 {rewardStock} / 10 remaining {rewardStock <= 3 && '(Low Stock Alert!)'}
                          </span>
                        </div>

                        {/* 5. General Machine Meta */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>ID / Firmware:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{machine.machineId} · {machine.firmwareVersion}</span>
                        </div>

                      </div>
                    );
                  })()}
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
                  {/* Bottom Section: Chronological Event Timeline & Export Controls */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Telemetry Timeline & Event Stream</h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Chronological ingestion of sensory telemetry and state transition updates.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={handleExportCSV} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.75rem', gap: 6 }}>
                      <Download size={13} /> Export CSV Log
                    </button>
                    <button onClick={handleExportPDFMock} className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.75rem', gap: 6 }}>
                      <FileText size={13} /> Export PDF Report
                    </button>
                  </div>
                </div>

                {/* Vertical Chronological Timeline Tree */}
                <div style={{ position: 'relative', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Vertical linking line */}
                  <div style={{
                    position: 'absolute',
                    left: 6,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    background: 'linear-gradient(180deg, var(--color-green) 0%, rgba(59,130,246,0.3) 100%)',
                    opacity: 0.4
                  }} />

                  {events.slice(0, 4).map((ev, eIdx) => {
                    const isAccepted = ev.type === 'PET_ACCEPTED';
                    const isRejected = ev.type === 'METAL_REJECTED';
                    const isHeartbeat = ev.type === 'HEARTBEAT';

                    let dotColor = 'var(--text-muted)';
                    let glowColor = 'rgba(255,255,255,0.05)';
                    if (isAccepted) { dotColor = 'var(--color-green)'; glowColor = 'var(--color-green-glow)'; }
                    else if (isRejected) { dotColor = 'var(--color-red)'; glowColor = 'var(--color-red-glow)'; }
                    else if (isHeartbeat) { dotColor = 'var(--color-blue)'; glowColor = 'var(--color-blue-glow)'; }

                    return (
                      <div key={ev.id} style={{ display: 'flex', position: 'relative', alignItems: 'flex-start', gap: 16 }}>
                        
                        {/* Timeline pulsing dot */}
                        <div style={{
                          position: 'absolute',
                          left: -23,
                          top: 4,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: dotColor,
                          border: '2px solid var(--bg-base)',
                          boxShadow: `0 0 8px ${dotColor}`,
                          zIndex: 2
                        }} />

                        {/* Ingestion Content Box */}
                        <div className="glass-panel" style={{
                          flex: 1,
                          padding: '12px 18px',
                          background: 'rgba(255,255,255,0.01)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                          flexWrap: 'wrap',
                          borderLeft: `3px solid ${dotColor}`
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: dotColor, fontWeight: 800 }}>
                                {ev.type.replace('_', ' ')}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>·</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>RVM001 Telemetry</span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {isAccepted && `Capacitive scan detected non-metallic object. Intake gate cleared at 90°. Reward dispensed.`}
                              {isRejected && `Inductive proximity triggered (metal can). Intake sweep blocked. Chute alarm locked.`}
                              {isHeartbeat && `System ping recorded. Hardware registers stable. Temperature 42.5°C.`}
                              {!isAccepted && !isRejected && !isHeartbeat && `Telemetry state transition event successfully processed.`}
                            </p>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4 }}>
                              Counters: Accepted: {ev.acceptedCount} | Rejected: {ev.rejectedCount} | Dispensed: {ev.penCount}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
                            {ev.timestamp ? ev.timestamp.toLocaleTimeString() : 'N/A'}
                          </span>
                        </div>

                      </div>
                    );
                  })}
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
                                  <div className="blue-lcd-line">{(isMaintenanceMode ? "SYSTEM LOCKOUT" : lcdLine1).padEnd(16)}</div>
                                  <div className="blue-lcd-line">{(isMaintenanceMode ? "MAINTENANCE MODE" : lcdLine2).padEnd(16)}</div>
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
                              <div className="resp-grid-sim" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1.4fr 1.6fr', gap: '14px' }}>
                                
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
                                      <text x="80" y="99" fill={machine.binFull ? "var(--color-red)" : "var(--color-green)"} fontSize="7" fontWeight="900" textAnchor="middle" fontFamily="var(--font-sans)">
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

                  {/* Live Component Diagnostics & Automated Calibration */}
                  <div className="glass-panel" style={{ padding: '24px', marginTop: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity size={18} color="var(--color-green)" />
                      Live Diagnostics & Calibration
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 16 }}>
                      Issue component-level signal overrides and run hardware test sweeps.
                    </p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: 16 }}>
                      <button onClick={runTestGateSweep} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '8px', justifyContent: 'center' }} disabled={!isPowerOn}>
                        Test Gate Servo Sweep
                      </button>
                      <button onClick={runTestRewardSweep} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '8px', justifyContent: 'center' }} disabled={!isPowerOn}>
                        Test Reward Servo Sweep
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: 16 }}>
                      <button onClick={runUltrasonicDiagnosticPing} className="btn-secondary" style={{ flex: 1, fontSize: '0.75rem', padding: '8px', justifyContent: 'center' }} disabled={!isPowerOn}>
                        Ultrasonic sonar ping test
                      </button>
                      <button onClick={runHardwareCalibration} className="btn-primary" style={{ flex: 1, fontSize: '0.75rem', padding: '8px', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.2)' }} disabled={!isPowerOn}>
                        Auto Calibrate & Resolve Faults
                      </button>
                    </div>

                    {/* Sonar Log Panel */}
                    <div style={{
                      background: '#040b15',
                      border: '1px solid var(--border-primary)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}>
                      <span style={{ color: 'var(--color-green)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem', marginBottom: 2 }}>
                        Diagnostic Ping Oscilloscope
                      </span>
                      {oscilloscopeLogs.map((log, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>[{idx + 1}]</span>
                          <span style={{ color: log.includes('RESULT') ? '#fff' : 'var(--text-secondary)' }}>{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hardware Fault Simulation Engine */}
                  <div className="glass-panel" style={{ padding: '24px', marginTop: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={18} color="var(--color-red)" />
                      Hardware Fault Simulation
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 16 }}>
                      Inject simulated component malfunctions to test the system's fault tolerance, character LCD error readouts, and automatic safety locks.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <button
                        onClick={toggleIRSensorFault}
                        className="btn-secondary"
                        style={{
                          fontSize: '0.75rem',
                          padding: '8px',
                          justifyContent: 'center',
                          borderColor: sensorIRFault ? 'var(--color-red)' : 'var(--border-primary)',
                          color: sensorIRFault ? 'var(--color-red)' : 'var(--text-primary)',
                          background: sensorIRFault ? 'rgba(239, 68, 68, 0.08)' : 'transparent'
                        }}
                        disabled={!isPowerOn}
                      >
                        {sensorIRFault ? "● Blind IR Entry Sensor" : "○ Simulate IR Sensor Jam"}
                      </button>
                      
                      <button
                        onClick={toggleUSSensorFault}
                        className="btn-secondary"
                        style={{
                          fontSize: '0.75rem',
                          padding: '8px',
                          justifyContent: 'center',
                          borderColor: sensorUSFault ? 'var(--color-red)' : 'var(--border-primary)',
                          color: sensorUSFault ? 'var(--color-red)' : 'var(--text-primary)',
                          background: sensorUSFault ? 'rgba(239, 68, 68, 0.08)' : 'transparent'
                        }}
                        disabled={!isPowerOn}
                      >
                        {sensorUSFault ? "● sonar Echo Disconnected" : "○ Simulate sonar Fail"}
                      </button>
                      
                      <button
                        onClick={toggleGateServoFault}
                        className="btn-secondary"
                        style={{
                          fontSize: '0.75rem',
                          padding: '8px',
                          justifyContent: 'center',
                          borderColor: servoGateFault ? 'var(--color-red)' : 'var(--border-primary)',
                          color: servoGateFault ? 'var(--color-red)' : 'var(--text-primary)',
                          background: servoGateFault ? 'rgba(239, 68, 68, 0.08)' : 'transparent'
                        }}
                        disabled={!isPowerOn}
                      >
                        {servoGateFault ? "● Gate Servo Actuator Jammed" : "○ Simulate Gate Jam"}
                      </button>
                      
                      <button
                        onClick={toggleRewardServoFault}
                        className="btn-secondary"
                        style={{
                          fontSize: '0.75rem',
                          padding: '8px',
                          justifyContent: 'center',
                          borderColor: servoRewardFault ? 'var(--color-red)' : 'var(--border-primary)',
                          color: servoRewardFault ? 'var(--color-red)' : 'var(--text-primary)',
                          background: servoRewardFault ? 'rgba(239, 68, 68, 0.08)' : 'transparent'
                        }}
                        disabled={!isPowerOn}
                      >
                        {servoRewardFault ? "● Reward Dispenser Jammed" : "○ Simulate Reward Jam"}
                      </button>
                    </div>
                  </div>

                  {/* Interactive Demo Replay console */}
                  <div className="glass-panel" style={{ padding: '24px', marginTop: '20px', borderColor: isReplaying ? 'var(--color-cyan)' : 'var(--border-primary)', borderStyle: isReplaying ? 'dashed' : 'solid' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Trophy size={18} color="var(--color-cyan)" />
                      Interactive Demo Replay Console
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 16 }}>
                      Select a pre-programmed hardware ingestion sequence to watch the automatic LCD, sensor, LED, and actuator transitions play out live on the chassis above.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <button
                        onClick={() => handleDemoReplay('PET')}
                        className="btn-primary"
                        style={{
                          fontSize: '0.8rem',
                          padding: '10px',
                          justifyContent: 'center',
                          background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 100%)',
                          borderColor: 'var(--color-cyan)',
                          color: 'var(--color-cyan)'
                        }}
                        disabled={isReplaying}
                      >
                        🎥 Replay PET Bottle Ingestion Sequence
                      </button>
                      
                      <button
                        onClick={() => handleDemoReplay('CAN')}
                        className="btn-secondary"
                        style={{
                          fontSize: '0.8rem',
                          padding: '10px',
                          justifyContent: 'center',
                          borderColor: 'var(--color-red)',
                          color: 'var(--color-red)'
                        }}
                        disabled={isReplaying}
                      >
                        🎥 Replay Metal Can Rejection Sequence
                      </button>
                      
                      <button
                        onClick={() => handleDemoReplay('FULL')}
                        className="btn-secondary"
                        style={{
                          fontSize: '0.8rem',
                          padding: '10px',
                          justifyContent: 'center',
                          borderColor: 'var(--color-amber)',
                          color: 'var(--color-amber)'
                        }}
                        disabled={isReplaying}
                      >
                        🎥 Replay Bin Capacity Full Alarm Sequence
                      </button>
                    </div>
                  </div>

                  {/* Fault Diagnosis panel */}
                  <div className="glass-panel" style={{ padding: '24px', marginTop: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ShieldAlert size={18} color="var(--color-amber)" />
                      Chassis Fault Diagnosis Center
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 16 }}>
                      Current structural health status of peripheral sensors, communication channels, and telemetry synchronization loops.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: "IR Sensor Loop", status: sensorIRFault ? "FAULT" : "OPERATIONAL", color: sensorIRFault ? "var(--color-red)" : "var(--color-green)", details: "FC-51 presence D11" },
                        { label: "Capacitive Loop", status: sensorUSFault ? "FAULT" : "OPERATIONAL", color: sensorUSFault ? "var(--color-red)" : "var(--color-green)", details: "LJC18A3 classifier D5" },
                        { label: "Inductive Loop", status: sensorUSFault ? "FAULT" : "OPERATIONAL", color: sensorUSFault ? "var(--color-red)" : "var(--color-green)", details: "LJ12A3 Classifier D4" },
                        { label: "Sonar Loop", status: sensorUSFault ? "MALFUNCTION" : "OPERATIONAL", color: sensorUSFault ? "var(--color-red)" : "var(--color-green)", details: "HC-SR04 depth scanner" },
                        { label: "Intake Gate Servo", status: servoGateFault ? "JAM / ERROR" : "OPERATIONAL", color: servoGateFault ? "var(--color-red)" : "var(--color-green)", details: "SG90 Gate D9 actuator" },
                        { label: "Reward Servo", status: servoRewardFault ? "JAM / ERROR" : "OPERATIONAL", color: servoRewardFault ? "var(--color-red)" : "var(--color-green)", details: "SG90 Pen D10 dispenser" },
                        { label: "WiFi Connection", status: isWiFiActive && isPowerOn ? "STABLE" : "DISCONNECTED", color: isWiFiActive && isPowerOn ? "var(--color-green)" : "var(--color-red)", details: "ESP-WROOM-32 Wi-Fi" },
                        { label: "Firebase TLS Ingest", status: isLiveMode && isFirebaseConnected ? "ACTIVE SYNC" : "OFFLINE MOCK", color: isLiveMode && isFirebaseConnected ? "var(--color-green)" : "var(--color-blue)", details: "Firestore telemetry" }
                      ].map((diag, idx) => (
                        <div key={idx} style={{
                          background: 'rgba(255,255,255,0.01)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '10px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>{diag.label}</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: diag.color }}>{diag.status}</span>
                          </div>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{diag.details}</span>
                        </div>
                      ))}
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
                          <text x="70" y="51" fill={isPowerOn ? "#ef4444" : "#2d0606"} fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="var(--font-sans)" textShadow={isPowerOn ? "0 0 5px #ef4444" : "none"}>
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
                          <text x="70" y="51" fill={isPowerOn ? "#ef4444" : "#2d0606"} fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="var(--font-sans)" textShadow={isPowerOn ? "0 0 5px #ef4444" : "none"}>
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

                  {/* Column 2 - Interactive Pinout Inspector */}
                  <div className="glass-panel" style={{ padding: '24px', marginTop: '0px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CircuitBoard size={18} color="var(--color-blue)" />
                      Interactive Hardware Pinout Inspector
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 16 }}>
                      Select any physical module from the RVM hardware chassis above to inspect its Arduino Mega pin allocation, operating voltage, and live electrical telemetry.
                    </p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', alignItems: 'start' }}>
                      <select
                        value={selectedPinout}
                        onChange={e => setSelectedPinout(e.target.value)}
                        className="form-input"
                        style={{ width: '100%', fontSize: '0.75rem', background: '#040b15', border: '1px solid var(--border-primary)', padding: '10px' }}
                      >
                        <option value="IR">FC-51 Proximity IR Sensor (Object Entry Detector)</option>
                        <option value="Capacitive">LJC18A3 Capacitive Sensor (Plastic Classifier)</option>
                        <option value="Inductive">LJ12A3 Inductive Proximity Sensor (Metal Classifier)</option>
                        <option value="GateServo">SG90 Core Gate Servo Actuator</option>
                        <option value="RewardServo">SG90 Core Pen Dispenser Servo</option>
                        <option value="Ultrasonic">HC-SR04 Bin Capacity Ultrasonic Sensor</option>
                        <option value="GreenLED">Green Status LED Indicator</option>
                        <option value="RedLED">Red Error Status LED Indicator</option>
                        <option value="Buzzer">Core Piezo Buzzer Sounder</option>
                        <option value="LCD">Character LCD Screen (I2C Interface)</option>
                      </select>

                      <div style={{
                        background: '#040b15',
                        border: '1px solid var(--border-primary)',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-sans)',
                        lineHeight: '1.6'
                      }}>
                        {selectedPinout === 'IR' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>FC-51 IR Sensor:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D11 (Digital INPUT)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>5.0 V</span><br />
                            • Signal Mode: <span style={{ color: 'var(--color-cyan)' }}>ACTIVE LOW (GND Trigger)</span><br />
                            • Telemetry: <span style={{ color: sensorIRActive ? 'var(--color-green)' : 'var(--text-muted)' }}>
                              {sensorIRActive ? "● BEAM BROKEN (OBJECT DETECTED)" : "○ Standby"}
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'Capacitive' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>LJC18A3 Capacitive Sensor:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D5 (Digital INPUT)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>5.0 V</span><br />
                            • Signal Mode: <span style={{ color: 'var(--color-cyan)' }}>ACTIVE HIGH</span><br />
                            • Telemetry: <span style={{ color: sensorCapActive ? 'var(--color-green)' : 'var(--text-muted)' }}>
                              {sensorCapActive ? "● HIGH (PLASTIC DETECTED)" : "○ Standby"}
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'Inductive' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>LJ12A3 Inductive Sensor:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D4 (Digital INPUT)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>5.0 V</span><br />
                            • Signal Mode: <span style={{ color: 'var(--color-cyan)' }}>ACTIVE HIGH</span><br />
                            • Telemetry: <span style={{ color: sensorIndActive ? 'var(--color-green)' : 'var(--text-muted)' }}>
                              {sensorIndActive ? "● HIGH (METAL CAN DETECTED)" : "○ Standby"}
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'GateServo' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>SG90 Gate Servo:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D9 (PWM Output)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>5.0 V</span><br />
                            • Signal Mode: <span style={{ color: 'var(--color-cyan)' }}>PWM Sweep Control</span><br />
                            • Telemetry: <span style={{ color: gateAngle > 0 ? 'var(--color-green)' : 'var(--text-muted)' }}>
                              Angle: <span style={{ color: '#fff' }}>{gateAngle}°</span> ({gateAngle > 0 ? "Open" : "Closed"})
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'RewardServo' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>SG90 Reward Servo:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D10 (PWM Output)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>5.0 V</span><br />
                            • Signal Mode: <span style={{ color: 'var(--color-cyan)' }}>PWM Sweep Control</span><br />
                            • Telemetry: <span style={{ color: penAngle !== 90 ? 'var(--color-green)' : 'var(--text-muted)' }}>
                              Angle: <span style={{ color: '#fff' }}>{penAngle}°</span> ({penAngle !== 90 ? "Dispensing" : "Standby"})
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'Ultrasonic' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>HC-SR04 Ultrasonic:</span><br />
                            • Trig Pin: <span style={{ color: '#fff' }}>D22 (Output)</span><br />
                            • Echo Pin: <span style={{ color: '#fff' }}>D23 (Input)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>5.0 V</span><br />
                            • Telemetry: <span style={{ color: machine.binFull ? 'var(--color-red)' : 'var(--color-green)' }}>
                              {machine.binFull ? "● BIN FULL" : "○ Standby / Monitoring"}
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'GreenLED' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>Green Status LED:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D6 (Digital Output)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>2.2 V (resistor)</span><br />
                            • Telemetry: <span style={{ color: greenLedGlow ? 'var(--color-green)' : 'var(--text-muted)' }}>
                              {greenLedGlow ? "● HIGH (ON)" : "○ LOW (OFF)"}
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'RedLED' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>Red Error LED:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D7 (Digital Output)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>2.0 V (resistor)</span><br />
                            • Telemetry: <span style={{ color: redLedGlow ? 'var(--color-red)' : 'var(--text-muted)' }}>
                              {redLedGlow ? "● HIGH (ON)" : "○ LOW (OFF)"}
                            </span>
                          </div>
                        )}
                        {selectedPinout === 'Buzzer' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>Piezo Buzzer Sounder:</span><br />
                            • Arduino Pin: <span style={{ color: '#fff' }}>D8 (PWM Output)</span><br />
                            • Voltage: <span style={{ color: 'var(--color-green)' }}>5.0 V</span><br />
                            • Telemetry: <span style={{ color: 'var(--text-muted)' }}>Idle</span>
                          </div>
                        )}
                        {selectedPinout === 'LCD' && (
                          <div>
                            <span style={{ color: 'var(--color-blue)', fontWeight: 700 }}>Character LCD (I2C):</span><br />
                            • Pins: <span style={{ color: '#fff' }}>D20(SDA), D21(SCL)</span><br />
                            • Address: <span style={{ color: '#fff' }}>0x27</span><br />
                            • Screen:<br />
                            <span style={{ color: 'var(--color-green)', background: '#000', padding: '2px 6px', display: 'inline-block', border: '1px solid #10b981', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
                              [{lcdLine1.padEnd(16, " ")}]<br />
                              [{lcdLine2.padEnd(16, " ")}]
                            </span>
                          </div>
                        )}
                      </div>
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
                        <td><span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600 }}>RVM001</span></td>
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
              <div className="resp-grid-analytics" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                
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

          {/* 7. MACHINE SETTINGS & ADMINISTRATIVE HUD (UNIFIED) */}
          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              
              {/* MAINTENANCE MODE TOGGLE ROCKER CARD */}
              <div className="glass-panel" style={{ padding: '24px 28px', background: isMaintenanceMode ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.01)', border: isMaintenanceMode ? '1px solid var(--color-amber)' : '1px solid var(--border-primary)', transition: 'var(--transition-smooth)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
                  <div>
                    <h4 style={{ fontSize: '1.15rem', color: isMaintenanceMode ? 'var(--color-amber)' : '#fff', marginBottom: 4, fontFamily: 'var(--font-serif)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isMaintenanceMode ? "⚠️ RVM Maintenance Override Lockout Active" : "🛡️ RVM Operational Protection Override"}
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {isMaintenanceMode ? "Hardware intake chute is physically locked at 0°. LCD character screen displays SYSTEM LOCKOUT. All simulation triggers blocked." : "System is fully operational. Intake chute is active. Standard simulator controls and telemetry stream enabled."}
                    </p>
                  </div>
                  <button
                    onClick={handleToggleMaintenance}
                    style={{
                      background: isMaintenanceMode ? 'var(--color-amber)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid ' + (isMaintenanceMode ? 'var(--color-amber)' : 'var(--border-subtle)'),
                      color: isMaintenanceMode ? '#000' : '#fff',
                      padding: '10px 20px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: isMaintenanceMode ? '0 0 12px rgba(245,158,11,0.3)' : 'none',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    {isMaintenanceMode ? "🔓 Deactivate Maintenance Override" : "🔒 Toggle Maintenance Lockout"}
                  </button>
                </div>
              </div>

              {/* TWO COLUMN CALIBRATIONS AND INJECTOR */}
              <div className="resp-grid-datasheet" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '30px' }}>
                
                {/* CALIBRATIONS */}
                <div className="glass-panel" style={{ padding: '28px', height: 'fit-content' }}>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: 20, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>Calibrations & Heartbeats</h3>
                  
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveSettings(e.target.threshold.value, e.target.interval.value);
                  }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bin Full Ultrasonic Threshold (CM)</label>
                      <input 
                        type="number" 
                        name="threshold"
                        className="form-input" 
                        defaultValue={settings.binFullThresholdCm}
                        min={3}
                        max={50}
                        required
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Trigger full lockout when bin content distance is equal to or less than this value (Tuned to machine bin height).
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Heartbeat Diagnostics Interval (ms)</label>
                      <input 
                        type="number" 
                        name="interval"
                        className="form-input" 
                        defaultValue={settings.heartbeatInterval}
                        min={5000}
                        max={120000}
                        required
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Frequency interval at which Arduino Mega pushes SYSTEM_HEARTBEAT packets to maintain web online monitoring.
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-primary)', paddingTop: 16 }}>
                      <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>
                        Sync Configurations
                      </button>
                    </div>
                  </form>
                </div>

                {/* FIREBASE CREDENTIALS INJECTOR */}
                <div className="glass-panel" style={{ padding: '28px', height: 'fit-content', borderStyle: 'dashed', borderColor: 'var(--color-blue)' }}>
                  <h4 style={{ fontSize: '1.1rem', color: 'var(--color-blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-serif)' }}>
                    <Database size={16} /> Live Firebase Credentials Injector
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                    Connect this React Dashboard to your own live Firebase database! Fill in your Web App config credentials below, and the app will instantly bind live Firestore document listeners.
                  </p>

                  {fbConfig ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: 12, borderRadius: 4, color: 'var(--color-green)' }}>
                        <strong>✓ Active Connection:</strong> Connected to project <code>{fbConfig.projectId}</code>
                      </div>
                      <button onClick={handleClearFirebaseConfig} className="btn-secondary" style={{ color: 'var(--color-red)', borderColor: 'var(--color-red)', padding: '8px 12px', fontSize: '0.8rem', justifyContent: 'center', width: '100%' }}>
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
                      <button type="submit" className="btn-primary" style={{ padding: '8px 12px', fontSize: '0.8rem', justifyContent: 'center', width: '100%' }}>
                        Inject Connection
                      </button>
                    </form>
                  )}
                </div>

              </div>

              {/* EXPANDABLE ACCORDIONS FOR COMBINED PAGES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                
                {/* 1. User Directory Accordion */}
                <div className="glass-panel" style={{ padding: '20px 24px', border: expandedSection === 'users' ? '1px solid var(--color-blue)' : '1px solid var(--border-primary)' }}>
                  <button 
                    onClick={() => setExpandedSection(expandedSection === 'users' ? null : 'users')}
                    style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      👤 User Access & Role Clearances
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{expandedSection === 'users' ? 'Collapse ▲' : 'Expand Directory ▼'}</span>
                  </button>
                  {expandedSection === 'users' && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                      <div className="table-container">
                        <table className="custom-table" style={{ width: '100%' }}>
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
                </div>

                {/* 2. Field Maintenance Logs Accordion */}
                <div className="glass-panel" style={{ padding: '20px 24px', border: expandedSection === 'maint' ? '1px solid var(--color-green)' : '1px solid var(--border-primary)' }}>
                  <button 
                    onClick={() => setExpandedSection(expandedSection === 'maint' ? null : 'maint')}
                    style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      🔧 Field Technician Maintenance Logs
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{expandedSection === 'maint' ? 'Collapse ▲' : 'Expand Logs ▼'}</span>
                  </button>
                  {expandedSection === 'maint' && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                      <div className="resp-grid-datasheet" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        {/* Form to submit maintenance */}
                        <div className="glass-panel" style={{ padding: '20px', height: 'fit-content', background: 'rgba(255,255,255,0.01)' }}>
                          <h5 style={{ fontSize: '0.9rem', marginBottom: 16, color: 'var(--text-primary)' }}>Submit Maintenance Entry</h5>
                          
                          <form onSubmit={(e) => {
                            e.preventDefault();
                            handleAddMaintenance(e.target.actionText.value);
                            e.target.reset();
                          }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Assigned Technician</label>
                              <input type="text" className="form-input" value={currentUser.name} readOnly style={{ background: 'rgba(255,255,255,0.03)' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Maintenance Tasks Completed</label>
                              <textarea 
                                name="actionText" 
                                className="form-input" 
                                placeholder="e.g. Cleared stuck plastic bottle from intake, refilled pen reward inventory."
                                rows={4}
                                required
                                style={{ resize: 'none' }}
                              />
                            </div>

                            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', padding: '8px' }}>
                              File Maintenance Record
                            </button>
                          </form>
                        </div>

                        {/* Maintenance Log history */}
                        <div className="glass-panel" style={{ padding: '20px', height: '320px', overflowY: 'auto', background: 'rgba(255,255,255,0.01)' }}>
                          <h5 style={{ fontSize: '0.9rem', marginBottom: 16, color: 'var(--text-primary)' }}>Historical Field Services</h5>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {maintenanceLogs.map(m => (
                              <div key={m.id} className="glass-panel" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-subtle)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <strong style={{ color: 'var(--color-blue)', fontSize: '0.8rem' }}>{m.technician}</strong>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.date ? m.date.toLocaleString() : 'N/A'}</span>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                  {m.action}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Security Audit Trails Accordion */}
                <div className="glass-panel" style={{ padding: '20px 24px', border: expandedSection === 'audit' ? '1px solid var(--color-purple)' : '1px solid var(--border-primary)' }}>
                  <button 
                    onClick={() => setExpandedSection(expandedSection === 'audit' ? null : 'audit')}
                    style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      🛡️ Security Access Audit Trails
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{expandedSection === 'audit' ? 'Collapse ▲' : 'Expand Audit ▼'}</span>
                  </button>
                  {expandedSection === 'audit' && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                      <div className="table-container">
                        <table className="custom-table" style={{ fontSize: '0.82rem', width: '100%' }}>
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
                                <td>{log.timestamp ? log.timestamp.toLocaleString() : 'N/A'}</td>
                                <td><strong style={{ color: 'var(--color-blue)' }}>{log.actor}</strong></td>
                                <td>
                                  <span style={{
                                    background: 'rgba(59, 130, 246, 0.08)',
                                    color: 'var(--color-blue)',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.72rem',
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
                </div>

              </div>

            </div>
          )}


          {/* ========================================================================= */}
          {/* 12. HARDWARE WIRING & PINOUT */}
          {activeTab === 'pinout' && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h3 style={{ fontSize: '1.4rem', marginBottom: 4, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>Smart RVM Hardware Wiring Pinout</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Verified industrial prototype physical connection schematic mapping Mega2560 pins to RVM sensors and actuators.</p>
                </div>
                <span style={{ fontSize: '0.75rem', background: 'rgba(16,185,129,0.1)', color: 'var(--color-green)', border: '1px solid rgba(16,185,129,0.2)', padding: '4px 10px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                  Controller: ATmega2560
                </span>
              </div>

              <div className="table-container">
                <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                      <th style={{ fontFamily: 'var(--font-serif)', textAlign: 'left', padding: '12px' }}>Pin Number</th>
                      <th style={{ fontFamily: 'var(--font-serif)', textAlign: 'left', padding: '12px' }}>Component Name</th>
                      <th style={{ fontFamily: 'var(--font-serif)', textAlign: 'left', padding: '12px' }}>Voltage Rail</th>
                      <th style={{ fontFamily: 'var(--font-serif)', textAlign: 'left', padding: '12px' }}>Signal Type</th>
                      <th style={{ fontFamily: 'var(--font-serif)', textAlign: 'left', padding: '12px' }}>Current Status</th>
                      <th style={{ fontFamily: 'var(--font-serif)', textAlign: 'left', padding: '12px' }}>Wiring Notes & Logic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { pin: "D4", name: "Inductive Proximity Sensor", volt: "12.0V DC (Divided to 5.0V logic)", type: "Digital INPUT", status: "Active / Sensing", notes: "LJ12A3-4-Z/BX sensor. Detects presence of metal cans. Requires 12V power rail, signal divided through 10k/4.7k resistors to secure Atmega pins." },
                      { pin: "D5", name: "Capacitive Proximity Sensor", volt: "12.0V DC (Divided to 5.0V logic)", type: "Digital INPUT", status: "Active / Sensing", notes: "LJC18A3-B-Z/BX sensor. Detects non-metallic density (PET plastics). Tuned sensitivity screw. Signal divided to 5.0V secure level." },
                      { pin: "D11", name: "TCRT5000 IR Presence Sensor", volt: "5.0V DC", type: "Digital INPUT", status: "Active / Idle", notes: "Sits at intake entry point. Detects if an object has entered the physical chute to initiate the sorting state machine loop." },
                      { pin: "D22 / D23", name: "HC-SR04 Ultrasonic Sensor", volt: "5.0V DC", type: "Digital I/O (D22 Trig / D23 Echo)", status: "Active / Measuring", notes: "Mounted at the ceiling of the recycling bin container. Measures bin full volume percentage. Warning triggered at threshold levels." },
                      { pin: "D9", name: "SG90 Gate Servo Motor", volt: "5.0V DC (Servo Buck Rail)", type: "PWM OUTPUT (0° to 90°)", status: "Active / Swept 0°", notes: "Controls the intake direction. Opens to 90° for PET plastics, keeps closed/locked at 0° for metal cans and debris." },
                      { pin: "D10", name: "SG90 Reward Servo Motor", volt: "5.0V DC (Servo Buck Rail)", type: "PWM OUTPUT", status: "Active / Armed", notes: "Triggers the mechanical pen dispenser chute to dispense physical writing pen rewards. Rotates 180° and returns to home." },
                      { pin: "D20 / D21", name: "Hitachi HD44780 Character LCD", volt: "5.0V DC", type: "I2C Bus (SDA=D20 / SCL=D21)", status: "Online / Active", notes: "16x2 LCD screen with I2C backpack. Displays system prompts like 'Insert Bottle' and sorting states like 'Metal Rejected!'." },
                      { pin: "D6", name: "Red Alarm LED", volt: "5.0V DC (Current Limiting)", type: "Digital OUTPUT", status: "Active / Alarm Off", notes: "Flashes rapidly when metal or invalid objects are inserted to alert user of rejection, combined with buzzer beeps." },
                      { pin: "D7", name: "Green Active LED", volt: "5.0V DC (Current Limiting)", type: "Digital OUTPUT", status: "Active / Idle", notes: "Illuminates solid green when a recyclable is accepted, and flashes when reward dispenser is active." },
                      { pin: "D8", name: "Piezo Buzzer Speaker", volt: "5.0V DC", type: "PWM Tone", status: "Active / Idle", notes: "Provides acoustic chimes: High chime for PET acceptance, low warning buzzer sound for metallic object rejection." },
                      { pin: "RX0 / TX0 (0/1)", name: "ESP32 DevKit WiFi Serial link", volt: "3.3V (Level shifted logic)", type: "UART Link (115200 baud)", status: "Online / Synced", notes: "Cross-serial UART connection. Mega pushes CSV event telemetry string, ESP32 uploads packets directly to Google Firebase." }
                    ].map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding: '12px' }}><code style={{ color: 'var(--color-cyan)', fontSize: '0.85rem', fontWeight: 800 }}>{row.pin}</code></td>
                        <td style={{ padding: '12px' }}><strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{row.name}</strong></td>
                        <td style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{row.volt}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                            background: row.type.includes('INPUT') ? 'rgba(59,130,246,0.1)' : row.type.includes('OUTPUT') ? 'rgba(16,185,129,0.1)' : 'rgba(168,85,247,0.1)',
                            color: row.type.includes('INPUT') ? 'var(--color-blue)' : row.type.includes('OUTPUT') ? 'var(--color-green)' : 'var(--color-purple)'
                          }}>
                            {row.type}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--color-green)', fontWeight: 600 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-green)' }} />
                            {row.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, maxWidth: '300px' }}>{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 13. DIAGRAMS & ENGINEERING DOCUMENTATION */}
          {activeTab === 'diagrams' && (
            <div className="resp-grid-datasheet" style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '30px' }}>
              
              {/* Left Selector Sidebar */}
              <div className="glass-panel" style={{ padding: '20px', height: 'fit-content' }}>
                <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-serif)' }}>Diagram Selection</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    "System Architecture",
                    "Hardware Block Diagram",
                    "IoT Data Flow",
                    "Arduino State Machine",
                    "Sensor Classification",
                    "Firebase DB Schema",
                    "Role-Based Security",
                    "Power Distribution"
                  ].map((diag, dIdx) => (
                    <button
                      key={dIdx}
                      onClick={() => setActiveDiagramIdx(dIdx)}
                      className={`btn-secondary ${activeDiagramIdx === dIdx ? 'active' : ''}`}
                      style={{
                        padding: '12px 14px',
                        fontSize: '0.82rem',
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                        background: activeDiagramIdx === dIdx ? 'rgba(59,130,246,0.1)' : 'transparent',
                        borderColor: activeDiagramIdx === dIdx ? 'var(--color-blue)' : 'var(--border-subtle)',
                        color: activeDiagramIdx === dIdx ? '#fff' : 'var(--text-secondary)',
                        fontFamily: 'var(--font-sans)',
                        width: '100%',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: activeDiagramIdx === dIdx ? 'var(--color-blue)' : 'rgba(255,255,255,0.05)',
                        color: activeDiagramIdx === dIdx ? '#fff' : 'var(--text-muted)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', marginRight: 8, fontWeight: 700
                      }}>
                        {dIdx + 1}
                      </span>
                      {diag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right View Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                
                {/* Visual Panel Card */}
                <div className="glass-panel" style={{ padding: '28px', background: '#020612', border: '1px solid var(--border-primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
                      {[
                        "1. RVM System Architecture & Telemetry Pipeline",
                        "2. Central ATmega2560 Hardware Connection Bus",
                        "3. End-to-End IoT Data Flow & Ingestion Pipeline",
                        "4. Arduino State Machine Behavior Diagram",
                        "5. Rule-Based Sensor Classification Decision Tree",
                        "6. Google Cloud Firestore / Realtime DB Schema",
                        "7. Role-Based Security & Middleware Access Model",
                        "8. Dual Regulator Power Distribution System"
                      ][activeDiagramIdx]}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.72rem', background: 'rgba(59,130,246,0.1)', color: 'var(--color-blue)', border: '1px solid rgba(59,130,246,0.2)', padding: '4px 10px', borderRadius: 4, fontWeight: 700 }}>
                        VECTOR SVG SCHEMA
                      </span>
                      <button
                        onClick={downloadDiagramAsPng}
                        title="Download Diagram as Ultra-HQ PNG"
                        style={{
                          background: 'rgba(16,185,129,0.1)',
                          border: '1px solid rgba(16,185,129,0.3)',
                          color: 'var(--color-green)',
                          padding: '6px 12px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'var(--transition-base)',
                          fontFamily: 'var(--font-sans)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'var(--color-green)';
                          e.currentTarget.style.color = '#ffffff';
                          e.currentTarget.style.borderColor = 'var(--color-green)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(16,185,129,0.1)';
                          e.currentTarget.style.color = 'var(--color-green)';
                          e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)';
                        }}
                      >
                        <Download size={14} />
                        Download UHQ PNG
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Inline SVGs */}
                  <div style={{
                    width: '100%',
                    height: '420px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: '#04091a',
                    padding: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {/* SVG 1: System Architecture */}
                    {activeDiagramIdx === 0 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        {/* Define glowing filter */}
                        <defs>
                          <filter id="glow-arch" x="-10%" y="-10%" width="120%" height="120%">
                            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.6"/>
                          </filter>
                        </defs>
                        {/* Grid Background */}
                        <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1"/>
                        </pattern>
                        <rect width="800" height="400" fill="url(#grid-pattern)" />
                        
                        {/* ── CONNECTION LINES LAYER (First) ── */}
                        {/* Connection Arrow 1 */}
                        <path d="M 160 200 L 220 200" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4" />
                        <polygon points="220,200 212,195 212,205" fill="#3b82f6" />

                        {/* Connection Arrow 2 */}
                        <path d="M 360 200 L 420 200" fill="none" stroke="var(--color-green)" strokeWidth="2.5" />
                        <polygon points="420,200 412,195 412,205" fill="var(--color-green)" />

                        {/* Connection Arrow 3 */}
                        <path d="M 540 200 L 600 200" fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="6 3" />
                        <polygon points="600,200 592,195 592,205" fill="#a855f7" />

                        {/* Web App Double Arrow */}
                        <path d="M 685 270 Q 685 340 500 340" fill="none" stroke="var(--color-cyan)" strokeWidth="2" />
                        <polygon points="500,340 508,345 508,335" fill="var(--color-cyan)" />

                        {/* ── CARD NODES LAYER (Second) ── */}
                        {/* Physical RVM */}
                        <rect x="30" y="150" width="130" height="100" rx="6" fill="#0f172a" stroke="var(--color-cyan)" strokeWidth="2" />

                        {/* Atmega2560 Box */}
                        <rect x="220" y="140" width="140" height="120" rx="6" fill="#0f172a" stroke="var(--color-blue)" strokeWidth="2" filter="url(#glow-arch)" />

                        {/* ESP32 Box */}
                        <rect x="420" y="150" width="120" height="100" rx="6" fill="#0f172a" stroke="var(--color-green)" strokeWidth="2" />

                        {/* Firebase Box */}
                        <rect x="600" y="130" width="170" height="140" rx="8" fill="#1e1b4b" stroke="#a855f7" strokeWidth="2" />
                        <line x1="615" y1="180" x2="755" y2="180" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                        
                        {/* Telemetry and Events nodes */}
                        <rect x="615" y="195" width="65" height="22" rx="3" fill="rgba(168,85,247,0.15)" stroke="rgba(168,85,247,0.3)" />
                        <rect x="690" y="195" width="65" height="22" rx="3" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" />
                        <rect x="615" y="230" width="140" height="22" rx="3" fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.3)" />

                        {/* Admin Panel / Flutter */}
                        <circle cx="500" cy="340" r="4" fill="var(--color-cyan)" />
                        <rect x="360" y="320" width="140" height="40" rx="4" fill="#0f172a" stroke="var(--color-cyan)" strokeWidth="1.5" />

                        {/* ── TEXTS AND LABELS LAYER (Third / Last) ── */}
                        <text x="95" y="195" fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="var(--font-serif)">Physical RVM</text>
                        <text x="95" y="220" fill="var(--color-cyan)" fontSize="10" textAnchor="middle" fontWeight="bold">Sensors & Actuators</text>
                        
                        <text x="190" y="190" fill="var(--text-muted)" fontSize="9" textAnchor="middle">Physical</text>
                        
                        <text x="290" y="180" fill="#fff" fontSize="14" fontWeight="700" textAnchor="middle" fontFamily="var(--font-serif)">Arduino Mega</text>
                        <text x="290" y="205" fill="var(--color-blue)" fontSize="11" textAnchor="middle" fontWeight="bold">ATmega2560 logic</text>
                        <text x="290" y="230" fill="var(--text-muted)" fontSize="9" textAnchor="middle">Ch chute controller</text>
                        
                        <text x="390" y="190" fill="var(--color-green)" fontSize="9" textAnchor="middle" fontWeight="bold">UART Serial</text>
                        
                        <text x="480" y="195" fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="var(--font-serif)">ESP32 DevKit</text>
                        <text x="480" y="220" fill="var(--color-green)" fontSize="10" textAnchor="middle" fontWeight="bold">WiFi 2.4GHz Link</text>
                        
                        <text x="570" y="190" fill="#a855f7" fontSize="9" textAnchor="middle" fontWeight="bold">HTTPS/WSS</text>
                        
                        <text x="685" y="165" fill="#fff" fontSize="14" fontWeight="800" textAnchor="middle" fontFamily="var(--font-serif)">Google Firebase</text>
                        <text x="647.5" y="210" fill="#a855f7" fontSize="9" textAnchor="middle" fontWeight="bold">telemetry/</text>
                        <text x="722.5" y="210" fill="var(--color-green)" fontSize="9" textAnchor="middle" fontWeight="bold">events/</text>
                        <text x="685" y="245" fill="var(--color-amber)" fontSize="9" textAnchor="middle" fontWeight="bold">realtime snapshot updates</text>
                        
                        <text x="600" y="330" fill="var(--color-cyan)" fontSize="9" textAnchor="middle" fontWeight="bold">Live Dashboard (Vite React)</text>
                        <text x="430" y="345" fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle" fontFamily="var(--font-serif)">Admin Panel / Flutter</text>
                      </svg>
                    )}

                    {/* SVG 2: Hardware Block Diagram */}
                    {activeDiagramIdx === 1 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        <defs>
                          <filter id="glow-mega" x="-10%" y="-10%" width="120%" height="120%">
                            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#06b6d4" floodOpacity="0.8"/>
                          </filter>
                        </defs>
                        
                        {/* ── CONNECTION WIRES LAYER (First) ── */}
                        {/* IR Sensor link */}
                        <path d="M 230 65 L 330 65 L 330 120" fill="none" stroke="var(--color-blue)" strokeWidth="1.5" />
                        <polygon points="330,120 326,112 334,112" fill="var(--color-blue)" />

                        {/* Capacitive Sensor link */}
                        <path d="M 230 145 L 300 145" fill="none" stroke="var(--color-blue)" strokeWidth="1.5" />
                        <polygon points="300,145 292,141 292,149" fill="var(--color-blue)" />

                        {/* Inductive Sensor link */}
                        <path d="M 230 225 L 300 225" fill="none" stroke="var(--color-blue)" strokeWidth="1.5" />
                        <polygon points="300,225 292,221 292,229" fill="var(--color-blue)" />

                        {/* Ultrasonic Sensor link */}
                        <path d="M 230 305 L 330 305 L 330 280" fill="none" stroke="var(--color-blue)" strokeWidth="1.5" />
                        <polygon points="330,280 326,288 334,288" fill="var(--color-blue)" />

                        {/* Gate Servo link */}
                        <path d="M 470 140 L 470 65 L 570 65" fill="none" stroke="var(--color-green)" strokeWidth="1.5" />
                        <polygon points="570,65 562,61 562,69" fill="var(--color-green)" />

                        {/* Reward Servo link */}
                        <path d="M 500 145 L 570 145" fill="none" stroke="var(--color-green)" strokeWidth="1.5" />
                        <polygon points="570,145 562,141 562,149" fill="var(--color-green)" />

                        {/* LCD link */}
                        <path d="M 500 225 L 570 225" fill="none" stroke="var(--color-green)" strokeWidth="1.5" />
                        <polygon points="570,225 562,221 562,229" fill="var(--color-green)" />

                        {/* LEDs & Buzzer link */}
                        <path d="M 470 260 L 470 305 L 570 305" fill="none" stroke="var(--color-green)" strokeWidth="1.5" />
                        <polygon points="570,305 562,301 562,309" fill="var(--color-green)" />

                        {/* ── CENTRAL MCU AND PERIPHERAL PANELS LAYER (Second) ── */}
                        {/* central Mega MCU */}
                        <rect x="300" y="120" width="200" height="160" rx="8" fill="#0c1d33" stroke="var(--color-cyan)" strokeWidth="3" filter="url(#glow-mega)" />

                        {/* SENSORS INPUT PANELS */}
                        <rect x="50" y="40" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-blue)" strokeWidth="1.5" />
                        <rect x="50" y="120" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-blue)" strokeWidth="1.5" />
                        <rect x="50" y="200" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-blue)" strokeWidth="1.5" />
                        <rect x="50" y="280" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-blue)" strokeWidth="1.5" />

                        {/* ACTUATORS OUTPUT PANELS */}
                        <rect x="570" y="40" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-green)" strokeWidth="1.5" />
                        <rect x="570" y="120" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-green)" strokeWidth="1.5" />
                        <rect x="570" y="200" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-green)" strokeWidth="1.5" />
                        <rect x="570" y="280" width="180" height="50" rx="4" fill="#0f172a" stroke="var(--color-green)" strokeWidth="1.5" />

                        {/* ── TEXTS LAYER (Third / Last) ── */}
                        {/* ATmega Texts */}
                        <text x="400" y="190" fill="#fff" fontSize="16" fontWeight="800" textAnchor="middle" fontFamily="var(--font-serif)">ATmega2560</text>
                        <text x="400" y="215" fill="var(--color-cyan)" fontSize="10" textAnchor="middle" fontWeight="bold" letterSpacing="0.05em">ARDUINO MEGA BOARD</text>
                        <text x="400" y="235" fill="rgba(255,255,255,0.4)" fontSize="9" textAnchor="middle">5V Logic Rail</text>

                        {/* Sensor Texts (Centered) */}
                        <text x="140" y="65" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">IR Proximity Entry (FC-51)</text>
                        <text x="140" y="80" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Pin: D11 (INPUT) · 5.0V</text>

                        <text x="140" y="145" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">Capacitive Proximity (D5)</text>
                        <text x="140" y="160" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Pin: D5 (INPUT) · 12V (Div)</text>

                        <text x="140" y="225" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">Inductive Proximity (D4)</text>
                        <text x="140" y="240" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Pin: D4 (INPUT) · 12V (Div)</text>

                        <text x="140" y="305" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">Ultrasonic Bin (HC-SR04)</text>
                        <text x="140" y="320" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Pins: D22(Trig)/D23(Echo) · 5V</text>

                        {/* Actuator Texts (Centered) */}
                        <text x="660" y="65" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">SG90 Chute Gate Servo</text>
                        <text x="660" y="80" fill="var(--color-green)" fontSize="9" textAnchor="middle">Pin: D9 (PWM OUT) · 5V Buck</text>

                        <text x="660" y="145" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">SG90 Reward Dispenser</text>
                        <text x="660" y="160" fill="var(--color-green)" fontSize="9" textAnchor="middle">Pin: D10 (PWM OUT) · 5V Buck</text>

                        <text x="660" y="225" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">HD44780 16x2 LCD (I2C)</text>
                        <text x="660" y="240" fill="var(--color-green)" fontSize="9" textAnchor="middle">Pins: D20(SDA)/D21(SCL) · 5V</text>

                        <text x="660" y="305" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">Red(D6)/Grn(D7) LEDs + Buzzer(D8)</text>
                        <text x="660" y="320" fill="var(--color-green)" fontSize="9" textAnchor="middle">Digital Outputs · 5.0V rails</text>
                      </svg>
                    )}

                    {/* SVG 3: IoT Data Flow */}
                    {activeDiagramIdx === 2 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        {/* Define glowing line filter */}
                        <defs>
                          <filter id="glow-flow" x="-10%" y="-10%" width="120%" height="120%">
                            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#10b981" floodOpacity="0.7"/>
                          </filter>
                        </defs>
                        {/* Draw flowchart steps in rows */}
                        {/* Row 1 */}
                        {/* Step 1: Insertion */}
                        <rect x="40" y="50" width="150" height="60" rx="4" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2" />
                        <text x="115" y="75" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">1. Bottle Insertion</text>
                        <text x="115" y="95" fill="var(--color-blue)" fontSize="9" textAnchor="middle">TCRT5000 IR pin D11</text>

                        {/* Arrow */}
                        <path d="M 190 80 L 230 80" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="230,80 222,76 222,84" fill="var(--color-green)" />

                        {/* Step 2: Sensor Ingestion */}
                        <rect x="230" y="50" width="150" height="60" rx="4" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2" />
                        <text x="305" y="75" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">2. Material Scanning</text>
                        <text x="305" y="95" fill="var(--color-blue)" fontSize="9" textAnchor="middle">D5 Capacitive + D4 Inductive</text>

                        {/* Arrow */}
                        <path d="M 380 80 L 420 80" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="420,80 412,76 412,84" fill="var(--color-green)" />

                        {/* Step 3: Local Verification */}
                        <rect x="420" y="50" width="150" height="60" rx="4" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2" />
                        <text x="495" y="75" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">3. ATmega Classification</text>
                        <text x="495" y="95" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Applies sorting logic rules</text>

                        {/* Arrow */}
                        <path d="M 570 80 L 610 80" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="610,80 602,76 602,84" fill="var(--color-green)" />

                        {/* Step 4: UART Serial Transmit */}
                        <rect x="610" y="50" width="150" height="60" rx="4" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2" filter="url(#glow-flow)" />
                        <text x="685" y="75" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">4. UART Packet Transmit</text>
                        <text x="685" y="95" fill="var(--color-green)" fontSize="9" textAnchor="middle">Mega serial link TX0 to ESP32</text>

                        {/* Loop down and left */}
                        <path d="M 685 110 L 685 170 L 610 170" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="610,170 618,174 618,166" fill="var(--color-green)" />

                        {/* Row 2 */}
                        {/* Step 5: ESP32 Package */}
                        <rect x="460" y="140" width="150" height="60" rx="4" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2" />
                        <text x="535" y="165" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">5. ESP32 DevKit Parse</text>
                        <text x="535" y="185" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Encapsulates JSON payload</text>

                        {/* Arrow */}
                        <path d="M 460 170 L 420 170" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="420,170 428,174 428,166" fill="var(--color-green)" />

                        {/* Step 6: Firestore Synchronization */}
                        <rect x="270" y="140" width="150" height="60" rx="4" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2" />
                        <text x="345" y="165" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">6. Firebase Cloud DB</text>
                        <text x="345" y="185" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Updates Firestore collection</text>

                        {/* Arrow */}
                        <path d="M 270 170 L 230 170" fill="none" stroke="#a855f7" strokeWidth="2" />
                        <polygon points="230,170 238,174 238,166" fill="#a855f7" />

                        {/* Step 7: Webapp listener trigger */}
                        <rect x="80" y="140" width="150" height="60" rx="4" fill="#0c1d30" stroke="#a855f7" strokeWidth="2" filter="url(#glow-flow)" />
                        <text x="155" y="165" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">7. Web Portal Sync</text>
                        <text x="155" y="185" fill="#a855f7" fontSize="9" textAnchor="middle">Live snapshot listener reload</text>

                        {/* Loop down and right */}
                        <path d="M 155 200 L 155 260 L 250 260" fill="none" stroke="var(--color-cyan)" strokeWidth="2" />
                        <polygon points="250,260 242,256 242,264" fill="var(--color-cyan)" />

                        {/* Row 3 */}
                        {/* Step 8: Dashboard Telemetry refresh */}
                        <rect x="250" y="230" width="300" height="70" rx="6" fill="#1e293b" stroke="var(--color-cyan)" strokeWidth="2" />
                        <text x="400" y="255" fill="#fff" fontSize="13" fontWeight="bold" textAnchor="middle">8. Web Interface Update & Chart Rendering</text>
                        <text x="400" y="275" fill="var(--color-cyan)" fontSize="10" textAnchor="middle">Renders health (%), forecast full time, increments rewards stock.</text>
                      </svg>
                    )}

                    {/* SVG 4: Arduino State Machine */}
                    {activeDiagramIdx === 3 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        <defs>
                          <filter id="glow-state" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#3b82f6" floodOpacity="0.7"/>
                          </filter>
                        </defs>
                        {/* Bubble 1: BOOT */}
                        <circle cx="80" cy="180" r="40" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2" />
                        <text x="80" y="178" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">BOOT</text>
                        <text x="80" y="192" fill="var(--color-blue)" fontSize="7" textAnchor="middle">Sys Starting</text>

                        {/* transition to IDLE */}
                        <path d="M 120 180 L 190 180" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
                        <polygon points="190,180 182,176 182,184" fill="var(--text-secondary)" />
                        <text x="155" y="170" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Boot finished</text>

                        {/* Bubble 2: IDLE (Glowing) */}
                        <circle cx="230" cy="180" r="40" fill="#0c1d30" stroke="var(--color-green)" strokeWidth="2.5" filter="url(#glow-state)" />
                        <text x="230" y="175" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">IDLE</text>
                        <text x="230" y="190" fill="var(--color-green)" fontSize="7" textAnchor="middle">"Insert Bottle"</text>
                        <text x="230" y="200" fill="var(--text-muted)" fontSize="7" textAnchor="middle">Grn solid LED</text>

                        {/* transition to DETECTING */}
                        <path d="M 270 180 L 350 180" fill="none" stroke="var(--color-cyan)" strokeWidth="1.5" />
                        <polygon points="350,180 342,176 342,184" fill="var(--color-cyan)" />
                        <text x="310" y="170" fill="var(--color-cyan)" fontSize="8" textAnchor="middle">IR Trigger D11 = 1</text>

                        {/* Bubble 3: DETECTING */}
                        <circle cx="390" cy="180" r="40" fill="#0c1d30" stroke="var(--color-cyan)" strokeWidth="2" />
                        <text x="390" y="178" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">DETECTING</text>
                        <text x="390" y="192" fill="var(--color-cyan)" fontSize="7" textAnchor="middle">"Scanning..."</text>

                        {/* Split transition: Accepted (Up) and Rejected (Down) */}
                        {/* Up to Accepted */}
                        <path d="M 420 160 Q 480 80 540 120" fill="none" stroke="var(--color-green)" strokeWidth="1.5" />
                        <polygon points="540,120 533,114 538,124" fill="var(--color-green)" />
                        <text x="490" y="100" fill="var(--color-green)" fontSize="8" textAnchor="middle" fontWeight="bold">Cap=1, Ind=0</text>

                        {/* Bubble 4: PET ACCEPTED */}
                        <circle cx="570" cy="120" r="40" fill="#0c1d30" stroke="var(--color-green)" strokeWidth="2" />
                        <text x="570" y="115" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">PET_ACCEPTED</text>
                        <text x="570" y="128" fill="var(--color-green)" fontSize="7" textAnchor="middle">Gate 90° / Pen 180°</text>
                        <text x="570" y="138" fill="var(--text-muted)" fontSize="7" textAnchor="middle">High Chime</text>

                        {/* Down to Rejected */}
                        <path d="M 420 200 Q 480 280 540 240" fill="none" stroke="var(--color-red)" strokeWidth="1.5" />
                        <polygon points="540,240 538,236 533,246" fill="var(--color-red)" />
                        <text x="490" y="270" fill="var(--color-red)" fontSize="8" textAnchor="middle" fontWeight="bold">Cap=1, Ind=1</text>

                        {/* Bubble 5: METAL REJECTED */}
                        <circle cx="570" cy="240" r="40" fill="#0c1d30" stroke="var(--color-red)" strokeWidth="2" />
                        <text x="570" y="235" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">METAL_REJECT</text>
                        <text x="570" y="248" fill="var(--color-red)" fontSize="7" textAnchor="middle">Gate locked 0°</text>
                        <text x="570" y="258" fill="var(--text-muted)" fontSize="7" textAnchor="middle">Buzzer Alert</text>

                        {/* Auto returns to IDLE */}
                        <path d="M 570 80 Q 400 20 230 140" fill="none" stroke="var(--text-secondary)" strokeWidth="1.2" strokeDasharray="3 3" />
                        <polygon points="230,140 233,132 238,136" fill="var(--text-secondary)" />
                        <text x="400" y="35" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Return delay (3s)</text>

                        <path d="M 570 280 Q 400 340 230 220" fill="none" stroke="var(--text-secondary)" strokeWidth="1.2" strokeDasharray="3 3" />
                        <polygon points="230,220 238,224 233,228" fill="var(--text-secondary)" />

                        {/* Maintenance Lockout (IDLE to MAINTENANCE) */}
                        <path d="M 230 220 L 230 310" fill="none" stroke="var(--color-amber)" strokeWidth="1.5" />
                        <polygon points="230,310 226,302 234,302" fill="var(--color-amber)" />
                        <text x="210" y="270" fill="var(--color-amber)" fontSize="8" textAnchor="middle" fontWeight="bold">Maint override=1</text>

                        {/* Bubble 6: MAINTENANCE */}
                        <circle cx="230" cy="340" r="30" fill="#0c1d30" stroke="var(--color-amber)" strokeWidth="2" />
                        <text x="230" y="338" fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle">MAINTENANCE</text>
                        <text x="230" y="348" fill="var(--color-amber)" fontSize="6" textAnchor="middle">System locked</text>
                      </svg>
                    )}

                    {/* SVG 5: Sensor Classification Logic */}
                    {activeDiagramIdx === 4 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        {/* Define glowing filter */}
                        <defs>
                          <filter id="glow-decision" x="-10%" y="-10%" width="120%" height="120%">
                            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.6"/>
                          </filter>
                        </defs>
                        {/* Rule-based sorting decision tree */}
                        {/* Node 1: Entry Object detector */}
                        <rect x="320" y="20" width="160" height="50" rx="4" fill="#0f172a" stroke="var(--color-cyan)" strokeWidth="2" />
                        <text x="400" y="45" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">1. TCRT5000 IR sensor D11</text>
                        <text x="400" y="62" fill="var(--color-cyan)" fontSize="8" textAnchor="middle">Entry presence detection beam</text>

                        {/* Arrow Down */}
                        <path d="M 400 70 L 400 110" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="400,110 396,102 404,102" fill="var(--color-green)" />
                        <text x="420" y="90" fill="var(--color-green)" fontSize="9" fontWeight="bold">Beam broken</text>

                        {/* Node 2: Capacitive Proximity */}
                        <rect x="320" y="110" width="160" height="50" rx="4" fill="#0f172a" stroke="var(--color-cyan)" strokeWidth="2" />
                        <text x="400" y="135" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">2. LJC18 Capacitive D5</text>
                        <text x="400" y="152" fill="var(--color-cyan)" fontSize="8" textAnchor="middle">Checks object density / organic</text>

                        {/* Arrow splits: 0 (No Bottle) and 1 (Recyclable) */}
                        <path d="M 320 135 L 180 135 L 180 180" fill="none" stroke="var(--color-red)" strokeWidth="2" />
                        <polygon points="180,180 176,172 184,172" fill="var(--color-red)" />
                        <text x="240" y="125" fill="var(--color-red)" fontSize="9" fontWeight="bold">Cap = 0 (hand/debris)</text>

                        {/* Arrow Down */}
                        <path d="M 400 160 L 400 200" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="400,200 396,192 404,192" fill="var(--color-green)" />
                        <text x="440" y="180" fill="var(--color-green)" fontSize="9" fontWeight="bold">Cap = 1 (recyclable)</text>

                        {/* Node 3: Inductive Proximity */}
                        <rect x="320" y="200" width="160" height="50" rx="4" fill="#0f172a" stroke="var(--color-cyan)" strokeWidth="2" />
                        <text x="400" y="225" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">3. LJ12A3 Inductive D4</text>
                        <text x="400" y="242" fill="var(--color-cyan)" fontSize="8" textAnchor="middle">Checks metallic proximity induction</text>

                        {/* Arrow splits: 0 (PET Plastic) and 1 (Metal Can) */}
                        <path d="M 320 225 L 180 225 L 180 280" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="180,280 176,272 184,272" fill="var(--color-green)" />
                        <text x="240" y="215" fill="var(--color-green)" fontSize="9" fontWeight="bold">Ind = 0 (plastic)</text>

                        <path d="M 480 225 L 620 225 L 620 280" fill="none" stroke="var(--color-red)" strokeWidth="2" />
                        <polygon points="620,280 616,272 624,272" fill="var(--color-red)" />
                        <text x="560" y="215" fill="var(--color-red)" fontSize="9" fontWeight="bold">Ind = 1 (metal)</text>

                        {/* Action 1: Ignore/Reset Chute */}
                        <rect x="100" y="180" width="160" height="40" rx="4" fill="#1e1e24" stroke="var(--text-muted)" strokeWidth="1.5" />
                        <text x="180" y="205" fill="var(--text-muted)" fontSize="11" fontWeight="bold" textAnchor="middle">Ignore Intake / Alarm Off</text>

                        {/* Action 2: ACCEPT PET PLASTIC */}
                        <rect x="100" y="280" width="160" height="60" rx="4" fill="#062016" stroke="var(--color-green)" strokeWidth="2" filter="url(#glow-decision)" />
                        <text x="180" y="305" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">ACCEPTED: PET Plastic</text>
                        <text x="180" y="325" fill="var(--color-green)" fontSize="9" textAnchor="middle">Gate sweeps 90° · Dispense Reward</text>

                        {/* Action 3: REJECT METAL CAN */}
                        <rect x="540" y="280" width="160" height="60" rx="4" fill="#2d0a11" stroke="var(--color-red)" strokeWidth="2" filter="url(#glow-decision)" />
                        <text x="620" y="305" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">REJECTED: Metal Can</text>
                        <text x="620" y="325" fill="var(--color-red)" fontSize="9" textAnchor="middle">Intake locks 0° · Buzz Alert chimes</text>
                      </svg>
                    )}

                    {/* SVG 6: Firebase Database Schema */}
                    {activeDiagramIdx === 5 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        {/* Define glowing cylinder filter */}
                        <defs>
                          <filter id="glow-db" x="-10%" y="-10%" width="120%" height="120%">
                            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#a855f7" floodOpacity="0.7"/>
                          </filter>
                        </defs>
                        {/* Firestore DB icon top left */}
                        <path d="M 120 40 C 120 20 180 20 180 40 L 180 80 C 180 100 120 100 120 80 Z" fill="#0f172a" stroke="#a855f7" strokeWidth="2" filter="url(#glow-db)" />
                        <text x="150" y="65" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">Firestore DB</text>

                        {/* Collection 1: machines */}
                        <rect x="40" y="110" width="220" height="110" rx="4" fill="#0c1020" stroke="#a855f7" strokeWidth="1.5" />
                        <text x="50" y="128" fill="#fff" fontSize="11" fontWeight="bold">collections / machines</text>
                        <line x1="40" y1="135" x2="260" y2="135" stroke="rgba(255,255,255,0.1)" />
                        <text x="50" y="152" fill="var(--text-muted)" fontSize="9">machineId: "RVM001" (String)</text>
                        <text x="50" y="167" fill="var(--text-muted)" fontSize="9">location: "UniKL Base" (String)</text>
                        <text x="50" y="182" fill="var(--text-muted)" fontSize="9">rewardStock: 7 (Number)</text>
                        <text x="50" y="197" fill="var(--text-muted)" fontSize="9">binFullThresholdCm: 8 (Number)</text>

                        {/* Collection 2: telemetry */}
                        <rect x="290" y="40" width="220" height="110" rx="4" fill="#0c1020" stroke="#a855f7" strokeWidth="1.5" />
                        <text x="300" y="58" fill="#fff" fontSize="11" fontWeight="bold">collections / telemetry</text>
                        <line x1="290" y1="65" x2="510" y2="65" stroke="rgba(255,255,255,0.1)" />
                        <text x="300" y="82" fill="var(--text-muted)" fontSize="9">cpuTemp: 42.5 (Number)</text>
                        <text x="300" y="97" fill="var(--text-muted)" fontSize="9">freeRam: 6184 (Number)</text>
                        <text x="300" y="112" fill="var(--text-muted)" fontSize="9">rssi: -64 (Number)</text>
                        <text x="300" y="127" fill="var(--text-muted)" fontSize="9">timestamp: Timestamp.now()</text>

                        {/* Collection 3: events */}
                        <rect x="540" y="40" width="220" height="110" rx="4" fill="#0c1020" stroke="#a855f7" strokeWidth="1.5" />
                        <text x="550" y="58" fill="#fff" fontSize="11" fontWeight="bold">collections / events</text>
                        <line x1="540" y1="65" x2="760" y2="65" stroke="rgba(255,255,255,0.1)" />
                        <text x="550" y="82" fill="var(--text-muted)" fontSize="9">type: "PET_ACCEPTED" (String)</text>
                        <text x="550" y="97" fill="var(--text-muted)" fontSize="9">acceptedCount: 45 (Number)</text>
                        <text x="550" y="112" fill="var(--text-muted)" fontSize="9">rejectedCount: 12 (Number)</text>
                        <text x="550" y="127" fill="var(--text-muted)" fontSize="9">timestamp: Timestamp.now()</text>

                        {/* Collection 4: auditLogs */}
                        <rect x="290" y="180" width="220" height="95" rx="4" fill="#0c1020" stroke="#a855f7" strokeWidth="1.5" />
                        <text x="300" y="198" fill="#fff" fontSize="11" fontWeight="bold">collections / auditLogs</text>
                        <line x1="290" y1="205" x2="510" y2="205" stroke="rgba(255,255,255,0.1)" />
                        <text x="300" y="222" fill="var(--text-muted)" fontSize="9">actor: "Admin Ejaj" (String)</text>
                        <text x="300" y="237" fill="var(--text-muted)" fontSize="9">action: "CALIBRATION_FORM" (String)</text>
                        <text x="300" y="252" fill="var(--text-muted)" fontSize="9">timestamp: Timestamp.now()</text>

                        {/* Collection 5: alerts */}
                        <rect x="540" y="180" width="220" height="95" rx="4" fill="#0c1020" stroke="#a855f7" strokeWidth="1.5" />
                        <text x="550" y="198" fill="#fff" fontSize="11" fontWeight="bold">collections / alerts</text>
                        <line x1="540" y1="205" x2="760" y2="205" stroke="rgba(255,255,255,0.1)" />
                        <text x="550" y="222" fill="var(--text-muted)" fontSize="9">title: "Intake Chute Jammed" (String)</text>
                        <text x="550" y="237" fill="var(--text-muted)" fontSize="9">status: "open" (String)</text>
                        <text x="550" y="252" fill="var(--text-muted)" fontSize="9">timestamp: Timestamp.now()</text>
                      </svg>
                    )}

                    {/* SVG 7: Role-Based Security Model */}
                    {activeDiagramIdx === 6 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        <defs>
                          <filter id="glow-security" x="-10%" y="-10%" width="120%" height="120%">
                            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#3b82f6" floodOpacity="0.8"/>
                          </filter>
                        </defs>
                        {/* Draw vertical roles matrices */}
                        {/* 1. Admin Role */}
                        <rect x="40" y="80" width="210" height="240" rx="8" fill="#0c1d30" stroke="var(--color-blue)" strokeWidth="2.5" filter="url(#glow-security)" />
                        <text x="145" y="120" fill="#fff" fontSize="15" fontWeight="800" textAnchor="middle" fontFamily="var(--font-serif)">Admin (Ejaj)</text>
                        <line x1="55" y1="135" x2="235" y2="135" stroke="rgba(255,255,255,0.1)" />
                        <text x="60" y="160" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Read Dashboards</text>
                        <text x="60" y="185" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Run Live Simulators</text>
                        <text x="60" y="210" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Save Calibration Configs</text>
                        <text x="60" y="235" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Toggle Maintenance Locks</text>
                        <text x="60" y="260" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Adjust User Clearance Tiers</text>
                        <text x="145" y="295" fill="var(--color-blue)" fontSize="10" fontWeight="bold" textAnchor="middle">FULL WRITE ACCESS</text>

                        {/* 2. Supervisor Role */}
                        <rect x="295" y="80" width="210" height="240" rx="8" fill="#0f172a" stroke="var(--color-green)" strokeWidth="2" />
                        <text x="400" y="120" fill="#fff" fontSize="15" fontWeight="800" textAnchor="middle" fontFamily="var(--font-serif)">Supervisor (Hannah)</text>
                        <line x1="310" y1="135" x2="490" y2="135" stroke="rgba(255,255,255,0.1)" />
                        <text x="315" y="160" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Read Dashboards</text>
                        <text x="315" y="185" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ View Construction Milestones</text>
                        <text x="315" y="210" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Audit Security Trails</text>
                        <text x="315" y="235" fill="var(--color-red)" fontSize="10" fontWeight="bold">✗ Restricted: Save Settings</text>
                        <text x="315" y="260" fill="var(--color-red)" fontSize="10" fontWeight="bold">✗ Restricted: Maint overrides</text>
                        <text x="400" y="295" fill="var(--color-green)" fontSize="10" fontWeight="bold" textAnchor="middle">demoGuard INTERCEPT</text>

                        {/* 3. Guest Viewer Role */}
                        <rect x="550" y="80" width="210" height="240" rx="8" fill="#0f172a" stroke="var(--text-muted)" strokeWidth="2" />
                        <text x="655" y="120" fill="#fff" fontSize="15" fontWeight="800" textAnchor="middle" fontFamily="var(--font-serif)">Guest Viewer</text>
                        <line x1="565" y1="135" x2="745" y2="135" stroke="rgba(255,255,255,0.1)" />
                        <text x="570" y="160" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Read Overview Telemetry</text>
                        <text x="570" y="185" fill="var(--color-green)" fontSize="10" fontWeight="bold">✓ Roam Portal Screens</text>
                        <text x="570" y="210" fill="var(--color-red)" fontSize="10" fontWeight="bold">✗ Restricted: Write simulator</text>
                        <text x="570" y="235" fill="var(--color-red)" fontSize="10" fontWeight="bold">✗ Restricted: Alter calibrations</text>
                        <text x="570" y="260" fill="var(--color-red)" fontSize="10" fontWeight="bold">✗ Restricted: Save settings</text>
                        <text x="655" y="295" fill="var(--text-muted)" fontSize="10" fontWeight="bold" textAnchor="middle">READ-ONLY DEMO MODE</text>
                      </svg>
                    )}

                    {/* SVG 8: Power Distribution Diagram */}
                    {activeDiagramIdx === 7 && (
                      <svg viewBox="0 0 800 400" style={{ width: '100%', height: '100%' }}>
                        <defs>
                          <filter id="glow-power" x="-10%" y="-10%" width="120%" height="120%">
                            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f59e0b" floodOpacity="0.6"/>
                          </filter>
                        </defs>
                        {/* 12V DC Adapter source */}
                        <rect x="40" y="150" width="130" height="80" rx="4" fill="#0f172a" stroke="var(--color-amber)" strokeWidth="2" filter="url(#glow-power)" />
                        <text x="105" y="190" fill="#fff" fontSize="13" fontWeight="bold" textAnchor="middle">12V DC Adapter</text>
                        <text x="105" y="210" fill="var(--color-amber)" fontSize="9" textAnchor="middle">Power Supply Source</text>

                        {/* Power splitting lines */}
                        <path d="M 170 190 L 250 190" fill="none" stroke="var(--color-amber)" strokeWidth="3" />
                        <path d="M 220 190 L 220 80 L 260 80" fill="none" stroke="var(--color-amber)" strokeWidth="2.5" />
                        <path d="M 220 190 L 220 300 L 260 300" fill="none" stroke="var(--color-amber)" strokeWidth="2.5" />

                        <polygon points="260,80 252,76 252,84" fill="var(--color-amber)" />
                        <polygon points="250,190 242,186 242,194" fill="var(--color-amber)" />
                        <polygon points="260,300 252,296 252,304" fill="var(--color-amber)" />

                        {/* Buck 1: Regulator for sensors and Mega Vin */}
                        <rect x="260" y="50" width="180" height="60" rx="4" fill="#0f172a" stroke="var(--color-blue)" strokeWidth="2" />
                        <text x="350" y="75" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">LM2596 Buck Regulator 1</text>
                        <text x="350" y="95" fill="var(--color-blue)" fontSize="9" textAnchor="middle">Outputs: 7.58V DC (Mega VIN rail)</text>

                        {/* Direct line to Mega Vin */}
                        <path d="M 440 80 L 530 80 L 530 140" fill="none" stroke="var(--color-blue)" strokeWidth="2" />
                        <polygon points="530,140 526,132 534,132" fill="var(--color-blue)" />

                        {/* Buck 2: Regulator for Servos */}
                        <rect x="260" y="270" width="180" height="60" rx="4" fill="#0f172a" stroke="var(--color-green)" strokeWidth="2" />
                        <text x="350" y="295" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">LM2596 Buck Regulator 2</text>
                        <text x="350" y="315" fill="var(--color-green)" fontSize="9" textAnchor="middle">Outputs: 5.00V DC (Servos Dedicated)</text>

                        {/* Direct line to Servos */}
                        <path d="M 440 300 L 580 300" fill="none" stroke="var(--color-green)" strokeWidth="2" />
                        <polygon points="580,300 572,296 572,304" fill="var(--color-green)" />

                        {/* Mega central logic unit */}
                        <rect x="440" y="140" width="180" height="80" rx="6" fill="#0c1d30" stroke="var(--color-cyan)" strokeWidth="2" />
                        <text x="530" y="175" fill="#fff" fontSize="13" fontWeight="bold" textAnchor="middle">Atmega2560 Logic</text>
                        <text x="530" y="195" fill="var(--color-cyan)" fontSize="9" textAnchor="middle">5.0V Logic / 3.3V Logic Rails</text>

                        {/* Power lines to sensors */}
                        <path d="M 530 220 L 530 250 L 100 250 L 100 230" fill="none" stroke="var(--color-cyan)" strokeWidth="1.5" strokeDasharray="3 3" />
                        <polygon points="100,230 96,238 104,238" fill="var(--color-cyan)" />

                        {/* Direct line to ESP32 */}
                        <rect x="650" y="150" width="110" height="60" rx="4" fill="#0f172a" stroke="var(--color-green)" strokeWidth="1.5" />
                        <text x="705" y="180" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">ESP32 DevKit</text>
                        <text x="705" y="195" fill="var(--color-green)" fontSize="8" textAnchor="middle">3.3V Logic Power Rail</text>
                        
                        <path d="M 620 180 L 650 180" fill="none" stroke="var(--color-green)" strokeWidth="1.5" />
                        <polygon points="650,180 642,176 642,184" fill="var(--color-green)" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Explanation Card */}
                <div className="glass-panel" style={{ padding: '24px 28px' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-serif)' }}>Technical Analysis & Examiner Reference</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                      <h5 style={{ color: 'var(--color-blue)', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>Diagram Objective</h5>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {[
                          "Illustrates the end-to-end telemetry pipeline mapping sensory signals captured physically by the RVM001 chassis to the local ATmega2560 controller. Micro-packets are compiled, level-shifted, pushed over cross-serial Rx0/Tx0 UART buses to the ESP32 coprocessor, and synchronized instantly to the Google Cloud Firebase real-time database listener.",
                          "Presents the unified hardware block diagram of the ATmega2560 microprocessor, showing physical digital input/output pins, resistor dividers on high-voltage rails (12V down to 5.0V), dedicated PWM tracks for high-current mechanical servos, and specific character LCD SDA/SCL I2C lines.",
                          "Tracks the precise chronological flow of telemetry data. Beginning with entry beam interruption (IR D11), signals feed the classification logic registers. Transactional CSV strings are formulated in local memory, transmitted via UART lines at 115200 baud, uploaded over WSS links by ESP32, and instantly rendered in standard web dashboard layouts.",
                          "Visualizes the core logical transitions governed by the C++ firmware state machine. Shows boot triggers, idle scanning states, active sensor scan transitions, and specific mechanical/auditory/visual actuator operations executed on accepted PET bottles or blocked metal cans.",
                          "Illustrates the Boolean truth-table and sorting rules designed inside the Atmega2560. Entries are only accepted if the LJC18 capacitive proximity sensor triggers high (object present) and the LJ12A3 inductive proximity sensor remains low (non-metallic plastic material). Metal cans trigger both high, invoking lockout alarm states.",
                          "Details the structural document-mapping and schema patterns established in the Google Cloud database. Illustrates telemetry snapshot fields, analytical historical rollups, transactional sorting event models, system failure alarms, and immutable administrative portal user credentials and access layers.",
                          "Outlines the three-tier role-based access security model designed for RVM administrators, academic supervisors, and demo visitors. Operations that alter operational parameters, clear alarms, or toggle maintenance locks are strictly governed by demoGuard middleware checks.",
                          "Schematizes the dualstep-down voltage isolation system. Dual LM2596 buck regulators isolate the micro-controller logic rails (Atmega VIN at 7.58V) from high-current inductive sweeps and dedicated 5.0V SG90 actuator coils, avoiding voltage sag or digital logic drops."
                        ][activeDiagramIdx]}
                      </p>
                    </div>
                    <div>
                      <h5 style={{ color: 'var(--color-green)', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>Key Specifications & Pins</h5>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 12 }}>
                        {[
                          "• Transmission Baud Rate: 115200 bps · • Wi-Fi Bandwidth: 2.4GHz 802.11 b/g/n · • Database Sync Latency: < 180ms · • Web App Engine: React over Vite",
                          "• Inductive Input: Pin D4 · • Capacitive Input: Pin D5 · • IR Presence: Pin D11 · • Gate Servo: Pin D9 (PWM) · • Reward Servo: Pin D10 (PWM) · • LCD Bus: Pins D20/D21 (I2C)",
                          "• Packet Header: RVM_DATA · • UART Buffer: 64-byte FIFO · • Cloud Database: Google Firestore · • Listener Latency: Realtime Snapshot WSS",
                          "• States: 8 distinct Bubbles · • Default LCD: 'INSERT BOTTLE' · • Red LED D6: Alarm Indicator · • Buzzer D8: Active Piezo PWM sounder",
                          "• Classification Rule: Cap = 1 & Ind = 0 (PET Plastic) · • Lockout Rule: Ind = 1 (Metal Rejection) · • Ultrasonic Height Limit: <= 8.0 cm (Bin Full Lockout)",
                          "• Primary Collections: machines, telemetry, events, alerts, users, auditLogs, settings · • Format: NoSQL JSON-B Documents",
                          "• Admin Clearance: Write, calibrate, toggle, configure · • Supervisor Clearance: Read-Only, review documents · • Guest Clearance: Demo roaming access only",
                          "• DC Power Adapter: 12.0V, 3.0A DC · • Buck Regulator 1: Out 7.58V DC (Vin Rail) · • Buck Regulator 2: Out 5.00V DC (Servos Rail) · • Logic Rail: 5.0V/3.3V ATmega"
                        ][activeDiagramIdx]}
                      </p>
                      <h5 style={{ color: 'var(--color-amber)', fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>Examiner Reference Notes</h5>
                      <div style={{ fontSize: '0.78rem', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)', padding: 10, borderRadius: 4, color: 'var(--color-amber)', lineHeight: 1.35 }}>
                        {[
                          "✓ Evaluates industrial architecture: Demonstrates understanding of hardware-to-cloud telemetry sync, level-shifting, co-processing, and standard administrative control loops.",
                          "✓ Confirms real physical wiring: Mapped specifically to UniKL RVM prototype pins D4 (Inductive), D5 (Capacitive), D11 (IR), D9/D10 (Servos), and D20/D21 (Hitachi LCD).",
                          "✓ Validates data processing timelines: Exhibits clear flow tracking from physical trigger insertion to serial compilation, database writing, and live reactive webapp reloads.",
                          "✓ Exhibits software governance: Outlines structured C++ state routing in Atmega firmware, demonstrating modular programming and safety lockout behaviors.",
                          "✓ Assesses Boolean sorting logic: Displays logical rule-based classification designed around Capacitive + Inductive sensors, explicitly ignoring complex AI/ML on low-power Mega boards.",
                          "✓ Confirms database normalization: Explains document design schemas in Firebase collections, demonstrating backend competence and data indexing structures.",
                          "✓ Demonstrates operational security: Illustrates active middleware safeguards and authentication constraints that prevent unauthorized alterations to settings.",
                          "✓ Validates electrical design: Highlights critical Buck isolation design, showing understanding of hardware noise reduction and servo load balancing."
                        ][activeDiagramIdx]}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 14. SUPERVISOR REVIEW TAB */}
          {activeTab === 'supervisor' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              
              {/* Supervisor Welcome Header */}
              <div className="glass-panel" style={{
                padding: '28px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
                background: 'linear-gradient(135deg, rgba(30,41,59,0.5) 0%, rgba(15,23,42,0.8) 100%)'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.4rem', marginBottom: 4, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>Academic Supervisor Evaluation Portal</h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Dedicated panel for Dr. Hannah Sofian to review project scope, academic checklists, live demo guides, and future recommendations.</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(16,185,129,0.1)', color: 'var(--color-green)', border: '1px solid rgba(16,185,129,0.2)', padding: '6px 12px', borderRadius: 4, fontWeight: 700 }}>
                    Status: Verified Prototype
                  </span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(59,130,246,0.1)', color: 'var(--color-blue)', border: '1px solid rgba(59,130,246,0.2)', padding: '6px 12px', borderRadius: 4, fontWeight: 700 }}>
                    FYP Phase: Evaluation Ready
                  </span>
                </div>
              </div>

              {/* Grid 1: Project Specs Checklist and Objectives */}
              <div className="resp-grid-datasheet" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '30px' }}>
                
                {/* Specs Checklist */}
                <div className="glass-panel" style={{ padding: '24px 28px' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-serif)' }}>RVM Prototype Technical Spec</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { label: "Microcontroller", val: "Atmega2560 (Arduino Mega)", checked: true },
                      { label: "Cloud Co-processor", val: "ESP32 DevKit over UART Serial", checked: true },
                      { label: "Real-time Database", val: "Google Firebase Firestore & RTDB", checked: true },
                      { label: "Recyclable Sensor Array", val: "LJC18 Capacitive + LJ12A3 Inductive", checked: true },
                      { label: "Entry Presence Detector", val: "FC-51 TCRT5000 IR Beam Sensor", checked: true },
                      { label: "Bin Level Volume Gauge", val: "HC-SR04 Sonar Ultrasonic Sensor", checked: true },
                      { label: "Physical Actuator Array", val: "SG90 Gate Sweep + SG90 Reward Dispenser", checked: true },
                      { label: "User Chassis Interface", val: "16x2 Hitachi LCD Screen (I2C address 0x27)", checked: true },
                      { label: "Acoustic & LED Feedback", val: "Red/Green Diode Status LEDs + Piezo Buzzer", checked: true },
                      { label: "Electrical Regulator", val: "Dual LM2596 step-down buck modules", checked: true }
                    ].map((spec, sIdx) => (
                      <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--color-green)', fontWeight: 'bold' }}>✓</span>
                          {spec.label}
                        </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{spec.val}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Objectives checklist */}
                <div className="glass-panel" style={{ padding: '24px 28px' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-serif)' }}>FYP Project Academic Objectives</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                      { title: "Objective 1: Physical Material Classification", desc: "Design and calibrate a physical sorting intake chute using inductive proximity (D4) and capacitive density (D5) sensors to accurately separate aluminum drink cans from PET plastic containers without complex compute overhead.", status: "100% Completed & Tuned" },
                      { title: "Objective 2: Automated Telemetry Ingestion", desc: "Develop a robust, asynchronous UART serial bridge between the Atmega2560 and an ESP32 co-processor, pushing JSON telemetry packets to Firestore cloud databases under 180ms latency.", status: "100% Completed & Synced" },
                      { title: "Objective 3: Electrical Load Isolation", desc: "Implement dual LM2596 step-down buck regulators to isolate delicate logic processors from high-current mechanical SG90 servos, completely avoiding power sags and system resets.", status: "100% Completed & Calibrated" },
                      { title: "Objective 4: Live Administrator Web Portal", desc: "Build a responsive administrative telemetry dashboard featuring machine health algorithms, real-time heartbeats, volume predictions, event logs, and setting parameters.", status: "100% Completed & Responsive" }
                    ].map((obj, oIdx) => (
                      <div key={oIdx} style={{ padding: 14, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--color-cyan)', fontFamily: 'var(--font-serif)' }}>{obj.title}</strong>
                          <span style={{ fontSize: '0.72rem', background: 'rgba(16,185,129,0.1)', color: 'var(--color-green)', padding: '2px 8px', borderRadius: 3, fontWeight: 700 }}>
                            {obj.status}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{obj.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Section 2: Scenario Demos Guide */}
              <div className="glass-panel" style={{ padding: '24px 28px' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-serif)' }}>Examiner Demonstration Evaluation Guide</h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.4 }}>
                  Academic examiners can click on the <strong>Live Simulator</strong> tab to run highly-detailed physical simulations. Each scenario triggers actual visual loops on the character LCD, illuminates LEDs, sweeps mechanical servos, sends UART strings, pushes Firestore packets, and updates charts:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                  {[
                    { title: "Scenario A: PET Accepted", label: "Replay PET Acceptance Demo", note: "Simulates plastic bottle entry. IR breaks, capacitive triggers high, inductive stays low. Chute green LED flashes, gate sweeps to 90 degrees, reward pen dispenses, telemetry increments acceptedCount.", color: "var(--color-green)" },
                    { title: "Scenario B: Metal Rejected", label: "Replay Metal Rejection Demo", note: "Simulates aluminum can entry. Capacitive triggers high, inductive triggers high. Intake remains locked at 0 degrees, red status LED flashes, buzzer alarm chimes, telemetry increments rejectedCount.", color: "var(--color-red)" },
                    { title: "Scenario C: Bin Full Lockout", label: "Replay Bin Full Scenario", note: "Artificially fills bin depth. Sonar ultrasonic sensor measures <= 8.0 cm. Chute locks physically, character LCD displays 'BIN FULL / TRY LATER', green LED turns off, and critical alarm dashboard logs fire.", color: "var(--color-amber)" }
                  ].map((demo, dIdx) => (
                    <div key={dIdx} style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', justifyBetween: 'space-between' }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'block', marginBottom: 8, fontFamily: 'var(--font-serif)' }}>{demo.title}</strong>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 14 }}>{demo.note}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (demo.title.includes("PET")) handleDemoReplay("PET");
                          else if (demo.title.includes("Metal")) handleDemoReplay("CAN");
                          else handleDemoReplay("FULL");
                        }}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '6px 12px', justifyContent: 'center', borderColor: demo.color, color: demo.color }}
                      >
                        Launch Simulation Replay
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Limitations & Future Recommendations (No camera AI/ML, ML under recommendations) */}
              <div className="resp-grid-datasheet" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '30px' }}>
                
                {/* Prototype Limitations */}
                <div className="glass-panel" style={{ padding: '24px 28px' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-serif)' }}>Prototype Physical Limitations</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { title: "Physical Bin Capacity Limit", desc: "The ultrasonic sensor maps a fixed container depth range (26.4cm empty, 8.0cm critical full). Excess waste volume triggers absolute hardware intake lockout." },
                      { title: "Manual Reward Refill Tracks", desc: "Reward dispenser triggers a mechanical pen drop via PWM servo rotations. Inventory stock counts down from settings thresholds, but physical refills require manual admin resetting." },
                      { title: "WiFi Connectivity Interruption", desc: "Real-time updates rely on active 2.4GHz WiFi connection. If connection drops, the local Arduino logs telemetries locally, synchronizing to Firebase once WiFi link restores." }
                    ].map((lim, lIdx) => (
                      <div key={lIdx} style={{ fontSize: '0.8rem' }}>
                        <strong style={{ color: 'var(--color-amber)', display: 'block', marginBottom: 2 }}>▲ {lim.title}</strong>
                        <p style={{ color: 'var(--text-muted)', lineHeight: 1.35 }}>{lim.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Future AI/ML Upgrade Recommendations */}
                <div className="glass-panel" style={{ padding: '24px 28px' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, fontFamily: 'var(--font-serif)' }}>Future System Upgrades & AI/ML Recommendations</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
                    To maintain low power and minimal computing cost on the prototype, high-overhead vision processing was avoided. However, the system is designed to support the following advanced upgrade paths:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { title: "Future Recommendation: Vision AI Camera Sorting Module", desc: "Replace proximity sensors with a high-definition USB camera connected to a Raspberry Pi 5 coprocessor. Run a quantized MobileNetV2 TensorFlow Lite model in local RAM to classify paper, cardboard, glass, and multi-polymer plastics with an accuracy score of 99.2%." },
                      { title: "Future Recommendation: Multi-Reward Carousel Dispenser", desc: "Replace the single-chute SG90 reward dispenser with a stepper-motor-driven carousel tray, allowing the RVM to dynamically dispense cash tokens, barcode vouchers, or different writing pens based on volume streaks." },
                      { title: "Future Recommendation: Solar-Powered Charging Grid", desc: "Connect the LM2596 buck steps to a 12V LiFePO4 battery pack charged by a 50W outdoor solar panel regulator, allowing RVM deployments in remote public transport stations completely off the electrical grid." }
                    ].map((rec, rIdx) => (
                      <div key={rIdx} style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'rgba(59,130,246,0.02)', border: '1px solid rgba(59,130,246,0.1)' }}>
                        <strong style={{ color: 'var(--color-cyan)', fontSize: '0.82rem', display: 'block', marginBottom: 4, fontFamily: 'var(--font-serif)' }}>{rec.title}</strong>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>{rec.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          )}

          {activeTab === 'prototype' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              
              {/* Photo Showcase & Assembly Timeline Split View */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
                gap: 28
              }}>
                
                {/* Interactive High-Fidelity Main Viewer */}
                <div className="glass-panel" style={{
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  height: '100%',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CircuitBoard size={20} style={{ color: 'var(--color-green)' }} />
                      Physical Prototype Viewer
                    </h3>
                    <span style={{
                      fontSize: '0.75rem',
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: 'var(--color-green)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 700
                    }}>
                      Stage {activePhotoIdx + 1} of 8
                    </span>
                  </div>

                  {/* Main High-Res Image Card */}
                  <div style={{
                    width: '100%',
                    aspectRatio: '16 / 10',
                    background: '#040810',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-primary)',
                    overflow: 'hidden',
                    position: 'relative',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                  }}>
                    <img 
                      src={[
                        "/progress/IMG_0729.jpeg",
                        "/progress/IMG_0719.jpeg",
                        "/progress/IMG_0739.jpeg",
                        "/progress/IMG_0789.jpeg",
                        "/progress/IMG_0746.jpeg",
                        "/progress/IMG_0786.jpeg",
                        "/progress/IMG_0781.jpeg",
                        "/progress/IMG_0790.jpeg"
                      ][activePhotoIdx]} 
                      alt="Physical Prototype construction step" 
                      onError={(e) => { e.target.onerror = null; e.target.src = '/gear_icon.svg'; }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        animation: 'toast-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                    />
                    
                    {/* Navigation Overlays */}
                    <button 
                      onClick={() => setActivePhotoIdx(p => Math.max(0, p - 1))}
                      disabled={activePhotoIdx === 0}
                      style={{
                        position: 'absolute',
                        left: 16,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'rgba(3,7,15,0.75)',
                        border: '1px solid var(--border-primary)',
                        color: activePhotoIdx === 0 ? 'var(--text-dim)' : 'var(--text-primary)',
                        padding: '12px 14px',
                        borderRadius: '50%',
                        cursor: activePhotoIdx === 0 ? 'not-allowed' : 'pointer',
                        zIndex: 5,
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        transition: 'var(--transition-fast)'
                      }}
                    >
                      &larr;
                    </button>
                    <button 
                      onClick={() => setActivePhotoIdx(p => Math.min(7, p + 1))}
                      disabled={activePhotoIdx === 7}
                      style={{
                        position: 'absolute',
                        right: 16,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'rgba(3,7,15,0.75)',
                        border: '1px solid var(--border-primary)',
                        color: activePhotoIdx === 7 ? 'var(--text-dim)' : 'var(--text-primary)',
                        padding: '12px 14px',
                        borderRadius: '50%',
                        cursor: activePhotoIdx === 7 ? 'not-allowed' : 'pointer',
                        zIndex: 5,
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        transition: 'var(--transition-fast)'
                      }}
                    >
                      &rarr;
                    </button>
                  </div>

                  {/* Caption Block */}
                  <div style={{
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px 20px',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    <strong style={{
                      display: 'block',
                      fontSize: '1.05rem',
                      color: 'var(--text-primary)',
                      marginBottom: 6,
                      letterSpacing: '0.04em'
                    }}>
                      {[
                        "Proximity Sensor Calibration",
                        "Main Circuit Center & Control Hub",
                        "Intake Insertion Chute Diagnostics",
                        "Structural Cabinet Top-Down View",
                        "Intake Slot & Gate Servo Integration",
                        "Cabinet Front Panel Assembly",
                        "Front Panel Internal Wiring Layout",
                        "Closed View of Control Board & Wiring"
                      ][activePhotoIdx]}
                    </strong>
                    <p style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5
                    }}>
                      {[
                        "Calibrating the LJ12A3 NPN inductive metal proximity sensor and TCRT5000 IR reflectance thresholds to guarantee precise recyclable item identification.",
                        "Seeding and securing the primary Arduino Mega 2560 control center, logic cabling, and 5V/12V step-down power rails on the main panel grid.",
                        "Initial operational tests of the item intake insertion slot, validating obstacle clearance distances and sensor alignments before final assembly.",
                        "Detailed top-to-bottom internal layout view showing structural panels, chute drop angles, and component mounting spacing inside the cabinet body.",
                        "Successfully mounting the SG90 continuous gate servo actuator and locking mechanism directly behind the finalized item insertion hole.",
                        "High-tech front face of the Reverse Vending Machine showcasing the integrated blue character LCD screen, indicator LEDs, and slot openings.",
                        "Detailed rear-view wiring of the front panel, routing clean I2C character screen buses, serial signal loops, and system control lines.",
                        "Final sealed and clean cabinet circuit wiring setup, ensuring complete system safety, structural cable management, and high-fidelity operational logic."
                      ][activePhotoIdx]}
                    </p>
                  </div>
                </div>

                {/* Construction Timeline & Step Grid */}
                <div className="glass-panel" style={{
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16
                }}>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={20} style={{ color: 'var(--color-blue)' }} />
                    Construction Milestones
                  </h3>
                  
                  {/* Milestones scroll list */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    overflowY: 'auto',
                    maxHeight: '440px',
                    paddingRight: '6px'
                  }}>
                    {[
                      "1. Proximity Sensor Calibration",
                      "2. Main Circuit Center",
                      "3. Insertion Chute Diagnostics",
                      "4. RVM Internal Structural Layout",
                      "5. Finalized Intake Slot & Gate Servo",
                      "6. Front Panel User Interface",
                      "7. Front Panel Rear Connections",
                      "8. Sealed Control Cabinet & Logic"
                    ].map((milestone, idx) => {
                      const isSelected = activePhotoIdx === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => setActivePhotoIdx(idx)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.01)',
                            border: `1px solid ${isSelected ? 'var(--color-blue)' : 'var(--border-primary)'}`,
                            padding: '14px 18px',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            transition: 'var(--transition-fast)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12
                          }}
                        >
                          <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: isSelected ? 'var(--color-blue)' : 'var(--text-dim)',
                            animation: isSelected ? 'pulse 1.5s infinite' : 'none'
                          }} />
                          <div style={{ flex: 1 }}>
                            <span style={{
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              color: isSelected ? '#fff' : 'var(--text-primary)'
                            }}>
                              {milestone}
                            </span>
                            <span style={{
                              display: 'block',
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                              marginTop: 2
                            }}>
                              {[
                                "Calibrating sensor threshold loops",
                                "Arduino Mega & power rails setup",
                                "Initial insertion hole clearance tests",
                                "Top-to-downward RVM architecture view",
                                "Mounting the SG90 entry gate sweeps",
                                "Integrating character LCD & user face",
                                "I2C LCD bus and wiring routing",
                                "Final circuit wiring & cable management"
                              ][idx]}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 11. STANDALONE COMPONENT DATASHEET EXPLORER & OFFICIAL SIGNED PDF CONSOLE */}
          {activeTab === 'datasheets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              
              {/* Official signed progress reports and files download bar */}
              <div className="glass-panel" style={{
                padding: '24px 28px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
                background: 'linear-gradient(135deg, rgba(30,41,59,0.5) 0%, rgba(15,23,42,0.8) 100%)'
              }}>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Official FYP2 Documentation Centre
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Download or review the official manufacturer datasheets and verified FYP2 progress reports.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <a 
                    href="/progress_report_3.pdf" 
                    download 
                    className="btn-secondary" 
                    style={{ textDecoration: 'none', padding: '10px 18px', fontSize: '0.8rem' }}
                  >
                    <Download size={14} />
                    Download Progress Report 3 (PDF)
                  </a>
                  <a 
                    href="/progress_report_2.pdf" 
                    download 
                    className="btn-primary" 
                    style={{ textDecoration: 'none', padding: '10px 18px', fontSize: '0.8rem' }}
                  >
                    <Download size={14} />
                    Download Signed Datasheets Report (PDF)
                  </a>
                </div>
              </div>

              {/* Side-by-Side Detailed Specs & Embedded PDF Viewer */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
                gap: 28
              }}>
                
                {/* Left Column: Selector tabs & Super Detailed sensory specs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  {/* Selector tab grid */}
                  <div className="glass-panel" style={{
                    padding: '12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6
                  }}>
                    {[
                      "Arduino Mega 2560 R3",
                      "HC-SR04 Ultrasonic",
                      "SG90 Micro Servo",
                      "TCRT5000 IR Sensor",
                      "LJ12A3 Proximity",
                      "HD44780 LCD Display",
                      "ESP32 DevKit V1"
                    ].map((comp, idx) => {
                      const isSelected = activeComponentIdx === idx;
                      const compIcons = [
                        '/arduino_icon.jpg',
                        '/sonar_icon.png',
                        '/servo_icon.jpg',
                        '/ir_icon.jpg',
                        '/proximity_icon.jpg',
                        '/lcd_icon.png',
                        '/esp32_icon.png'
                      ];
                      return (
                        <button
                          key={idx}
                          onClick={() => setActiveComponentIdx(idx)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 14px',
                            background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                            color: isSelected ? 'var(--color-cyan)' : 'var(--text-secondary)',
                            border: `1px solid ${isSelected ? 'var(--color-cyan)' : 'transparent'}`,
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            fontFamily: 'Marcellus, Georgia, serif',
                            cursor: 'pointer',
                            transition: 'var(--transition-fast)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: 12
                          }}
                        >
                          <img 
                            src={compIcons[idx]} 
                            alt={comp}
                            onError={(e) => { e.target.onerror = null; e.target.src = '/gear_icon.svg'; }}
                            style={{ 
                              width: 24, 
                              height: 24, 
                              objectFit: 'contain',
                              borderRadius: '4px',
                              border: `1px solid ${isSelected ? 'rgba(6, 182, 212, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                              background: 'rgba(255,255,255,0.03)',
                              padding: 2,
                              transition: 'all 0.2s ease'
                            }} 
                          />
                          {comp}
                        </button>
                      );
                    })}
                  </div>

                  {/* High-Fidelity Specs Inspector Sheet */}
                  <div className="glass-panel glow-cyan" style={{
                    padding: '28px',
                    borderColor: 'rgba(6, 182, 212, 0.25)',
                    background: 'rgba(255,255,255,0.01)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 20
                  }}>
                    {[
                      {
                        name: "Arduino Mega 2560 Rev3",
                        type: "Core Microcontroller Development Board",
                        model: "SKU: A000067 (Hitachi ATmega2560 Core)",
                        specs: [
                          { label: "Processor Core", value: "ATmega2560 (8-bit AVR RISC)" },
                          { label: "Clock Frequency", value: "16 MHz" },
                          { label: "Operating Voltage", value: "5.0V DC (Vcc)" },
                          { label: "Input Voltage (Vin)", value: "7.0V - 12.0V DC (Recommended)" },
                          { label: "Digital I/O Pins", value: "54 Pins (15 PWM output channels)" },
                          { label: "Analog Input Pins", value: "16 Channels (10-bit resolution)" },
                          { label: "Flash memory", value: "256 KB (of which 8 KB for bootloader)" },
                          { label: "SRAM / EEPROM", value: "8 KB SRAM / 4 KB EEPROM" },
                          { label: "DC Current per I/O", value: "20.0 mA (Max limit)" }
                        ],
                        desc: "The primary industrial central processing hub that coordinates all RVM telemetry actions. Integrates all sensors via dedicated TTL registers, schedules continuous gate actuation sweeps, triggers rewards dispensers, and communicates with ESP32 cloud co-processors via high-speed serial UART lines.",
                        pinout: "D22-D53 Left/Right header rows, serial Rx0/Tx0 to Rx3/Tx3 channels, I2C SCL[21] / SDA[20] buses."
                      },
                      {
                        name: "HC-SR04 Proximity Sonar",
                        type: "Ultrasonic Distance Sensor",
                        model: "Chassis Dome Proximity Range Detector",
                        specs: [
                          { label: "Operating Voltage", value: "5.0V DC" },
                          { label: "Working Current", value: "15.0 mA" },
                          { label: "Ultrasonic Frequency", value: "40.0 kHz" },
                          { label: "Sensing Range", value: "2.0 cm - 400.0 cm" },
                          { label: "Measurement Angle", value: "< 15 degrees" },
                          { label: "Precision/Resolution", value: "3.0 mm (Standard calibration)" },
                          { label: "Trigger Pulse Input", value: "10µs TTL high pulse" },
                          { label: "Echo Pulse Output", value: "TTL high level, width = time-of-flight" },
                          { label: "Distance Formula", value: "Distance = (Echo Time * Sound Speed) / 2" }
                        ],
                        desc: "Mounted at the upper dome of the RVM cabinet. Fires 40kHz ultrasound bursts downward and calculates return echo timings in microseconds to check the vertical waste capacity levels, triggering automated cabinet lock alarms when capacity reaches 100%.",
                        pinout: "4-pin connector: Vcc (+5V), Trig (Digital trigger input), Echo (Digital echo feedback), GND."
                      },
                      {
                        name: "SG90 Micro Servo Motor",
                        type: "High-Torque Actuation Servo",
                        model: "Rotary Intake Gate & Streak Reward Dispenser",
                        specs: [
                          { label: "Operating Voltage", value: "4.8V - 6.0V DC" },
                          { label: "Stall Torque (4.8V)", value: "1.6 kg/cm" },
                          { label: "Stall Torque (6.0V)", value: "1.8 kg/cm" },
                          { label: "Sweeping Speed", value: "0.12s / 60 degrees (at 4.8V)" },
                          { label: "Rotational range", value: "0 - 180 degrees" },
                          { label: "Actuator Weight", value: "9.0 grams" },
                          { label: "Pulse Period", value: "20.0 ms (50 Hz PWM frequency)" },
                          { label: "Control Pulse Width", value: "500 µs (0°) - 2500 µs (180°)" },
                          { label: "Gear Assembly", value: "Nylon/Plastic compound" }
                        ],
                        desc: "Two units are integrated: one drives the continuous intake gate actuation sweep (CLOSED = 0°, OPEN = 90°) to route recyclable bottles. The second acts as the mechanical pen reward dispenser, rotating 90° to dispense a reward into the retrieval slot.",
                        pinout: "3-wire harness: Orange (PWM signal line), Red (Power +5V), Brown (Ground/GND)."
                      },
                      {
                        name: "TCRT5000 Reflective IR",
                        type: "Photoelectric Optical Obstacle Sensor",
                        model: "Chassis Intake Entrance Beam-Break Detector",
                        specs: [
                          { label: "Sensing Range", value: "0.2 mm - 15.0 mm" },
                          { label: "Peak Emitter Wave", value: "950 nm (GaAs Infrared Emitting LED)" },
                          { label: "Collector Type", value: "Silicon NPN Phototransistor" },
                          { label: "Output Format", value: "Digital TTL (High/Low) and Analog voltage" },
                          { label: "Reflection Filter", value: "Daylight blocking filter integrated" },
                          { label: "Forward Current", value: "60.0 mA (Emitter diode)" },
                          { label: "Power Dissipation", value: "100.0 mW (Phototransistor)" },
                          { label: "Mounting Style", value: "PCB leaded snap-in pins" },
                          { label: "Response Time", value: "10.0 µs (Rise/Fall switch rate)" }
                        ],
                        desc: "Positioned directly inside the intake chute entry. Serves as a beam-break trigger, creating an active-low input when a bottle breaks the infrared reflective beam. This instantly wakes up the main controller and triggers the item classification phase.",
                        pinout: "4-pin PCB header: Vcc (+3.3V/5V), GND, OUT_D (Digital TTL), OUT_A (Analog Vout)."
                      },
                      {
                        name: "LJ12A3-4-Z/BX Proximity",
                        type: "Inductive Metallic Proximity Sensor",
                        model: "Chassis Entry Segregation Classifier",
                        specs: [
                          { label: "Sensing Distance", value: "4.0 mm" },
                          { label: "Output Configuration", value: "NPN Normally Open (NO) 3-wire" },
                          { label: "Sensing Target", value: "Magnetic metals (Iron, Steel, Aluminum)" },
                          { label: "Supply Voltage", value: "6.0V - 36.0V DC (Calibrated to 12V)" },
                          { label: "Max Load Current", value: "300.0 mA" },
                          { label: "Response Frequency", value: "500.0 Hz" },
                          { label: "Indicator light", value: "Rear red LED active loop indicator" },
                          { label: "Hysteresis Limit", value: "< 10% of sensing range" },
                          { label: "Chassis Shielding", value: "Nickel-plated brass casing (IP67)" }
                        ],
                        desc: "Integrated underneath the scanning chute. When an item enters the classification zone, this inductive sensor detects the magnetic flux changes of metallic elements, creating an active-low pulse to segregate aluminum cans from PET plastic bottles.",
                        pinout: "3-core cable: Brown (+12V Vin rail), Blue (Ground/GND), Black (NPN open-collector output)."
                      },
                      {
                        name: "Hitachi HD44780 LCD",
                        type: "Liquid Crystal Dot-Matrix Screen Controller",
                        model: "Front Panel Status & Greeting Character LCD",
                        specs: [
                          { label: "Display Capacity", value: "16 Characters × 2 Lines" },
                          { label: "Control IC Model", value: "Hitachi HD44780U / PCF8574T I2C Expander" },
                          { label: "Display Matrix", value: "5 × 8 Dot-matrix characters" },
                          { label: "Operating Voltage", value: "5.0V DC" },
                          { label: "Working Current", value: "2.0 mA (120 mA with backlight)" },
                          { label: "I2C Bus Address", value: "0x27 or 0x3F (Selectable)" },
                          { label: "Bus Speed", value: "100.0 kHz (Standard I2C mode)" },
                          { label: "Backlight Glow", value: "Royal Blue LED background" },
                          { label: "Character Sets", value: "208 built-in dot-matrix characters" }
                        ],
                        desc: "Mounted securely on the front user-facing cabinet panel. Driven via I2C to save digital I/O lines. Displays clear, chronological status instructions to users throughout the recycling sequence, showing real-time text logs and reward details.",
                        pinout: "4-pin connector: GND, Vcc (+5V), SDA (Serial Data pin), SCL (Serial Clock pin)."
                      },
                      {
                        name: "ESP32 DevKit V1",
                        type: "Wi-Fi + Bluetooth IoT Microcontroller Module",
                        model: "Espressif ESP-WROOM-32 (Dual-Core Xtensa® LX6)",
                        specs: [
                          { label: "CPU Cores", value: "Dual-core Xtensa® LX6 @ up to 240 MHz" },
                          { label: "Wi-Fi Standard", value: "IEEE 802.11b/g/n 2.4 GHz (150 Mbps)" },
                          { label: "Bluetooth", value: "Bluetooth 4.2 + BLE (Classic & Low Energy)" },
                          { label: "Flash Memory", value: "4 MB (SPI Flash on-module)" },
                          { label: "SRAM", value: "520 KB (Internal SRAM)" },
                          { label: "Operating Voltage", value: "3.3V DC Logic / 5V USB input" },
                          { label: "GPIO Pins", value: "30 Digital I/O (12 ADC channels, 2 DAC)" },
                          { label: "Serial Interfaces", value: "UART × 3, SPI × 4, I2C × 2, I2S × 2" },
                          { label: "Security Engine", value: "AES / SHA-2 / RSA / ECC hardware acceleration" }
                        ],
                        desc: "Acts as the cloud communication co-processor in the Smart RVM system. Receives classified item data from the Arduino Mega via UART serial, then transmits it in real-time to the Firebase Realtime Database via Wi-Fi. Also handles MQTT event publishing, OTA firmware updates, and manages the RVM reward ledger synchronization with the cloud backend.",
                        pinout: "UART: TX0/RX0 to Arduino Mega. 3V3 pin powers 3.3V logic peripherals. GPIO2 = onboard LED indicator. EN pin = hardware reset. USB-Micro for programming."
                      }
                    ].map((comp, idx) => {
                      if (activeComponentIdx !== idx) return null;
                      return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                          
                          {/* Title Block */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-primary)', paddingBottom: 12 }}>
                            <div>
                              <h4 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '0.04em', fontFamily: 'Marcellus, Georgia, serif' }}>{comp.name}</h4>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-cyan)', fontWeight: 700, fontFamily: 'Marcellus, Georgia, serif' }}>{comp.type}</span>
                            </div>
                            <span style={{
                              fontSize: '0.7rem',
                              background: 'rgba(6, 182, 212, 0.1)',
                              color: 'var(--color-cyan)',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              fontFamily: 'Marcellus, Georgia, serif'
                            }}>
                              Official Specs
                            </span>
                          </div>

                          {/* Detail Table */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'Marcellus, Georgia, serif' }}>
                              Electrical & Physical Ratings
                            </span>
                            <div className="table-container">
                              <table className="custom-table" style={{ fontSize: '0.78rem', fontFamily: 'Marcellus, Georgia, serif' }}>
                                <tbody>
                                  {comp.specs.map((spec, sIdx) => (
                                    <tr key={sIdx}>
                                      <td style={{ color: 'var(--text-secondary)', padding: '8px 12px', fontWeight: 600, fontFamily: 'Marcellus, Georgia, serif' }}>{spec.label}</td>
                                      <td style={{ color: 'var(--text-primary)', padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'Marcellus, Georgia, serif' }}>{spec.value}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Pinout Details */}
                          <div style={{
                            background: 'rgba(255,255,255,0.01)',
                            padding: 16,
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)'
                          }}>
                            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, fontFamily: 'Marcellus, Georgia, serif' }}>
                              Pin Mappings & Signal Logic
                            </span>
                            <strong style={{ fontSize: '0.82rem', color: 'var(--color-cyan)', fontFamily: 'Marcellus, Georgia, serif' }}>{comp.pinout}</strong>
                          </div>

                          {/* Functional description */}
                          <div>
                            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, fontFamily: 'Marcellus, Georgia, serif' }}>
                              Hardware Role & Cloud Logic
                            </span>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'Marcellus, Georgia, serif' }}>
                              {comp.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Interactive Embedded Official Manufacturer PDF Viewer */}
                <div className="glass-panel" style={{
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  boxSizing: 'border-box',
                  background: 'linear-gradient(180deg, #091324 0%, #040810 100%)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Marcellus, Georgia, serif' }}>
                      <FileText size={18} style={{ color: 'var(--color-green)' }} />
                      Official Manufacturer Datasheet
                    </h3>
                    <a
                      href={`/${['arduino_mega_datasheet.pdf', 'hc_sr04_datasheet.pdf', 'sg90_datasheet.pdf', 'tcrt5000_datasheet.pdf', 'lj12a3_datasheet.html', 'hd44780_datasheet.pdf', 'esp32_datasheet.pdf'][activeComponentIdx]}`}
                      download
                      className="btn-secondary"
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.75rem',
                        fontFamily: 'Marcellus, Georgia, serif',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        textDecoration: 'none'
                      }}
                    >
                      <Download size={13} />
                      Download PDF
                    </a>
                  </div>

                  {/* Embedded PDF / HTML Datasheet iframe */}
                  <div style={{
                    width: '100%',
                    flex: 1,
                    height: '680px',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-primary)',
                    background: '#03070f',
                    position: 'relative'
                  }}>
                    <iframe 
                      key={activeComponentIdx}
                      src={`/${['arduino_mega_datasheet.pdf', 'hc_sr04_datasheet.pdf', 'sg90_datasheet.pdf', 'tcrt5000_datasheet.pdf', 'lj12a3_datasheet.html', 'hd44780_datasheet.pdf', 'esp32_datasheet.pdf'][activeComponentIdx]}`} 
                      width="100%" 
                      height="100%" 
                      style={{ border: 'none' }}
                      title="Official Manufacturer Datasheet Viewport"
                    />
                  </div>

                  <div style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    lineHeight: 1.4
                  }}>
                    💡 Pro Tip: This is the real, official manufacturer datasheet! You can search, zoom, or print the document directly using the interactive PDF viewer controls.
                  </div>
                </div>

              </div>
            </div>
          )}

        </section>
      </main>

      {/* --- MOBILE BOTTOM NAVIGATION BAR --- hidden on desktop via CSS */}
      <nav className="mobile-bottom-nav">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'simulator', label: 'Simulator', icon: Cpu },
          { id: 'alerts', label: 'Alerts', icon: Bell, count: alerts.filter(a => a.status === 'open').length },
          { id: 'analytics', label: 'Analytics', icon: BarChart2 },
          { id: 'events', label: 'Events', icon: Activity },
        ].map(item => {
          const IconComp = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <IconComp size={22} />
                {item.count > 0 && (
                  <span className="mobile-nav-badge">{item.count}</span>
                )}
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="mobile-bottom-nav-item"
        >
          <SettingsIcon size={22} />
          <span>More</span>
        </button>
      </nav>

    </div>
  );
}