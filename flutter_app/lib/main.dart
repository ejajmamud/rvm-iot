import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// --- DATA MODELS ---
class RvmMachine {
  final String machineId;
  final String name;
  final String location;
  final String status;
  final bool binFull;
  final int acceptedCount;
  final int rejectedCount;
  final int penCount;
  final DateTime lastSeenAt;
  final String firmwareVersion;
  final String esp32Version;

  RvmMachine({
    required this.machineId,
    required this.name,
    required this.location,
    required this.status,
    required this.binFull,
    required this.acceptedCount,
    required this.rejectedCount,
    required this.penCount,
    required this.lastSeenAt,
    required this.firmwareVersion,
    required this.esp32Version,
  });
}

class RvmEvent {
  final String id;
  final String type;
  final String machineId;
  final int acceptedCount;
  final int rejectedCount;
  final int penCount;
  final bool binFull;
  final DateTime timestamp;

  RvmEvent({
    required this.id,
    required this.type,
    required this.machineId,
    required this.acceptedCount,
    required this.rejectedCount,
    required this.penCount,
    required this.binFull,
    required this.timestamp,
  });
}

class RvmAlert {
  final String id;
  final String machineId;
  final String type;
  final String severity;
  final String status;
  final DateTime createdAt;

  RvmAlert({
    required this.id,
    required this.machineId,
    required this.type,
    required this.severity,
    required this.status,
    required this.createdAt,
  });
}

// --- STATE MANAGEMENT ENGINE (FALLBACK TO SIMULATOR IF FIREBASE MOCK ACTIVE) ---
class AppStateManager extends ChangeNotifier {
  bool _isLoggedIn = false;
  String _userRole = "technician";
  String _userName = "MD Ejaj Mahmud";
  String _userEmail = "ejaj@student.unikl.edu.my";

  RvmMachine _machine = RvmMachine(
    machineId: "RVM001",
    name: "UniKL MIIT RVM - Lobby",
    location: "UniKL MIIT Ground Floor Lobby",
    status: "online",
    binFull: false,
    acceptedCount: 428,
    rejectedCount: 114,
    penCount: 206,
    lastSeenAt: DateTime.now(),
    firmwareVersion: "v3.1-IoT",
    esp32Version: "v1.0",
  );

  List<RvmEvent> _events = [
    RvmEvent(id: "e1", type: "PET_ACCEPTED", machineId: "RVM001", acceptedCount: 428, rejectedCount: 114, penCount: 206, binFull: false, timestamp: DateTime.now().subtract(const Duration(minutes: 1))),
    RvmEvent(id: "e2", type: "HEARTBEAT", machineId: "RVM001", acceptedCount: 427, rejectedCount: 114, penCount: 205, binFull: false, timestamp: DateTime.now().subtract(const Duration(minutes: 3))),
    RvmEvent(id: "e3", type: "METAL_REJECTED", machineId: "RVM001", acceptedCount: 427, rejectedCount: 114, penCount: 205, binFull: false, timestamp: DateTime.now().subtract(const Duration(minutes: 5))),
  ];

  List<RvmAlert> _alerts = [
    RvmAlert(id: "a1", machineId: "RVM001", type: "LOW_REWARD_STOCK", severity: "warning", status: "open", createdAt: DateTime.now().subtract(const Duration(hours: 2))),
  ];

  bool get isLoggedIn => _isLoggedIn;
  String get userRole => _userRole;
  String get userName => _userName;
  String get userEmail => _userEmail;
  RvmMachine get machine => _machine;
  List<RvmEvent> get events => _events;
  List<RvmAlert> get alerts => _alerts;

  Timer? _simTimer;

