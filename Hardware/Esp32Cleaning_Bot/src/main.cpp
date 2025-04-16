#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <WebServer.h>
#include <Preferences.h>

String storedSSID;
String storedPassword;

// For configuration portal
bool configMode = false;
WebServer server(80);
Preferences preferences;

// Autonomous mode variables
bool autonomousMode = false;
unsigned long lastAutonomousActionTime = 0;
int autonomousState = 0;
const int MIN_DISTANCE_FRONT = 50;  // cm
const int MIN_DISTANCE_SIDE = 35;   // cm
const int MAX_WALL_FOLLOW_DISTANCE = 40; // cm
const unsigned long AUTONOMOUS_ACTION_INTERVAL = 500; // milliseconds between actions

void handleRoot() {
  // This is the configuration page if no credentials are set or you want to reconfigure.
  String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<title>ESP32 Config</title><style>";
  html += "body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background:#f5f5f5; color:#333; }";
  html += ".container { max-width:500px; margin:0 auto; background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); }";
  html += "label { display:block; margin-bottom:5px; font-weight:bold; }";
  html += "input[type='text'], input[type='password'] { width:100%; padding:10px; margin-bottom:20px; border:1px solid #ddd; border-radius:4px; }";
  html += "input[type='submit'] { background:#0066cc; color:white; border:none; padding:12px 20px; border-radius:4px; cursor:pointer; width:100%; font-size:16px; }";
  html += "input[type='submit']:hover { background:#0055aa; }";
  html += ".reset-link { display:block; text-align:center; margin-top:20px; color:#cc0000; text-decoration:none; }";
  html += ".status { text-align:center; margin-top:20px; padding:10px; border-radius:4px; }";
  html += ".connected { background:#d4edda; color:#155724; }";
  html += ".disconnected { background:#f8d7da; color:#721c24; }";
  html += "</style></head><body><div class='container'>";
  html += "<h1>ESP32 Configuration</h1>";
  if(WiFi.status() == WL_CONNECTED)
    html += "<div class='status connected'>Connected to WiFi: " + WiFi.SSID() + "<br>IP: " + WiFi.localIP().toString() + "</div>";
  else
    html += "<div class='status disconnected'>Not connected to WiFi</div>";
  html += "<form action='/save' method='POST'>";
  html += "<label for='ssid'>WiFi SSID:</label>";
  html += "<input type='text' id='ssid' name='ssid' value='" + storedSSID + "' required>";
  html += "<label for='password'>WiFi Password:</label>";
  html += "<input type='password' id='password' name='password' value='" + storedPassword + "'>";
  html += "<input type='submit' value='Save Configuration'>";
  html += "</form>";
  html += "<a href='/reset' class='reset-link'>Reset All Configuration</a><br><br>";
  html += "</div></body></html>";
  server.send(200, "text/html", html);
}

