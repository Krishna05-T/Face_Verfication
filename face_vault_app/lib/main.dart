import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:http/http.dart' as http;

List<CameraDescription> cameras = [];

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    cameras = await availableCameras();
  } catch (e) {
    print('Error initializing cameras: $e');
  }
  runApp(const FaceVaultApp());
}

class FaceVaultApp extends StatelessWidget {
  const FaceVaultApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Face Vault',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF121212),
        primaryColor: const Color(0xFF00E676), // Vibrant green/teal
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00E676),
          secondary: Color(0xFF00B0FF),
          surface: Color(0xFF1E1E1E),
        ),
        useMaterial3: true,
        fontFamily: 'Roboto', // Modern looking
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF00E676),
            foregroundColor: Colors.black,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 5,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF2C2C2C),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF00E676), width: 2),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        ),
      ),
      home: const HomeScreen(),
    );
  }
}

// ==========================================
// CONFIGURATION
// ==========================================
// IMPORTANT: If running on Android Emulator, use 10.0.2.2 instead of 127.0.0.1
// If running on a real physical device, use your PC's local IP address (e.g. 192.168.1.X)
const String SERVER_URL = "http://192.168.1.6:5000";

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF121212), Color(0xFF1A2A2A)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo/Header
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                    ),
                    child: Icon(
                      Icons.face_retouching_natural,
                      size: 80,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Face Vault',
                    style: TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Next-Gen Biometric Security',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.grey[400],
                    ),
                  ),
                  const SizedBox(height: 60),

                  // Buttons
                  _buildMenuCard(
                    context,
                    title: 'Register New Face',
                    subtitle: 'Add a new user to the vault',
                    icon: Icons.person_add_alt_1,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RegisterScreen())),
                  ),
                  const SizedBox(height: 20),
                  _buildMenuCard(
                    context,
                    title: 'Live Verification',
                    subtitle: 'Authenticate an existing user',
                    icon: Icons.verified_user,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const VerifyScreen())),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMenuCard(BuildContext context, {required String title, required String subtitle, required IconData icon, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 10,
              offset: const Offset(0, 5),
            ),
          ],
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: Theme.of(context).colorScheme.primary, size: 30),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 14, color: Colors.grey[400]),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios, color: Colors.grey[600], size: 16),
          ],
        ),
      ),
    );
  }
}

// ==========================================
// REUSABLE CAMERA SCREEN
// ==========================================
class CameraScreen extends StatefulWidget {
  final Function(String base64Image) onImageCaptured;

  const CameraScreen({super.key, required this.onImageCaptured});

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> {
  CameraController? _controller;
  bool _isCameraInitialized = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    if (cameras.isEmpty) return;
    CameraDescription camera = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    _controller = CameraController(camera, ResolutionPreset.high);
    try {
      await _controller!.initialize();
      if (mounted) setState(() => _isCameraInitialized = true);
    } catch (e) {
      print("Camera init error: $e");
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _captureImage() async {
    if (_controller == null || !_controller!.value.isInitialized) return;
    try {
      final XFile file = await _controller!.takePicture();
      final bytes = await file.readAsBytes();
      final base64String = "data:image/jpeg;base64," + base64Encode(bytes);
      widget.onImageCaptured(base64String);
      Navigator.pop(context);
    } catch (e) {
      print("Error capturing image: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isCameraInitialized) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator(color: Color(0xFF00E676))),
      );
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: CameraPreview(_controller!),
          ),
          // Overlay UI
          SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white, size: 30),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Text('Align your face', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w500)),
                    const SizedBox(width: 48), // Balance
                  ],
                ),
              ),
            ),
          ),
          // Capture Button
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 40),
              child: GestureDetector(
                onTap: _captureImage,
                child: Container(
                  height: 80,
                  width: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF00E676), width: 4),
                  ),
                  child: Center(
                    child: Container(
                      height: 60,
                      width: 60,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
        ],
      ),
    );
  }
}