  void startSimulation() {
    _simTimer?.cancel();
    _simTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      final isAccepted = timer.tick % 3 != 0; // 2 out of 3 are accepted
      
      _machine = RvmMachine(
        machineId: "RVM001",
        name: _machine.name,
        location: _machine.location,
        status: "online",
        binFull: _machine.binFull,
        acceptedCount: isAccepted ? _machine.acceptedCount + 1 : _machine.acceptedCount,
        rejectedCount: !isAccepted ? _machine.rejectedCount + 1 : _machine.rejectedCount,
        penCount: isAccepted ? _machine.penCount + 1 : _machine.penCount,
        lastSeenAt: DateTime.now(),
        firmwareVersion: _machine.firmwareVersion,
        esp32Version: _machine.esp32Version,
      );

      final newEvent = RvmEvent(
        id: "ev_${DateTime.now().millisecondsSinceEpoch}",
        type: isAccepted ? "PET_ACCEPTED" : "METAL_REJECTED",
        machineId: "RVM001",
        acceptedCount: _machine.acceptedCount,
        rejectedCount: _machine.rejectedCount,
        penCount: _machine.penCount,
        binFull: _machine.binFull,
        timestamp: DateTime.now(),
      );

      _events.insert(0, newEvent);
      notifyListeners();
    });
  }

  void stopSimulation() {
    _simTimer?.cancel();
  }

  bool handleLogin(String email, String password) {
    if (email.contains("@student.unikl.edu.my") || email.contains("@unikl.edu.my")) {
      _isLoggedIn = true;
      _userEmail = email;
      if (email.contains("hannah")) {
        _userName = "Dr. Hannah Sofian";
        _userRole = "supervisor";
      } else if (email.contains("sayed")) {
        _userName = "Sayed Aziz";
        _userRole = "technician";
      } else {
        _userName = "MD Ejaj Mahmud";
        _userRole = "admin";
      }
      startSimulation(); // auto-simulate values in fallback state
      notifyListeners();
      return true;
    }
    return false;
  }

  void handleLogout() {
    _isLoggedIn = false;
    stopSimulation();
    notifyListeners();
  }

  void triggerBinFullToggle() {
    final nextState = !_machine.binFull;
    _machine = RvmMachine(
      machineId: _machine.machineId,
      name: _machine.name,
      location: _machine.location,
      status: nextState ? "maintenance" : "online",
      binFull: nextState,
      acceptedCount: _machine.acceptedCount,
      rejectedCount: _machine.rejectedCount,
      penCount: _machine.penCount,
      lastSeenAt: DateTime.now(),
      firmwareVersion: _machine.firmwareVersion,
      esp32Version: _machine.esp32Version,
    );

    if (nextState) {
      _alerts.insert(0, RvmAlert(
        id: "al_${DateTime.now().millisecondsSinceEpoch}",
        machineId: "RVM001",
        type: "BIN_FULL",
        severity: "critical",
        status: "open",
        createdAt: DateTime.now(),
      ));
    } else {
      _alerts.removeWhere((a) => a.type == "BIN_FULL");
    }
    notifyListeners();
  }

  @override
  void dispose() {
    stopSimulation();
    super.dispose();
  }
}

// --- MAIN WRAPPER ---
void main() {
  runApp(const RvmApp());
}

class RvmApp extends StatelessWidget {
  const RvmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Smart Recycler RVM Monitor',
      debugShowCheckedModeBanner: false,
      home: AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final AppStateManager stateManager = AppStateManager();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: stateManager,
      builder: (context, _) {
        if (!stateManager.isLoggedIn) {
          return LoginScreen(stateManager: stateManager);
        }
        return MainNavigationWrapper(stateManager: stateManager);
      },
    );
  }
}

// --- LOGIN SCREEN ---
class LoginScreen extends StatefulWidget {
  final AppStateManager stateManager;
  const LoginScreen({super.key, required this.stateManager});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  String _error = "";