void handleSave() {
  if(server.hasArg("ssid") && server.hasArg("password")) {
    storedSSID = server.arg("ssid");
    storedPassword = server.arg("password");

    preferences.begin("config", false);
    preferences.putString("ssid", storedSSID);
    preferences.putString("password", storedPassword);
    preferences.end();

    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<title>Configuration Saved</title><style>body { font-family:Arial, sans-serif; text-align:center; padding:20px; background:#f5f5f5; }";
    html += ".container { max-width:500px; margin:0 auto; background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); }";
    html += "h1 { color:#28a745; }</style>";
    html += "<script>setTimeout(function(){ window.location.href = '/'; },5000);</script>";
    html += "</head><body><div class='container'><h1>Configuration Saved!</h1><p>Your settings have been saved. The device will restart shortly.</p></div></body></html>";
    server.send(200, "text/html", html);
    delay(2000);
    ESP.restart();
  } else {
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<title>Error</title><style>body { font-family:Arial, sans-serif; text-align:center; padding:20px; background:#f5f5f5; }";
    html += ".container { max-width:500px; margin:0 auto; background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); }";
    html += "h1 { color:#dc3545; }</style></head><body><div class='container'><h1>Error</h1><p>Missing required parameters.</p>";
    html += "<a href='/'>Go Back</a></div></body></html>";
    server.send(400, "text/html", html);
  }
}

void handleReset() {
  preferences.begin("config", false);
  preferences.clear();
  preferences.end();
  String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<title>Configuration Reset</title><style>body { font-family:Arial, sans-serif; text-align:center; padding:20px; background:#f5f5f5; }";
  html += ".container { max-width:500px; margin:0 auto; background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); }";
  html += "h1 { color:#dc3545; }</style></head><body><div class='container'><h1>Configuration Reset!</h1>";
  html += "<p>All settings have been cleared. The device will restart shortly.</p></div></body></html>";
  server.send(200, "text/html", html);
  delay(2000);
  ESP.restart();
}

void mainConfigServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/reset", HTTP_GET, handleReset);
  server.begin();
  Serial.println("Web server started");
}

const char* ssid = "Project";
const char* password = "12345678";
unsigned long lastWifiCheckTime = 0;
const unsigned long wifiCheckInterval = 30000;

// Firebase configuration
#define DATABASE_URL "https://bot-projects-193c9-default-rtdb.asia-southeast1.firebasedatabase.app"
#define API_KEY "AIzaSyCyYA0c19EqGGKdUObqryuBBXUL9e1c4_o"

// Define Firebase objects
FirebaseData fbdoStream, fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Firebase real-time database paths
#define RTDB_PATH "/esp32_cleaning_bot"
String mainPath = RTDB_PATH;
String commandPath;

// Function declarations
void streamCallback(FirebaseStream data);
void streamTimeoutCallback(bool timeout);
void processCommand(String command);
void connectToFirebase();
void checkWiFiConnection();
void moveForward();
void moveBackward();
void turnLeft();
void turnRight();
void stopMotors();
long getDistance(int trig, int echo);
void handleAutonomousMode();

// Motor direction pins
#define IN1 13
#define IN2 12
#define IN3 14
#define IN4 27

// Speed control pin
#define SPEED_PIN 15

// Pump pin
#define PUMP_PIN 23

// Ultrasonic sensors
#define TRIG_FRONT 4
#define ECHO_FRONT 5
#define TRIG_LEFT 19
#define ECHO_LEFT 18
#define TRIG_RIGHT 21
#define ECHO_RIGHT 22

int currentSpeed = 150;

void connectToFirebase() {
  // Configure Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.token_status_callback = tokenStatusCallback;
  config.max_token_generation_retry = 3;

  Firebase.reconnectNetwork(true);
  fbdo.setBSSLBufferSize(4096, 1024);
  fbdo.setResponseSize(2048);

  auth.user.email = "venkatnvs2005@gmail.com";
  auth.user.password = "venkat123";
  Firebase.begin(&config, &auth);

  // Wait for Firebase to be ready
  int retryCount = 0;
  while (!Firebase.ready() && retryCount < 5)
  {
    delay(500);
    retryCount++;
    Serial.print(".");
  }
  Serial.println("\nFirebase ready!");

  // Set up Firebase paths
  commandPath = mainPath;
  commandPath+= "/triggers/command";

  // Start Firebase streaming for manual commands
  if (!Firebase.RTDB.beginStream(&fbdoStream, commandPath))
  {
    Serial.printf("Stream failed: %s\n", fbdoStream.errorReason().c_str());
  }
  else
  {
    Firebase.RTDB.setStreamCallback(&fbdoStream, streamCallback, streamTimeoutCallback);
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi disconnected. Reconnecting...");
      WiFi.disconnect();
      delay(1000);
      WiFi.begin(storedSSID.c_str(), storedPassword.c_str());
  } else {
      Serial.println("WiFi is connected. No action needed.");
  }
}

void loadConfig() {
  preferences.begin("config", true);
  storedSSID = preferences.getString("ssid", "");
  storedPassword = preferences.getString("password", "");
  preferences.end();
}

void setup() {
  Serial.begin(115200);
  loadConfig();

  if (storedSSID == "") {
    Serial.println("No WiFi credentials found, starting configuration portal.");
    configMode = true;
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32-Config");
    mainConfigServer();
    return;
  } else {
    // Attempt to connect to WiFi in STA mode.
    WiFi.mode(WIFI_STA);
    WiFi.begin(storedSSID.c_str(), storedPassword.c_str());
    Serial.print("Connecting to WiFi");
    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 15000) {
      Serial.print(".");
      delay(500);
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("\nFailed to connect. Starting configuration portal.");
      configMode = true;
      WiFi.mode(WIFI_AP);
      WiFi.softAP("ESP32-Config");
      mainConfigServer();
      return;
    } else {
      Serial.println();
      Serial.print("Connected! IP address: ");
      Serial.println(WiFi.localIP());
      mainConfigServer();
      connectToFirebase();
    }
  }

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  pinMode(SPEED_PIN, OUTPUT);
  analogWrite(SPEED_PIN, currentSpeed);

  pinMode(PUMP_PIN, OUTPUT);

  pinMode(TRIG_FRONT, OUTPUT); pinMode(ECHO_FRONT, INPUT);
  pinMode(TRIG_LEFT, OUTPUT);  pinMode(ECHO_LEFT, INPUT);
  pinMode(TRIG_RIGHT, OUTPUT); pinMode(ECHO_RIGHT, INPUT);

  Serial.println("Bot ready with analogWrite speed control.");
}

void loop() {
  server.handleClient();
  if (configMode) return;

  // Check and maintain WiFi connection
  if (millis() - lastWifiCheckTime > wifiCheckInterval) {
    checkWiFiConnection();
    lastWifiCheckTime = millis();
  }

  // Handle autonomous mode if active
  if (autonomousMode) {
    handleAutonomousMode();
  }

  if (Serial.available()) {
    char cmd = Serial.read();

    if (cmd == 'F') {
      moveForward();
    } else if (cmd == 'B') {
      moveBackward();
    } else if (cmd == 'L') {
      turnLeft();
    } else if (cmd == 'R') {
      turnRight();
    } else if (cmd == 'S') {
      stopMotors();
    } else if (cmd == 'W') {
      analogWrite(PUMP_PIN, 170);
    } else if (cmd == 'w') {
      digitalWrite(PUMP_PIN, LOW);
    } else if (cmd == 'A') {
      autonomousMode = true;
      autonomousState = 0;
      Serial.println("Autonomous mode activated");
    } else if (cmd == 'a') {
      autonomousMode = false;
      stopMotors();
      Serial.println("Autonomous mode deactivated");
    }

    // Speed control
    else if (cmd == '1') {
      currentSpeed = 100; Serial.println("Speed: Low");
    } else if (cmd == '2') {
      currentSpeed = 150; Serial.println("Speed: Medium");
    } else if (cmd == '3') {
      currentSpeed = 200; Serial.println("Speed: Fast");
    } else if (cmd == '4') {
      currentSpeed = 255; Serial.println("Speed: Max");
    }

    analogWrite(SPEED_PIN, currentSpeed); // Apply updated speed
  }
}

// Autonomous navigation logic
void handleAutonomousMode() {
  if (millis() - lastAutonomousActionTime < AUTONOMOUS_ACTION_INTERVAL) {
    return; // Not enough time has passed since last action
  }
  
  lastAutonomousActionTime = millis();
  
  // Get sensor readings
  long frontDistance = getDistance(TRIG_FRONT, ECHO_FRONT);
  long leftDistance = getDistance(TRIG_LEFT, ECHO_LEFT);
  long rightDistance = getDistance(TRIG_RIGHT, ECHO_RIGHT);
  
  // Print sensor readings in autonomous mode
  Serial.print("AUTO - Front: "); Serial.print(frontDistance);
  Serial.print(" cm, Left: "); Serial.print(leftDistance);
  Serial.print(" cm, Right: "); Serial.print(rightDistance);
  Serial.print(" cm, State: "); Serial.println(autonomousState);
  
  // State machine for autonomous navigation
  switch (autonomousState) {
    case 0: // Moving forward
      if (frontDistance > 0 && frontDistance < MIN_DISTANCE_FRONT) {
        // Obstacle detected in front, decide which way to turn
        stopMotors();
        
        // Alternate between right and left turns
        if (rightDistance > leftDistance) {
          autonomousState = 1; // Turn right
          Serial.println("AUTO: Obstacle ahead, turning right");
        } else {
          autonomousState = 3; // Turn left
          Serial.println("AUTO: Obstacle ahead, turning left");
        }
      } else {
        // No obstacle ahead, keep moving forward
        moveForward();
        
        // Check if we need to adjust to follow walls
        if (leftDistance > 0 && leftDistance < MAX_WALL_FOLLOW_DISTANCE) {
          // Left wall detected, adjust to follow it
          if (leftDistance < MIN_DISTANCE_SIDE) {
            // Too close to left wall, veer slightly right
            turnRight();
            delay(100);
            moveForward();
          }
        } else if (rightDistance > 0 && rightDistance < MAX_WALL_FOLLOW_DISTANCE) {
          // Right wall detected, adjust to follow it
          if (rightDistance < MIN_DISTANCE_SIDE) {
            // Too close to right wall, veer slightly left
            turnLeft();
            delay(100);
            moveForward();
          }
        }
      }
      break;
      
    case 1: // Turning right
      turnRight();
      delay(500); // Turn for a set amount of time
      autonomousState = 2; // Move forward until wall on left
      break;
      
    case 2: // Moving forward looking for left wall
      moveForward();
      if (leftDistance > 0 && leftDistance < MAX_WALL_FOLLOW_DISTANCE) {
        // Left wall detected, start following it
        autonomousState = 0;
        Serial.println("AUTO: Left wall found, resuming normal navigation");
      }
      
      // Check if there's an obstacle ahead
      if (frontDistance > 0 && frontDistance < MIN_DISTANCE_FRONT) {
        stopMotors();
        autonomousState = 3; // Turn left next
        Serial.println("AUTO: Obstacle ahead during right search, turning left");
      }
      break;
      
    case 3: // Turning left
      turnLeft();
      delay(500); // Turn for a set amount of time
      autonomousState = 4; // Move forward until wall on right
      break;
      
    case 4: // Moving forward looking for right wall
      moveForward();
      if (rightDistance > 0 && rightDistance < MAX_WALL_FOLLOW_DISTANCE) {
        // Right wall detected, start following it
        autonomousState = 0;
        Serial.println("AUTO: Right wall found, resuming normal navigation");
      }
      
      // Check if there's an obstacle ahead
      if (frontDistance > 0 && frontDistance < MIN_DISTANCE_FRONT) {
        stopMotors();
        autonomousState = 1; // Turn right next
        Serial.println("AUTO: Obstacle ahead during left search, turning right");
      }
      break;
  }
}

// Movement functions
void moveForward() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
}