// ==========================================
// REGISTER SCREEN
// ==========================================
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _idCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _deptCtrl = TextEditingController(text: 'General');
  String? _base64Image;
  bool _isLoading = false;

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: Colors.redAccent,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  Future<void> _submitRegistration() async {
    if (_idCtrl.text.trim().isEmpty) {
      _showError('Please enter a User ID');
      return;
    }
    if (_nameCtrl.text.trim().isEmpty) {
      _showError('Please enter Full Name');
      return;
    }
    if (_deptCtrl.text.trim().isEmpty) {
      _showError('Please enter Department');
      return;
    }
    if (_base64Image == null) {
      _showError('Please take a photo to continue');
      return;
    }

    setState(() => _isLoading = true);

    try {
      final response = await http.post(
        Uri.parse('$SERVER_URL/api/register'),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "user_id": _idCtrl.text.trim(),
          "name": _nameCtrl.text.trim(),
          "department": _deptCtrl.text.trim(),
          "image": _base64Image,
        }),
      );

      final data = jsonDecode(response.body);
      if (response.statusCode == 200 && data['success'] == true) {
        if (!mounted) return;
        showDialog(context: context, builder: (_) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.check_circle, color: Color(0xFF00E676)),
              SizedBox(width: 10),
              Text('Success'),
            ],
          ),
          content: Text(data['message'] ?? 'User registered successfully!'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context); // Close dialog
                Navigator.pop(context); // Go back to home
              },
              child: const Text('OK', style: TextStyle(color: Color(0xFF00E676))),
            )
          ],
        ));
      } else {
        _showError(data['error'] ?? 'Registration failed');
      }
    } catch (e) {
      _showError('Network Error: Could not connect to server.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Register Face', style: TextStyle(fontWeight: FontWeight.bold))),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Enter User Details',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _idCtrl,
                decoration: const InputDecoration(
                  labelText: 'User ID',
                  prefixIcon: Icon(Icons.badge),
                  hintText: 'e.g., EMP101',
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Full Name',
                  prefixIcon: Icon(Icons.person),
                  hintText: 'e.g., John Doe',
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _deptCtrl,
                decoration: const InputDecoration(
                  labelText: 'Department',
                  prefixIcon: Icon(Icons.work),
                  hintText: 'e.g., Engineering',
                ),
              ),
              const SizedBox(height: 30),
              
              // Photo section
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _base64Image != null ? const Color(0xFF00E676) : Colors.white12,
                    width: 2,
                  ),
                ),
                child: Column(
                  children: [
                    Icon(
                      _base64Image != null ? Icons.check_circle : Icons.camera_alt,
                      size: 40,
                      color: _base64Image != null ? const Color(0xFF00E676) : Colors.grey,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _base64Image != null ? 'Photo Captured Successfully' : 'Face Biometric Required',
                      style: TextStyle(
                        color: _base64Image != null ? const Color(0xFF00E676) : Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      icon: Icon(_base64Image == null ? Icons.camera_front : Icons.refresh),
                      label: Text(_base64Image == null ? 'Take Photo' : 'Retake Photo'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white54),
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      ),
                      onPressed: () {
                        Navigator.push(context, MaterialPageRoute(builder: (_) => CameraScreen(
                          onImageCaptured: (base64) => setState(() => _base64Image = base64)
                        )));
                      },
                    ),
                  ],
                ),
              ),
              
              const SizedBox(height: 40),
              SizedBox(
                height: 55,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _submitRegistration,
                  child: _isLoading
                      ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(color: Colors.black, strokeWidth: 3))
                      : const Text('Complete Registration', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ==========================================
// VERIFY SCREEN
// ==========================================
class VerifyScreen extends StatefulWidget {
  const VerifyScreen({super.key});

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  bool _isLoading = false;
  Map<String, dynamic>? _result;

  Future<void> _verifyFace(String base64Image) async {
    setState(() { _isLoading = true; _result = null; });

    try {
      final response = await http.post(
        Uri.parse('$SERVER_URL/api/verify'),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"image": base64Image}),
      );

      final data = jsonDecode(response.body);
      setState(() { _result = data; });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Network Error: $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool hasResult = _result != null;
    final bool isMatch = hasResult && _result!['matched'] == true;

    return Scaffold(
      appBar: AppBar(title: const Text('Live Verification', style: TextStyle(fontWeight: FontWeight.bold))),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_isLoading)
                const Column(
                  children: [
                    CircularProgressIndicator(color: Color(0xFF00E676)),
                    SizedBox(height: 20),
                    Text('Analyzing biometric data...', style: TextStyle(fontSize: 16, color: Colors.grey)),
                  ],
                )
              else if (!hasResult)
                Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(30),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                      ),
                      child: Icon(Icons.face, size: 100, color: Theme.of(context).colorScheme.primary),
                    ),
                    const SizedBox(height: 30),
                    const Text(
                      'Ready to Scan',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Position your face in the camera to verify your identity.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  ],
                )
              else
                // Result Card
                Container(
                  padding: const EdgeInsets.all(30),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isMatch ? const Color(0xFF00E676) : Colors.redAccent,
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: (isMatch ? const Color(0xFF00E676) : Colors.redAccent).withOpacity(0.2),
                        blurRadius: 20,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Icon(
                        isMatch ? Icons.verified : Icons.gpp_bad,
                        color: isMatch ? const Color(0xFF00E676) : Colors.redAccent,
                        size: 80,
                      ),
                      const SizedBox(height: 20),
                      Text(
                        isMatch ? 'Identity Verified' : 'Verification Failed',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: isMatch ? const Color(0xFF00E676) : Colors.redAccent,
                        ),
                      ),
                      const SizedBox(height: 20),
                      if (isMatch) ...[
                        _buildInfoRow('Name', _result!['user']['name']),
                        _buildInfoRow('ID', _result!['user']['user_id']),
                        _buildInfoRow('Dept', _result!['user']['department']),
                        const Divider(color: Colors.white24, height: 30),
                        Text(
                          'Confidence Score: ${_result!['similarity_score']}%',
                          style: const TextStyle(color: Colors.grey, fontSize: 14),
                        ),
                      ] else ...[
                        Text(
                          _result!['error'] ?? "Face not recognized in the system.",
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 16),
                        ),
                      ]
                    ],
                  ),
                ),
                
              const SizedBox(height: 50),
              if (!_isLoading)
                SizedBox(
                  width: double.infinity,
                  height: 60,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.camera_alt, size: 28),
                    label: Text(hasResult ? 'Scan Again' : 'Start Scan', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => CameraScreen(
                        onImageCaptured: _verifyFace,
                      )));
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey, fontSize: 16)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        ],
      ),
    );
  }
}