  void submit() {
    setState(() => _error = "");
    final ok = widget.stateManager.handleLogin(_emailController.text, _passwordController.text);
    if (!ok) {
      setState(() => _error = "Unauthorized account. Please use your registered UniKL student/staff email.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF070B11),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  color: Color(0x1A10B981),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.recycling_outlined, size: 52, color: Color(0xFF10B981)),
              ),
              const SizedBox(height: 20),
              Text(
                "RVM Smart Recycler",
                style: GoogleFonts.outfit(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                "Final Year Project 2 Monitor",
                style: GoogleFonts.sansSerif(fontSize: 14, color: Colors.grey),
              ),
              const SizedBox(height: 40),
              
              TextField(
                controller: _emailController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: "University Email",
                  labelStyle: const TextStyle(color: Colors.grey),
                  hintText: "ejaj@student.unikl.edu.my",
                  hintStyle: const TextStyle(color: Colors.grey),
                  filled: true,
                  fillColor: const Color(0xFF0F172A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 20),
              
              TextField(
                controller: _passwordController,
                obscureText: true,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: "Portal Password",
                  labelStyle: const TextStyle(color: Colors.grey),
                  hintText: "••••••••",
                  filled: true,
                  fillColor: const Color(0xFF0F172A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 20),

              if (_error.isNotEmpty) ...[
                Text(
                  _error,
                  style: const TextStyle(color: Colors.redAccent, fontSize: 12),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
              ],

              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text("Authenticate Portal", style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }
}

// --- MAIN NAVIGATION VIEW ---
class MainNavigationWrapper extends StatefulWidget {
  final AppStateManager stateManager;
  const MainNavigationWrapper({super.key, required this.stateManager});

  @override
  State<MainNavigationWrapper> createState() => _MainNavigationWrapperState();
}

class _MainNavigationWrapperState extends State<MainNavigationWrapper> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    final List<Widget> screens = [
      DashboardScreen(stateManager: widget.stateManager),
      MachineStatusScreen(stateManager: widget.stateManager),
      NotificationsScreen(stateManager: widget.stateManager),
      EventHistoryScreen(stateManager: widget.stateManager),
      AnalyticsScreen(stateManager: widget.stateManager),
      ProfileScreen(stateManager: widget.stateManager),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFF080D16),
      body: screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (idx) => setState(() => _currentIndex = idx),
        type: BottomNavigationBarType.fixed,
        backgroundColor: const Color(0xFF0F172A),
        selectedItemColor: const Color(0xFF10B981),
        unselectedItemColor: Colors.grey,
        items: [
          const BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), label: "Home"),
          const BottomNavigationBarItem(icon: Icon(Icons.developer_board), label: "Cabinet"),
          BottomNavigationBarItem(
            icon: Badge(
              label: Text(widget.stateManager.alerts.length.toString()),
              isLabelVisible: widget.stateManager.alerts.isNotEmpty,
              child: const Icon(Icons.notifications_outlined),
            ), 
            label: "Alerts"
          ),
          const BottomNavigationBarItem(icon: Icon(Icons.history), label: "Logs"),
          const BottomNavigationBarItem(icon: Icon(Icons.analytics_outlined), label: "Charts"),
          const BottomNavigationBarItem(icon: Icon(Icons.person_outline), label: "Profile"),
        ],
      ),
    );
  }
}

// --- SCREEN 1: DASHBOARD ---
class DashboardScreen extends StatelessWidget {
  final AppStateManager stateManager;
  const DashboardScreen({super.key, required this.stateManager});