void moveBackward() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
}

void turnLeft() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
}

void turnRight() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
}

void stopMotors() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
}

// Ultrasonic distance function
long getDistance(int trig, int echo) {
  digitalWrite(trig, LOW); delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long duration = pulseIn(echo, HIGH, 20000);
  return duration == 0 ? -1 : (duration * 0.034 / 2);
}

void processCommand(String command) {
  if (command == "F"){
    autonomousMode = false; // Disable autonomous mode when manual command received
    moveForward();
    Serial.println("Moving forward");
  }
  else if (command == "B"){
    autonomousMode = false;
    moveBackward();
    Serial.println("Moving backward");
  }
  else if (command == "L"){
    autonomousMode = false;
    turnLeft();
    Serial.println("Turning left");
  }
  else if (command == "R"){
    autonomousMode = false;
    turnRight();
    Serial.println("Turning right");
  }
  else if (command == "S"){
    autonomousMode = false;
    stopMotors();
    Serial.println("Stopped");
  }
  else if (command == "W"){
    analogWrite(PUMP_PIN, 170);
    Serial.println("Pump ON");
  }
  else if (command == "w"){
    digitalWrite(PUMP_PIN, LOW);
    Serial.println("Pump OFF");
  }
  else if (command == "at"){
    autonomousMode = true;
    autonomousState = 0;
    Serial.println("Autonomous mode activated");
  }
  else if (command == "st"){
    autonomousMode = false;
    stopMotors();
    Serial.println("Autonomous mode deactivated");
  }
  else if (command == "speed"){
    String speedPath = mainPath;
    speedPath+= "/triggers/speed";
    if (!Firebase.RTDB.getInt(&fbdo, speedPath))
    {
        Serial.printf("Failed to get speed: %s\n", fbdo.errorReason().c_str());
        return;
    } else {
      Serial.println("Speed value retrieved from Firebase");
      currentSpeed = fbdo.intData();
      analogWrite(SPEED_PIN, currentSpeed);
      Serial.printf("Speed set to: %d\n", currentSpeed);
    }
    {
      String newCommandPath = mainPath;
      newCommandPath += "/triggers/command";
      Firebase.RTDB.setString(&fbdo, newCommandPath, "none");
      Serial.println("Command reset to 'none' after processing.");
    }
  }
  else {
    Serial.println("Unknown command: ");
    Serial.println(command);
    if (!autonomousMode) {
      stopMotors();
    }
  }
}

void streamCallback(FirebaseStream data)
{
  Serial.println("Stream event received!");
  if (data.dataType() == "string")
  {
    String action = data.stringData();
    Serial.printf("Action received: %s\n", action.c_str());
    processCommand(action);
  }
}

void streamTimeoutCallback(bool timeout)
{
  if (timeout)
  {
    Serial.println("Stream timeout occurred, reconnecting...");
  }
  else
  {
    Serial.println("Stream disconnected, trying to reconnect...");
  }
  Firebase.RTDB.beginStream(&fbdoStream, commandPath);
}