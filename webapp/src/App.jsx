import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Cpu, Activity, Bell, BarChart2, 
  Users, Settings as SettingsIcon, Wrench, ShieldAlert, 
  Trash2, Plus, LogOut, Sun, Moon, Wifi, CheckCircle2, 
  AlertTriangle, Play, Pause, Database, Download, FileText
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
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

  // --- Hardware Simulator states ---
  const [lcdLine1, setLcdLine1] = useState("INSERT BOTTLE");
  const [lcdLine2, setLcdLine2] = useState("PET BOTTLE ONLY");
  const [greenLedGlow, setGreenLedGlow] = useState(false);
  const [redLedGlow, setRedLedGlow] = useState(false);

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
            setLcdLine2("PET BOTTLE ONLY");
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
              setLcdLine2("PET BOTTLE ONLY");
            }, 3000);
          } else if (latest.type === "METAL_REJECTED") {
            setLcdLine1("METAL DETECTED");
            setLcdLine2("PLEASE REMOVE!");
            setRedLedGlow(true);
            setGreenLedGlow(false);
            setTimeout(() => {
              setRedLedGlow(false);
              setLcdLine1("INSERT BOTTLE");
              setLcdLine2("PET BOTTLE ONLY");
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
        alert("Settings synchronized to machine online database successfully!");
      } catch (e) {
        console.error("Firestore error saving settings: ", e);
      }
    } else {
      alert("Settings updated locally! (Operating in offline mode)");
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
    const isAccepted = type === "PET_ACCEPTED";
    
    // Updates local machine states
    setMachine(prev => {
      const updated = {
        ...prev,
        acceptedCount: isAccepted ? prev.acceptedCount + 1 : prev.acceptedCount,
        rejectedCount: !isAccepted ? prev.rejectedCount + 1 : prev.rejectedCount,
        penDispensedCount: isAccepted ? prev.penDispensedCount + 1 : prev.penDispensedCount,
        lastSeenAt: new Date()
      };
      
      // Save simulation states back to firestore if online
      if (isFirebaseConnected) {
        const app = getApps()[0];
        const db = getFirestore(app);
        setDoc(doc(db, "machines", "RVM001"), updated, { merge: true });
      }
      return updated;
    });

    // Create Event
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

    if (isFirebaseConnected) {
      try {
        const app = getApps()[0];
        const db = getFirestore(app);
        await addDoc(collection(db, "events"), {
          machineId: "RVM001",
          type: type,
          acceptedCount: newEvent.acceptedCount,
          rejectedCount: newEvent.rejectedCount,
          penDispensedCount: newEvent.penCount,
          binFull: newEvent.binFull,
          timestamp: Timestamp.now(),
          rawPayload: "Browser Simulated Hardware Event"
        });
      } catch (err) {
        console.error(err);
      }
    }

    // Trigger LCD animation
    if (isAccepted) {
      setLcdLine1("PET ACCEPTED");
      setLcdLine2("THANK YOU!");
      setGreenLedGlow(true);
      setRedLedGlow(false);
      setTimeout(() => {
        setGreenLedGlow(false);
        setLcdLine1("INSERT BOTTLE");
        setLcdLine2("PET BOTTLE ONLY");
      }, 3000);
    } else {
      setLcdLine1("METAL DETECTED");
      setLcdLine2("PLEASE REMOVE!");
      setRedLedGlow(true);
      setGreenLedGlow(false);
      setTimeout(() => {
        setRedLedGlow(false);
        setLcdLine1("INSERT BOTTLE");
        setLcdLine2("PET BOTTLE ONLY");
      }, 3000);
    }
  };

  const simulateToggleBinFull = async () => {
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
      setLcdLine2("PET BOTTLE ONLY");
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
    alert("Simulated PDF Generator:\nA gorgeous PDF document containing system audit records, historical line-graphs, recycling metrics and technical specifications has been generated and ready for direct presentation to Dr. Hannah and final FYP2 review!");
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
    alert("Firebase database credentials injected! React will now connect securely to your Firestore live tables.");
  };

  const handleClearFirebaseConfig = () => {
    localStorage.removeItem('rvm_firebase_config');
    setFbConfig(null);
    setIsFirebaseConnected(false);
    setMachine(INITIAL_MACHINE_MOCK);
    setEvents(INITIAL_MOCK_EVENTS);
    setAlerts(INITIAL_MOCK_ALERTS);
    alert("Database credentials cleared! Reverting back to standalone simulation state.");
  };

  // --- AUTH ROUTER WALL ---
  if (!isLoggedIn) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at top right, #091a24 0%, #06080d 100%)',
        padding: '24px'
      }}>
        <div className="glass-panel" style={{
          width: '100%',
          maxWidth: '450px',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '16px',
            borderRadius: '50%',
            marginBottom: '20px',
            color: 'var(--color-primary)'
          }}>
            <LayoutDashboard size={40} className="pulse-indicator" />
          </div>
          
          <h1 style={{
            fontSize: '1.8rem',
            textAlign: 'center',
            marginBottom: '8px',
            background: 'linear-gradient(135deg, #ffffff, var(--color-primary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>Smart Recycling Portal</h1>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
            textAlign: 'center',
            marginBottom: '32px'
          }}>Final Year Project 2 Admin Portal</p>

          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>University Email</label>
              <input 
                type="email" 
                className="form-input" 
                placeholder="name@student.unikl.edu.my"
                required
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Console Access Password</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="••••••••"
                required
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
              />
            </div>

            {authError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-danger)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                textAlign: 'center'
              }}>
                {authError}
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
              Authenticate Portal Access
            </button>
          </form>

          {/* Quick Demo Login Buttons */}
          <div style={{
            width: '100%',
            marginTop: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <span style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '4px'
            }}>
              ⚡ Quick Demo Login
            </span>
            {[
              { name: "MD Ejaj Mahmud", role: "Admin", email: "ejaj@student.unikl.edu.my" },
              { name: "Dr. Hannah Sofian", role: "Supervisor", email: "hannah@unikl.edu.my" },
              { name: "Sayed Aziz", role: "Technician", email: "sayedaziz@unikl.edu.my" },
              { name: "Visitor Account", role: "Viewer", email: "visitor@unikl.edu.my" }
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
                  }
                }}
                className="btn-secondary"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderColor: 'rgba(16, 185, 129, 0.12)',
                  background: 'rgba(16, 185, 129, 0.01)',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <span>{u.name}</span>
                <span style={{
                  fontSize: '0.65rem',
                  background: u.role === 'Admin' ? 'rgba(59, 130, 246, 0.1)' : 
                             u.role === 'Supervisor' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
                  color: u.role === 'Admin' ? 'var(--color-secondary)' : 
                         u.role === 'Supervisor' ? 'var(--color-primary)' : 'var(--text-muted)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 700,
                  textTransform: 'uppercase'
                }}>{u.role}</span>
              </button>
            ))}
          </div>

          <div style={{
            marginTop: '32px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            borderTop: '1px solid var(--border-glass)',
            paddingTop: '20px',
            width: '100%'
          }}>
            MD Ejaj Mahmud | Student ID: 52222222123<br />
            UniKL MIIT Final Year Project 2 © 2026
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      
      {/* --- SIDEBAR PANEL --- */}
      <aside className="glass-panel" style={{
        width: '300px',
        borderRadius: 0,
        borderRight: '1px solid var(--border-glass)',
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
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-success))',
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
                color: machine.status === 'online' ? 'var(--color-primary)' : 'var(--color-warning)'
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: machine.status === 'online' ? 'var(--color-primary)' : 'var(--color-warning)'
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
                background: machine.binFull ? 'var(--color-danger)' : 'var(--color-primary)',
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
                    color: isActive ? 'var(--color-primary)' : 'var(--text-main)',
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
                      background: 'var(--color-danger)',
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
                  color: theme === 'dark' ? 'var(--color-primary)' : 'var(--text-muted)',
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
                  color: theme === 'light' ? 'var(--color-primary)' : 'var(--text-muted)',
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
              color: isFirebaseConnected ? 'var(--color-primary)' : 'var(--text-muted)',
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
            borderTop: '1px solid var(--border-glass)',
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
                color: 'var(--color-danger)',
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
                borderColor: isSimulating ? 'var(--color-primary)' : 'var(--border-glass)',
                color: isSimulating ? 'var(--color-primary)' : 'var(--text-main)',
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
                  { title: "PET Accepted", value: machine.acceptedCount, desc: "Total Plastic Recycled", color: "var(--color-primary)" },
                  { title: "Metal Cans Rejected", value: machine.rejectedCount, desc: "Cans Blocked & Safe", color: "var(--color-danger)" },
                  { title: "Pens Dispensed", value: machine.penDispensedCount, desc: "Streak Rewards Issued", color: "var(--color-secondary)" },
                  { title: "Active Alarms", value: alerts.filter(a => a.status === 'open').length, desc: "Requiring Attention", color: "var(--color-warning)" }
                ].map((kpi, idx) => (
                  <div key={idx} className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{kpi.title}</span>
                      <h2 style={{ fontSize: '2.2rem', margin: '8px 0', color: kpi.color }}>{kpi.value}</h2>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Machine Reference:</span>
                      <span style={{ fontWeight: 600 }}>{machine.machineId}</span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Physical Location:</span>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right' }}>{machine.location}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Network Connectivity:</span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'var(--color-primary)',
                        fontWeight: 600
                      }}>
                        <Wifi size={16} /> Online (Bridge active)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Bin Full Condition:</span>
                        <span style={{ fontWeight: 600, color: machine.binFull ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                          {machine.binFull ? 'CRITICAL - EMPTY IMMEDIATELY' : 'Normal Operations (24%)'}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{
                          width: machine.binFull ? '100%' : '24%',
                          height: '100%',
                          background: machine.binFull ? 'var(--color-danger)' : 'var(--color-primary)',
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
                        stroke="var(--color-primary)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      {/* Line 2: Metal Cans (Red Accent) */}
                      <path
                        d="M 10 180 Q 80 160 150 170 T 290 140 T 430 160 L 490 150"
                        fill="none"
                        stroke="var(--color-danger)"
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
                        <span style={{ width: 12, height: 4, background: 'var(--color-primary)', display: 'block', borderRadius: 2 }} />
                        PET Bottles Accepted
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                        <span style={{ width: 12, height: 4, background: 'var(--color-danger)', display: 'block', borderRadius: 2 }} />
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
                          color: ev.type === 'PET_ACCEPTED' ? 'var(--color-primary)' : 
                                 ev.type === 'METAL_REJECTED' ? 'var(--color-danger)' : 'var(--text-muted)',
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
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '30px' }}>
              
              {/* LCD Character Display simulator */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: 20, width: '100%' }}>RVM I2C LCD Display (0x27)</h3>
                  
                  {/* LCD Screen container */}
                  <div className="lcd-container">
                    <div className="lcd-line">{lcdLine1}</div>
                    <div className="lcd-line">{lcdLine2}</div>
                  </div>

                  {/* Physical Diagnostic LEDs */}
                  <div style={{ display: 'flex', gap: 30, marginTop: 28 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: greenLedGlow ? '#10B981' : '#143825',
                        boxShadow: greenLedGlow ? '0 0 15px #10B981' : 'none',
                        transition: 'all 0.1s ease'
                      }} />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>GREEN LED (D7)</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: redLedGlow ? '#EF4444' : '#471419',
                        boxShadow: redLedGlow ? '0 0 15px #EF4444' : 'none',
                        transition: 'all 0.1s ease'
                      }} />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RED LED (D6)</span>
                    </div>
                  </div>
                </div>

                {/* Operations board */}
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: 20 }}>Simulator Hardware Controllers</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <button 
                      onClick={() => simulateHardwareEvent("PET_ACCEPTED")}
                      className="btn-primary" 
                      style={{ justifyContent: 'center' }}
                    >
                      Simulate PET Bottle Insert (Success)
                    </button>
                    
                    <button 
                      onClick={() => simulateHardwareEvent("METAL_REJECTED")}
                      className="btn-secondary" 
                      style={{ justifyContent: 'center', border: '1px solid var(--color-danger)', color: 'var(--color-danger)' }}
                    >
                      Simulate Metal Can Insert (Reject)
                    </button>

                    <button 
                      onClick={simulateToggleBinFull}
                      className="btn-secondary" 
                      style={{ justifyContent: 'center' }}
                    >
                      {machine.binFull ? "Simulate Bin Emptied (Clear Lockout)" : "Simulate Bin Level Exceeds Threshold (Full)"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Hardware Technical specs & Wiring schematic */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.3rem', marginBottom: 20 }}>Prototype Hardware Diagram & Pinout</h3>
                
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p>
                    The physical reverse vending machine operates around the **Arduino Mega 2560** as the primary controller. Proximity sensors evaluate deposits in a 1.5s real-time hardware scanning window.
                  </p>

                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Device Component</th>
                          <th>Mega Pin</th>
                          <th>Voltage / Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Capacitive Sensor (Plastic)</td>
                          <td>D5</td>
                          <td>12V (NPN divided to 5V active-LOW)</td>
                        </tr>
                        <tr>
                          <td>Inductive Sensor (Metal)</td>
                          <td>D4</td>
                          <td>12V (NPN divided to 5V active-LOW)</td>
                        </tr>
                        <tr>
                          <td>IR Entry Switch</td>
                          <td>D11</td>
                          <td>5V logic level trigger</td>
                        </tr>
                        <tr>
                          <td>HC-SR04 ultrasonic</td>
                          <td>D22 (Trig) / D23 (Echo)</td>
                          <td>5V direct TTL pulse</td>
                        </tr>
                        <tr>
                          <td>Servo Gate SG90</td>
                          <td>D9</td>
                          <td>5.0V Buck rail (CLOSED=0°, OPEN=90°)</td>
                        </tr>
                        <tr>
                          <td>Dual Pen Dispenser Servos</td>
                          <td>D10</td>
                          <td>5.0V Shared PWM Line (HOLD=90°, DROP=0°)</td>
                        </tr>
                        <tr>
                          <td>UART Serial Bridge</td>
                          <td>TX1 Pin 18 / RX1 Pin 19</td>
                          <td>Connected to ESP32 RX2/TX2 via 1k/2k divider</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    padding: '16px',
                    borderRadius: 'var(--radius-sm)',
                    marginTop: 12
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-secondary)', display: 'block', marginBottom: 6 }}>
                      ESP32 IoT Bridge Serial Circuit
                    </span>
                    Mega TX1 (5V logic) is divided down to ~3.3V logic using a **1kΩ and 2kΩ voltage divider** resistor setup before reaching ESP32 RX2 (GPIO16), preventing over-voltage damage to the ESP32 chip.
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
                            color: e.type === 'PET_ACCEPTED' ? 'var(--color-primary)' : 
                                   e.type === 'METAL_REJECTED' ? 'var(--color-danger)' : 'var(--text-muted)',
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
                          <span style={{ color: e.binFull ? 'var(--color-danger)' : 'var(--color-primary)' }}>
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
                      <CheckCircle2 size={40} style={{ color: 'var(--color-primary)', marginBottom: 12 }} />
                      <p>All clear! There are currently no active warnings or structural alarms logged.</p>
                    </div>
                  ) : (
                    alerts.filter(a => a.status === 'open').map(alert => (
                      <div key={alert.id} className="glass-panel" style={{
                        padding: '20px',
                        borderLeft: `5px solid ${alert.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)'}`,
                        background: 'rgba(255,255,255,0.01)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                          <AlertTriangle size={24} style={{ color: alert.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                          <div>
                            <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                              {alert.type === 'BIN_FULL' ? 'COLLECTION DUSTBIN AT CAPACITY' : 
                               alert.type === 'LOW_REWARD_STOCK' ? 'REWARD PENS STOCK LOW (<10%)' : 'SYSTEM MALFUNCTION ALARM'}
                            </span>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              Severity: <strong style={{ color: alert.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)' }}>{alert.severity.toUpperCase()}</strong> | 
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
                          <td style={{ color: a.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                            {a.severity.toUpperCase()}
                          </td>
                          <td>{a.resolvedAt ? a.resolvedAt.toLocaleString() : 'Acknowledged'}</td>
                          <td>
                            <span style={{
                              color: 'var(--color-primary)',
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
                        stroke="var(--color-primary)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      
                      <circle cx="430" cy="40" r="5" fill="var(--color-primary)" />
                      <circle cx="490" cy="20" r="5" fill="var(--color-primary)" />

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
                      background: 'conic-gradient(var(--color-primary) 0% 78%, var(--color-danger) 78% 100%)',
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
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary)' }}>78.9%</span>
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
                            <td><strong style={{ color: 'var(--color-primary)' }}>{h.accepted} items</strong></td>
                            <td><strong style={{ color: 'var(--color-danger)' }}>{h.rejected} items</strong></td>
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
                            color: u.role === 'admin' ? 'var(--color-secondary)' : 
                                   u.role === 'supervisor' ? 'var(--color-primary)' : 'var(--text-muted)',
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

                <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-glass)', paddingTop: 20 }}>
                  <button type="submit" className="btn-primary">
                    Sync Configurations
                  </button>
                </div>
              </form>

              {/* Dynamic Firebase configuration injector panel */}
              <div className="glass-panel" style={{ padding: '20px', marginTop: 40, borderStyle: 'dashed', borderColor: 'var(--color-secondary)' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--color-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={16} /> Live Firebase Credentials Injector
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  Connect this React Dashboard to your own live Firebase database! Fill in your Web App config credentials below, and the app will instantly bind live Firestore document listeners.
                </p>

                {fbConfig ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: 12, borderRadius: 4 }}>
                      ✅ <strong>Active Connection:</strong> Connected to project <code>{fbConfig.projectId}</code>
                    </div>
                    <button onClick={handleClearFirebaseConfig} className="btn-secondary" style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)', padding: '6px 12px', fontSize: '0.8rem', justifyContent: 'center' }}>
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
                        <strong style={{ color: 'var(--color-secondary)', fontSize: '0.9rem' }}>{m.technician}</strong>
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
                        <td><strong style={{ color: 'var(--color-secondary)' }}>{log.actor}</strong></td>
                        <td>
                          <span style={{
                            background: 'rgba(59, 130, 246, 0.08)',
                            color: 'var(--color-secondary)',
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
