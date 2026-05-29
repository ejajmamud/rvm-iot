/**
 * Configuration Settings for RVM ESP32 IoT Bridge
 * Copy this file to config.h and fill in your actual credentials.
 */

#ifndef CONFIG_H
#define CONFIG_H

// --- WiFi Settings ---
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// --- Firebase Settings ---
// Get API_KEY from Firebase Console -> Project Settings -> General -> Web API Key
#define API_KEY "YOUR_FIREBASE_API_KEY"

// Project ID from Firebase Console URL
#define FIREBASE_PROJECT_ID "YOUR_FIREBASE_PROJECT_ID"

// ESP32 registers with user credentials or service account credentials.
// For simplicity and security, we can use Firebase Email/Password Auth
// Create a dedicated user in Firebase Auth Console: e.g., rvm001@recycle.com / rvm001pass
#define USER_EMAIL "rvm001@recycle.com"
#define USER_PASSWORD "rvm001pass"

// --- Machine Metadata ---
const char* MACHINE_ID      = "RVM001";
const char* FIRMWARE_VER    = "v3.1-IoT";
const char* ESP32_VER       = "v1.0";

#endif
