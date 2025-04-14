#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

const char* ssid = "Projects";
const char* password = "12345678@";
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
void connectWiFi();
void checkWiFiConnection();
void moveForward();
void moveBackward();
void turnLeft();
void turnRight();
void stopMotors();
long getDistance(int trig, int echo);

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

// --- WiFi Connection Management ---
void connectWiFi() {
  Serial.println("Connecting to WiFi...");
  
  WiFi.begin(ssid, password);
  
  // Wait up to 20 seconds for connection
  unsigned long startAttemptTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 20000) {
      delay(500);
      Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nConnected to WiFi");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
      Serial.println("WiFi connected: ");
      Serial.println(WiFi.localIP().toString());
  } else {
      Serial.println("\nFailed to connect to WiFi");
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi disconnected. Reconnecting...");
      WiFi.disconnect();
      delay(1000);
      connectWiFi();
  } else {
      stopMotors();
      Serial.println("WiFi is connected. No action needed.");
  }
}

void setup() {
  Serial.begin(115200);

  // Connect to WiFi
  connectWiFi();

  connectToFirebase();

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

  // Check and maintain WiFi connection
  if (millis() - lastWifiCheckTime > wifiCheckInterval) {
    checkWiFiConnection();
    lastWifiCheckTime = millis();
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
      digitalWrite(PUMP_PIN, HIGH);
    } else if (cmd == 'w') {
      digitalWrite(PUMP_PIN, LOW);
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

  // Print ultrasonic sensor readings
  Serial.print("Front: "); Serial.print(getDistance(TRIG_FRONT, ECHO_FRONT));
  Serial.print(" cm, Left: "); Serial.print(getDistance(TRIG_LEFT, ECHO_LEFT));
  Serial.print(" cm, Right: "); Serial.println(getDistance(TRIG_RIGHT, ECHO_RIGHT));

  delay(500);
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
    moveForward();
    Serial.println("Moving forward");
  }
  else if (command == "B"){
    moveBackward();
    Serial.println("Moving backward");
  }
  else if (command == "L"){
    turnLeft();
    Serial.println("Turning left");
  }
  else if (command == "R"){
    turnRight();
    Serial.println("Turning right");
  }
  else if (command == "S"){
    stopMotors();
    Serial.println("Stopped");
  }
  else if (command == "W"){
    digitalWrite(PUMP_PIN, HIGH);
    Serial.println("Pump ON");
  }
  else if (command == "w"){
    digitalWrite(PUMP_PIN, LOW);
    Serial.println("Pump OFF");
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
      Serial.println("Failed to get speed value from Firebase");
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
    stopMotors();
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