  @override
  Widget build(BuildContext context) {
    final machine = stateManager.machine;
    return Scaffold(
      backgroundColor: const Color(0xFF080D16),
      appBar: AppBar(
        title: Text("RVM Smart Recycler", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F172A),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            color: Colors.amber,
            onPressed: stateManager.triggerBinFullToggle,
          )
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status Banner
            Card(
              color: const Color(0xFF0F172A),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: machine.status == "online" ? const Color(0xFF10B981) : Colors.amber,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text("Machine RVM001: ${machine.status.toUpperCase()}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          Text(machine.location, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        ],
                      ),
                    )
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Bin Level Circular Progress
            Center(
              child: Card(
                color: const Color(0xFF0F172A),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(28.0),
                  child: Column(
                    children: [
                      Text("Dustbin Collection Level", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 20),
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(
                            width: 130,
                            height: 130,
                            child: CircularProgressIndicator(
                              value: machine.binFull ? 1.0 : 0.24,
                              strokeWidth: 10,
                              color: machine.binFull ? Colors.redAccent : const Color(0xFF10B981),
                              backgroundColor: Colors.white10,
                            ),
                          ),
                          Column(
                            children: [
                              Text(machine.binFull ? "100%" : "24%", style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                              Text(machine.binFull ? "FULL" : "Normal", style: const TextStyle(color: Colors.grey, fontSize: 12)),
                            ],
                          )
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Counter cards
            Row(
              children: [
                Expanded(
                  child: Card(
                    color: const Color(0xFF0F172A),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        children: [
                          const Icon(Icons.eco, color: Color(0xFF10B981)),
                          const SizedBox(height: 8),
                          Text("${machine.acceptedCount}", style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                          const Text("PET Bottles", style: TextStyle(color: Colors.grey, fontSize: 12)),
                        ],
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: Card(
                    color: const Color(0xFF0F172A),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        children: [
                          const Icon(Icons.cancel_presentation, color: Colors.redAccent),
                          const SizedBox(height: 8),
                          Text("${machine.rejectedCount}", style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                          const Text("Metal Cans", style: TextStyle(color: Colors.grey, fontSize: 12)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}

// --- SCREEN 2: CABINET SIMULATION ---
class MachineStatusScreen extends StatelessWidget {
  final AppStateManager stateManager;
  const MachineStatusScreen({super.key, required this.stateManager});

  @override
  Widget build(BuildContext context) {
    final machine = stateManager.machine;
    final isFull = machine.binFull;

    return Scaffold(
      backgroundColor: const Color(0xFF080D16),
      appBar: AppBar(
        title: Text("Machine Cabinet", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F172A),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            // Character LCD display
            Card(
              color: const Color(0xFF0F2D0F),
              shape: RoundedRectangleBorder(
                side: const BorderSide(color: Color(0xFF2E3C2E), width: 6),
                borderRadius: BorderRadius.circular(6)
              ),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isFull ? "BIN FULL!" : "INSERT BOTTLE",
                      style: GoogleFonts.shareTechMono(color: const Color(0xFF55FF55), fontSize: 24, letterSpacing: 2),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isFull ? "PLEASE TRY LATER" : "PET BOTTLE ONLY",
                      style: GoogleFonts.shareTechMono(color: const Color(0xFF55FF55), fontSize: 24, letterSpacing: 2),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 30),

            // Pin Status Cards
            Card(
              color: const Color(0xFF0F172A),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    const Text("Active Pins Monitoring", style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    _buildPinStatusRow("Capacitive Sensor (Plastic)", "D5", true),
                    _buildPinStatusRow("Inductive Sensor (Metal)", "D4", false),
                    _buildPinStatusRow("IR Entry Switch", "D11", false),
                    _buildPinStatusRow("Gate Servo SG90", "D9", false),
                    _buildPinStatusRow("Dual Pen Dispenser", "D10", false),
                  ],
                ),
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget _buildPinStatusRow(String title, String pin, bool isActive) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.between,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(color: Colors.white, fontSize: 14)),
              Text("Pin reference: $pin", style: const TextStyle(color: Colors.grey, fontSize: 11)),
            ],
          ),
          Icon(
            isActive ? Icons.radio_button_checked : Icons.radio_button_off,
            color: isActive ? const Color(0xFF10B981) : Colors.grey,
          )
        ],
      ),
    );
  }
}

// --- SCREEN 3: ALERTS LOG ---
class NotificationsScreen extends StatelessWidget {
  final AppStateManager stateManager;
  const NotificationsScreen({super.key, required this.stateManager});

  @override
  Widget build(BuildContext context) {
    final alerts = stateManager.alerts;
    return Scaffold(
      backgroundColor: const Color(0xFF080D16),
      appBar: AppBar(
        title: Text("Alert Notifications", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F172A),
      ),
      body: alerts.isEmpty 
        ? const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.check_circle_outline, color: Color(0xFF10B981), size: 48),
                SizedBox(height: 12),
                Text("All systems stable", style: TextStyle(color: Colors.grey)),
              ],
            ),
          )
        : ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: alerts.length,
            itemBuilder: (context, idx) {
              final a = alerts[idx];
              final isCritical = a.severity == "critical";
              return Card(
                color: const Color(0xFF0F172A),
                shape: Border(left: BorderSide(color: isCritical ? Colors.redAccent : Colors.amber, width: 4)),
                child: ListTile(
                  leading: Icon(Icons.warning_amber, color: isCritical ? Colors.redAccent : Colors.amber),
                  title: Text(a.type == "BIN_FULL" ? "Intake Locked: Dustbin Full" : "Low Rewards Inventory", style: const TextStyle(color: Colors.white)),
                  subtitle: Text("Triggered: ${a.createdAt.toLocal().toString().substring(11, 16)}", style: const TextStyle(color: Colors.grey)),
                ),
              );
            },
          ),
    );
  }
}

// --- SCREEN 4: HISTORY ---
class EventHistoryScreen extends StatelessWidget {
  final AppStateManager stateManager;
  const EventHistoryScreen({super.key, required this.stateManager});

  @override
  Widget build(BuildContext context) {
    final events = stateManager.events;
    return Scaffold(
      backgroundColor: const Color(0xFF080D16),
      appBar: AppBar(
        title: Text("Event Ingestions Logs", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F172A),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: events.length,
        itemBuilder: (context, idx) {
          final e = events[idx];
          final isPet = e.type == "PET_ACCEPTED";
          return Card(
            color: const Color(0xFF0F172A),
            child: ListTile(
              leading: Icon(
                isPet ? Icons.eco : Icons.cancel_presentation, 
                color: isPet ? const Color(0xFF10B981) : Colors.redAccent
              ),
              title: Text(e.type, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              subtitle: Text("Accumulated state: Accepted: ${e.acceptedCount} | Rejected: ${e.rejectedCount}", style: const TextStyle(color: Colors.grey, fontSize: 12)),
              trailing: Text(e.timestamp.toLocal().toString().substring(11, 16), style: const TextStyle(color: Colors.grey)),
            ),
          );
        },
      ),
    );
  }
}

// --- SCREEN 5: ANALYTICS ---
class AnalyticsScreen extends StatelessWidget {
  final AppStateManager stateManager;
  const AnalyticsScreen({super.key, required this.stateManager});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080D16),
      appBar: AppBar(
        title: Text("Historical Analytics", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F172A),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            Card(
              color: const Color(0xFF0F172A),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    const Text("Recycling Volume (Weekly)", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 30),
                    // High fidelity bar mock using custom row builders
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        _buildCustomBar("M", 50),
                        _buildCustomBar("T", 70),
                        _buildCustomBar("W", 40),
                        _buildCustomBar("T", 90),
                        _buildCustomBar("F", 60),
                        _buildCustomBar("S", 80),
                        _buildCustomBar("S", 100),
                      ],
                    )
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            
            // Analytics breakdown card
            Card(
              color: const Color(0xFF0F172A),
              child: const ListTile(
                leading: Icon(Icons.insights, color: Color(0xFF10B981)),
                title: Text("Weekly Material Ratio", style: TextStyle(color: Colors.white)),
                subtitle: Text("78.9% Polyethylene Terephthalate (PET)\n21.1% Tin/Aluminium Cans", style: TextStyle(color: Colors.grey)),
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget _buildCustomBar(String label, double heightVal) {
    return Column(
      children: [
        Container(
          width: 20,
          height: heightVal,
          decoration: BoxDecoration(
            color: const Color(0xFF10B981),
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(color: Colors.grey)),
      ],
    );
  }
}

// --- SCREEN 6: PROFILE ---
class ProfileScreen extends StatelessWidget {
  final AppStateManager stateManager;
  const ProfileScreen({super.key, required this.stateManager});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080D16),
      appBar: AppBar(
        title: Text("Staff Clearance Profile", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F172A),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            const Center(
              child: CircleAvatar(
                radius: 40,
                backgroundColor: Color(0x1A10B981),
                child: Icon(Icons.person, size: 48, color: Color(0xFF10B981)),
              ),
            ),
            const SizedBox(height: 16),
            Text(stateManager.userName, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            Text(stateManager.userEmail, style: const TextStyle(color: Colors.grey)),
            const SizedBox(height: 12),
            Chip(
              label: Text("Role: ${stateManager.userRole.toUpperCase()}"),
              backgroundColor: const Color(0xFF0F172A),
              labelStyle: const TextStyle(color: Color(0xFF10B981)),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton.icon(
                onPressed: stateManager.handleLogout,
                icon: const Icon(Icons.logout, color: Colors.redAccent),
                label: const Text("Logout from Console", style: TextStyle(color: Colors.redAccent)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.redAccent),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            )
          ],
        ),
      ),
    );
  }
}
