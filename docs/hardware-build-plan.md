# Hardware Build Plan — Complete Beginner's Guide

**For:** Kalysha
**Assumes:** Zero electronics experience. Never touched a breadboard. That's fine.
**Two builds:** Environment Sensor (bedroom) + IMU Velocity Tracker (barbell)
**Start with:** Environment Sensor — it's easier and you already have the parts.

---

## Quick Vocab (seriously, just 10 terms)

Before we start, here's every term you'll need. That's it. Nothing else.

- **ESP32** — A tiny computer the size of your thumb. It has WiFi and Bluetooth built in. It runs one program that you upload from your laptop. Think of it as a very dumb phone that can only do one thing.
- **Sensor** — A little chip that measures something (temperature, air quality, motion). It can't do anything on its own — it just reports numbers to the ESP32.
- **Breadboard** — A plastic board with rows of holes. You push wires and components into the holes to connect them *without soldering*. It's like Lego for circuits. Nothing is permanent.
- **Jumper wires** — Short colored wires with pins on each end. They connect things on the breadboard. You just push them in.
- **Pin** — A tiny metal leg on a component. Each pin has a name (like "VCC" or "GND" or "SDA") printed on the board.
- **VCC / 3V3** — The "power" pin. It gives the sensor electricity. VCC usually means "whatever voltage this thing needs." 3V3 means 3.3 volts specifically.
- **GND** — Ground. The "return path" for electricity. Every component needs a GND connection. Think of it like the other prong on a plug.
- **SDA / SCL** — Two specific wires that let the ESP32 talk to a sensor. SDA carries the data, SCL carries the clock signal that keeps them in sync. Together they're called "I2C" (pronounced "eye-squared-see"). You don't need to understand the protocol — just connect the right pins.
- **TX / RX** — Transmit and Receive. Another way components talk to each other (called "Serial"). TX on one device connects to RX on the other, and vice versa. Like two people each holding one end of a tin-can telephone.
- **USB cable** — How you connect the ESP32 to your laptop to upload code and power it. Micro-USB or USB-C depending on which ESP32 board you bought.

That's it. You now know enough to build both projects.

---

## What You Have vs. What You Need

### Already ordered (~$47, from your Amazon cart)

| Part | What it does | Which build |
|---|---|---|
| ESP32-WROOM DevKit | The brain — runs your code, connects to WiFi | Environment Sensor |
| BME280 | Measures temperature, humidity, and air pressure | Environment Sensor |
| PMS5003 | Measures PM2.5 air quality (tiny particles in the air) | Environment Sensor |
| MAX4466 | Measures noise level (microphone on a chip) | Environment Sensor |

### Still need to order (~$45–55 total)

**For both builds (shared supplies):**

| Part | Why | Where | Price |
|---|---|---|---|
| Breadboard (2-pack) | Connect components without soldering — get 2, one per build | Amazon: search "breadboard 830 point" | ~$8 |
| Jumper wire kit (M-M, M-F, F-F) | Connect everything. Get a kit with all 3 types, at least 40 of each. | Amazon: search "jumper wire kit arduino" | ~$7 |
| Resistor assortment kit | You need specific resistors for the air quality sensor. A kit is cheaper than buying singles. | Amazon: search "resistor kit 1/4 watt" | ~$7 |
| Micro-USB cables (2-pack) | Power and program the ESP32s. You might already have these — they're the same as old Android charger cables. Check your drawers first! | Amazon | ~$6 |

**For the IMU Velocity Tracker (barbell):**

| Part | Why | Where | Price |
|---|---|---|---|
| ESP32-S3 DevKit (or second ESP32-WROOM) | Second brain for the barbell sensor. S3 has better Bluetooth, but either works. | Amazon: ~$10 | ~$10 |
| MPU6050 (GY-521 breakout board) | 6-axis motion sensor — measures acceleration and rotation on the barbell | Amazon: search "MPU6050 GY-521" | ~$4 |
| 3.7V LiPo battery, 500mAh, JST connector | Wireless power during lifts. JST connector is the little white plug. | Amazon: search "3.7v lipo 500mah JST" | ~$8 |
| TP4056 USB-C charger module | Recharges the battery via USB-C | Amazon: search "TP4056 USB-C" | ~$4 |

**Optional but helpful:**

| Part | Why | Price |
|---|---|---|
| Multimeter (basic) | Test if connections are working. Not required, but useful for debugging. | ~$15 |
| USB power adapter | So you don't tie up your laptop for the environment sensor. Any phone charger with the right USB plug works. | Free (use old phone charger) |

---

## Build 1: Environment Sensor (Start Here)

This one goes in your bedroom. It measures air quality, temperature, humidity, and noise, then sends data to Baseline over WiFi every 5 minutes.

### Step 1: Unbox and identify everything

Lay out your parts on a clean table. Match each part to its name:

1. **ESP32 DevKit** — The biggest board. Has "ESP32" printed on the metal shield. Two rows of pins along the sides.
2. **BME280** — Tiny purple or blue board, about the size of your thumbnail. 4 pins labeled VCC, GND, SCL, SDA.
3. **PMS5003** — Chunky rectangular box with a small fan inside and a ribbon cable coming out. This one is the most delicate — don't drop it.
4. **MAX4466** — Small board with a round silver cylinder (the microphone). 3 pins: VCC, GND, OUT.
5. **Breadboard** — White or transparent plastic rectangle with a grid of holes.
6. **Jumper wires** — Bag of colored wires. Separate them into Male-Male (pins on both ends) and Male-Female (pin on one end, socket on the other).

### Step 2: Seat the ESP32 on the breadboard

The breadboard has a groove running down the middle. The ESP32 straddles this groove — one row of pins on each side.

```
Breadboard (top view):
┌──────────────────────────────────────────┐
│  + + + + + + + + + + + + + + + + + + + + │  ← Power rail (we'll use later)
│  − − − − − − − − − − − − − − − − − − − │  ← Ground rail
│                                          │
│  a b c d e │ │ f g h i j                 │
│  · · · · · │ │ · · · · ·   ← row 1      │
│  · · · · · │ │ · · · · ·   ← row 2      │
│  · · · · · │ │ · · · · ·   ← row 3      │
│  ...       │ │       ...                 │
│                                          │
│  Push ESP32 pins into columns d and g    │
│  so the chip straddles the center gap    │
│                                          │
└──────────────────────────────────────────┘
```

**How to do it:**
1. Hold the ESP32 with the USB port facing up (toward the top of the breadboard).
2. Line up the left row of pins with column **d** (or **e**) and the right row with column **g** (or **f**).
3. Gently press down until all pins are seated in the holes. Don't force it — wiggle slightly if it's tight.

**Why this works:** Each row of 5 holes (a–e and f–j) is connected internally. So anything plugged into the same row as an ESP32 pin is electrically connected to that pin. The center gap keeps the left and right sides separate.

### Step 3: Connect the BME280 (temperature + humidity + pressure)

This is your easiest sensor. 4 wires, that's it.

**Find these pins on your ESP32 board** (they're labeled on the board itself — use a magnifying glass or phone camera if the text is tiny):

| BME280 pin | Connect to ESP32 pin | Wire color suggestion |
|---|---|---|
| VCC | 3V3 (3.3 volt output) | Red |
| GND | GND | Black |
| SDA | GPIO 21 | Blue |
| SCL | GPIO 22 | Yellow |

**How to connect:**
1. Push the BME280 into the breadboard somewhere with space (e.g., rows 25–28 on the right side).
2. Use a jumper wire from the BME280's VCC row to the ESP32's 3V3 row.
3. Use a jumper wire from the BME280's GND row to the ESP32's GND row.
4. Use a jumper wire from BME280's SDA row to ESP32's GPIO 21 row.
5. Use a jumper wire from BME280's SCL row to ESP32's GPIO 22 row.

```
ESP32                    BME280
┌──────────┐             ┌──────────┐
│ 3V3  ●─── red wire ───●── VCC    │
│ GND  ●─── black wire ─●── GND    │
│ G21  ●─── blue wire ──●── SDA    │
│ G22  ●─── yellow wire ●── SCL    │
└──────────┘             └──────────┘
```

**Test it works:** Don't worry, we'll test after uploading code in Step 7. For now, just make sure the wires are snug.

### Step 4: Connect the PMS5003 (air quality)

This one is trickier because it uses 5V logic but the ESP32 uses 3.3V. You need a **voltage divider** — which sounds scary but is literally just two resistors.

**The PMS5003 has a ribbon cable** with a connector. You'll either:
- (a) Have an adapter board that came with it (a small PCB with pins). If so, use that — it breaks out the pins for you.
- (b) Need to carefully identify the wires in the ribbon cable. The PMS5003 datasheet shows: Pin 1 = VCC (5V), Pin 2 = GND, Pin 3 = not used, Pin 4 = RX, Pin 5 = TX.

**Connections:**

| PMS5003 pin | Connect to | Notes |
|---|---|---|
| VCC (Pin 1) | ESP32 **5V** (or VIN) | This sensor needs 5V, not 3.3V! |
| GND (Pin 2) | GND | Same ground as everything else |
| TX (Pin 5) | ESP32 GPIO 16 (RX2) | PMS5003 transmits → ESP32 receives |
| RX (Pin 4) | Voltage divider output → GPIO 17 (TX2) | ⚠️ See below |

**The voltage divider (don't skip this):**

The ESP32's TX pin outputs 3.3V. The PMS5003's RX pin expects 3.3V or 5V — this direction is actually fine. BUT the PMS5003's TX outputs 5V and the ESP32 GPIO can only handle 3.3V. Sending 5V into a 3.3V pin can damage the ESP32.

Here's the fix — a voltage divider using two resistors:

```
PMS5003 TX pin (5V signal)
        │
        ├──[10kΩ resistor]──┬── to ESP32 GPIO 16
        │                   │
        │              [20kΩ resistor]
        │                   │
        └───────────────────┴── GND
```

**What this does:** The two resistors split the 5V signal down to ~3.3V. It's like a seesaw — the ratio of the resistors determines the output voltage. 10k and 20k gives you 5V × (20k ÷ 30k) = 3.33V.

**How to build it on the breadboard:**
1. Find a 10kΩ resistor (brown-black-orange bands) and a 20kΩ resistor (red-black-orange bands) from your kit. If you don't have exactly 20kΩ, two 10kΩ resistors in series (end to end) work too.
2. Pick an empty area of the breadboard (like rows 35–38).
3. Push one end of the 10kΩ resistor into a hole, and the other end into a different row.
4. From that second row (where both resistors meet), run a jumper wire to ESP32 GPIO 16.
5. Push the 20kΩ resistor from that same second row to a third row.
6. From the third row, run a jumper wire to GND.
7. Run a wire from the PMS5003 TX to the first row (before the 10kΩ).

**If this is confusing**, that's completely normal. Just take it one connection at a time, and double-check against the diagram above.

### Step 5: Connect the MAX4466 (noise level)

Easiest sensor. 3 wires, no resistors needed.

| MAX4466 pin | Connect to ESP32 pin |
|---|---|
| VCC | 3V3 |
| GND | GND |
| OUT | GPIO 34 |

GPIO 34 is an analog input pin — it reads the voltage level from the microphone, which represents noise volume.

### Step 6: Double-check everything

Before plugging in power, verify:

- [ ] Every VCC/3V3 connection goes to the correct power pin (BME280 and MAX4466 to 3V3, PMS5003 to 5V)
- [ ] Every GND connection goes to a GND pin on the ESP32
- [ ] No bare wires touching each other
- [ ] The voltage divider is between PMS5003 TX and ESP32 GPIO 16
- [ ] The ESP32 is seated firmly in the breadboard with no bent pins

**Common mistakes:**
- Wires in the wrong row (off by one hole = not connected)
- GND and VCC swapped (this can damage sensors — double check!)
- Jumper wire not fully pushed in (it looks connected but wiggles loose)

### Step 7: Install Arduino IDE and upload code

Now the software part. You'll install a free program on your laptop, paste in the code, and click "upload."

**7a. Install Arduino IDE:**
1. Go to https://www.arduino.cc/en/software
2. Download Arduino IDE 2.x for your OS (Mac/Windows)
3. Install and open it

**7b. Add ESP32 board support:**
1. In Arduino IDE, go to **File → Preferences**
2. In "Additional Board Manager URLs", paste:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Click OK
4. Go to **Tools → Board → Board Manager**
5. Search "esp32" and install **"esp32 by Espressif Systems"**
6. Go to **Tools → Board** and select **"ESP32 Dev Module"** (or "ESP32-S3 Dev Module" if you have an S3)

**7c. Install sensor libraries:**
1. Go to **Sketch → Include Library → Manage Libraries**
2. Search and install each of these:
   - `Adafruit BME280` (also installs Adafruit Sensor automatically)
   - `ArduinoJson`
3. The PMS5003 and MAX4466 don't need libraries — we'll read them directly

**7d. Connect the ESP32:**
1. Plug the ESP32 into your laptop via the USB cable
2. Go to **Tools → Port** and select the port that appeared (something like `/dev/cu.usbserial-XXX` on Mac or `COM3` on Windows)
3. If no port appears, you may need a driver — search "CP2102 driver" or "CH340 driver" for your OS (depends on which USB chip your ESP32 board uses)

**7e. Upload the firmware:**

This is the code you'll paste into Arduino IDE. It reads all sensors and POSTs the data to your Baseline app over WiFi.

1. In Arduino IDE, go to **File → New Sketch**
2. Delete everything in the editor
3. Paste the code below
4. **Edit the 3 lines at the top** with your WiFi name, password, and Baseline URL
5. Click the **→ (Upload)** button in the top left
6. Wait for "Done uploading" in the bottom panel

```cpp
// ===== EDIT THESE THREE LINES =====
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* BASELINE_URL  = "http://YOUR_LAPTOP_IP:3000/api/env-readings";
// The API key you set in your .env file as SENSOR_API_KEY
const char* API_KEY       = "your-sensor-api-key-here";
// ===================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <ArduinoJson.h>

Adafruit_BME280 bme;

// PMS5003 on Serial2 (GPIO 16 = RX, GPIO 17 = TX)
#define PMS_RX 16
#define PMS_TX 17

// MAX4466 on analog pin
#define MIC_PIN 34

// How often to send data (milliseconds)
#define SEND_INTERVAL 300000  // 5 minutes

unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);   // Debug output to your laptop
  Serial2.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);  // PMS5003

  // Connect to WiFi
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  // Init BME280
  if (!bme.begin(0x76)) {
    Serial.println("BME280 not found! Check wiring.");
    // Try alternate address
    if (!bme.begin(0x77)) {
      Serial.println("BME280 not found at 0x77 either. Halting.");
      while (1) delay(1000);
    }
  }
  Serial.println("BME280 ready.");

  // Give PMS5003 time to warm up
  Serial.println("Warming up PMS5003 (30 seconds)...");
  delay(30000);
  Serial.println("Ready!");
}

// Read PMS5003 PM2.5 value
float readPM25() {
  // PMS5003 sends 32-byte frames continuously
  while (Serial2.available() < 32) {
    delay(100);
  }

  uint8_t buf[32];
  // Look for start bytes 0x42 0x4D
  while (Serial2.available()) {
    if (Serial2.read() == 0x42) {
      if (Serial2.peek() == 0x4D) {
        Serial2.read(); // consume 0x4D
        buf[0] = 0x42;
        buf[1] = 0x4D;
        for (int i = 2; i < 32; i++) {
          while (!Serial2.available()) delay(1);
          buf[i] = Serial2.read();
        }
        // PM2.5 standard is at bytes 10-11
        uint16_t pm25 = (buf[10] << 8) | buf[11];
        return (float)pm25;
      }
    }
  }
  return -1; // Failed to read
}

// Read noise level from MAX4466 (returns approximate dB)
float readNoiseDb() {
  // Sample for 100ms and find peak-to-peak amplitude
  unsigned long start = millis();
  int minVal = 4095;
  int maxVal = 0;

  while (millis() - start < 100) {
    int val = analogRead(MIC_PIN);
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
  }

  int peakToPeak = maxVal - minVal;
  // Convert to approximate dB (rough calibration)
  // 0 = silence, 4095 = max. This is approximate — not lab-grade.
  float voltage = (peakToPeak * 3.3) / 4095.0;
  float db = 20.0 * log10(voltage / 0.001); // Reference: 1mV
  if (db < 30) db = 30;   // Floor at ~ambient silence
  if (db > 100) db = 100;  // Cap at ~very loud
  return db;
}

void sendData() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 20) {
      delay(500);
      tries++;
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi reconnect failed. Skipping this reading.");
      return;
    }
  }

  float temperature = bme.readTemperature();       // °C
  float humidity = bme.readHumidity();              // %
  float pressure = bme.readPressure() / 100.0;     // hPa
  float pm25 = readPM25();
  float noiseDb = readNoiseDb();

  // Print to serial monitor (so you can see it on your laptop)
  Serial.printf("Temp: %.1f°C  Humidity: %.1f%%  Pressure: %.1fhPa  PM2.5: %.0f  Noise: %.1fdB\n",
                temperature, humidity, pressure, pm25, noiseDb);

  // Build JSON
  JsonDocument doc;
  doc["deviceId"] = "bedroom-sensor-01";
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["pressure"] = pressure;
  doc["pm25"] = pm25;
  doc["noiseDb"] = noiseDb;

  String json;
  serializeJson(doc, json);

  // POST to Baseline
  HTTPClient http;
  http.begin(BASELINE_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + API_KEY);

  int httpCode = http.POST(json);

  if (httpCode > 0) {
    Serial.printf("Sent! Response: %d\n", httpCode);
  } else {
    Serial.printf("Failed to send: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

void loop() {
  unsigned long now = millis();
  if (now - lastSend >= SEND_INTERVAL || lastSend == 0) {
    sendData();
    lastSend = now;
  }
  delay(1000);
}
```

**7f. Verify it's working:**
1. After uploading, click **Tools → Serial Monitor** in Arduino IDE
2. Set the baud rate to **115200** (dropdown in the top right of the serial monitor)
3. You should see:
   ```
   Connecting to WiFi... Connected!
   IP: 192.168.1.xxx
   BME280 ready.
   Warming up PMS5003 (30 seconds)...
   Ready!
   Temp: 22.3°C  Humidity: 45.2%  Pressure: 1013.2hPa  PM2.5: 8  Noise: 34.2dB
   Sent! Response: 200
   ```
4. If you see "BME280 not found" — a wire is loose. Check VCC, GND, SDA, SCL.
5. If WiFi fails — double-check your SSID and password (case-sensitive!).
6. If the POST fails — make sure your Baseline app is running (`npm run dev`) and the URL/API key are correct.

### Step 8: Place it in your bedroom

Once it's working:
1. Find a spot near your bed but not directly next to it (the PMS5003 fan makes a faint hum)
2. Power it with a USB cable plugged into a phone charger (no laptop needed)
3. It will auto-connect to WiFi and start reporting every 5 minutes
4. Check your Baseline dashboard — the EnvCard should show live readings

**You're done with Build 1!**

---

## Build 2: IMU Velocity Tracker (Barbell)

This one goes on your barbell. It measures how fast the bar moves during each rep and sends the data to your laptop/phone via Bluetooth.

**Do this build AFTER the environment sensor** — you'll be more comfortable with wiring by then.

### Step 1: Order the IMU-specific parts

If you haven't already, order:
- Second ESP32 (S3 preferred, WROOM works)
- MPU6050 (GY-521 breakout)
- 3.7V LiPo battery (500mAh, JST connector)
- TP4056 USB-C charger module

### Step 2: Seat the ESP32 on a fresh breadboard

Same as Build 1, Step 2. Use your second breadboard.

### Step 3: Connect the MPU6050

This is identical to the BME280 wiring — same 4 wires, same pins.

| MPU6050 pin | Connect to ESP32 pin | Wire color suggestion |
|---|---|---|
| VCC | 3V3 | Red |
| GND | GND | Black |
| SDA | GPIO 21 | Blue |
| SCL | GPIO 22 | Yellow |

The MPU6050 board also has AD0 and INT pins. For now:
- **AD0** → connect to GND (sets the I2C address — don't worry about what that means)
- **INT** → leave unconnected (we don't need it)

```
ESP32                    MPU6050 (GY-521)
┌──────────┐             ┌──────────┐
│ 3V3  ●─── red wire ───●── VCC    │
│ GND  ●─── black wire ─●── GND    │
│ G21  ●─── blue wire ──●── SDA    │
│ G22  ●─── yellow wire ●── SCL    │
│ GND  ●─── black wire ─●── AD0    │
└──────────┘             └──────────┘
```

### Step 4: Upload the IMU firmware

Same process as Build 1 Step 7 (open Arduino IDE, select board, select port), but with different code.

**Install one more library first:**
1. **Sketch → Include Library → Manage Libraries**
2. Search and install: `Adafruit MPU6050`

Then paste this code, upload, and open Serial Monitor to verify:

```cpp
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>

Adafruit_MPU6050 mpu;

// BLE UUIDs
#define SERVICE_UUID        "4241534c-494e-4500-0001-000000000000"
#define REP_DATA_UUID       "4241534c-494e-4500-0001-000000000001"
#define CONTROL_UUID        "4241534c-494e-4500-0001-000000000002"
#define BATTERY_UUID        "4241534c-494e-4500-0001-000000000003"

BLECharacteristic* repChar;
BLECharacteristic* controlChar;
bool deviceConnected = false;
bool tracking = false;

// Rep detection
enum RepPhase { IDLE, CONCENTRIC, LOCKOUT, ECCENTRIC };
RepPhase phase = IDLE;
int repCount = 0;

// Calibration
float gravityOffset = 9.81;
bool calibrated = false;

// Velocity integration
float velocity = 0;
float displacement = 0;
float peakVelocity = 0;
unsigned long repStartTime = 0;
unsigned long lastSampleTime = 0;

// Thresholds
const float ACCEL_THRESHOLD = 0.5;   // m/s² above gravity to detect movement
const float VELOCITY_THRESHOLD = 0.05; // m/s minimum to count as moving
const float MIN_REP_DURATION = 0.3;    // seconds

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* s) { deviceConnected = true; Serial.println("BLE connected"); }
  void onDisconnect(BLEServer* s) { deviceConnected = false; tracking = false; Serial.println("BLE disconnected"); }
};

class ControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) {
    String cmd = c->getValue().c_str();
    Serial.printf("Command: %s\n", cmd.c_str());

    if (cmd == "START") {
      tracking = true;
      repCount = 0;
      phase = IDLE;
      Serial.println("Tracking started");
    } else if (cmd == "STOP") {
      tracking = false;
      Serial.println("Tracking stopped");
    } else if (cmd == "RESET") {
      repCount = 0;
      phase = IDLE;
      Serial.println("Rep counter reset");
    } else if (cmd == "CALIBRATE") {
      calibrate();
    }
  }
};

void calibrate() {
  Serial.println("Calibrating... keep the bar still for 5 seconds.");
  float sum = 0;
  int samples = 0;

  unsigned long start = millis();
  while (millis() - start < 5000) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    float mag = sqrt(a.acceleration.x * a.acceleration.x +
                     a.acceleration.y * a.acceleration.y +
                     a.acceleration.z * a.acceleration.z);
    sum += mag;
    samples++;
    delay(5);
  }

  gravityOffset = sum / samples;
  calibrated = true;
  Serial.printf("Calibrated. Gravity offset: %.3f m/s²\n", gravityOffset);
}

void publishRep(float mcv, float peak, float rom, float duration) {
  repCount++;

  JsonDocument doc;
  doc["rep"] = repCount;
  doc["mcv"] = round(mcv * 1000) / 1000.0;
  doc["peakVelocity"] = round(peak * 1000) / 1000.0;
  doc["rom"] = round(rom * 1000) / 1000.0;
  doc["duration"] = round(duration * 100) / 100.0;

  String json;
  serializeJson(doc, json);

  repChar->setValue(json.c_str());
  repChar->notify();

  Serial.printf("Rep %d: MCV=%.3f m/s, Peak=%.3f m/s, ROM=%.3fm, Dur=%.2fs\n",
                repCount, mcv, peak, rom, duration);
}

void setup() {
  Serial.begin(115200);

  // Init MPU6050
  if (!mpu.begin()) {
    Serial.println("MPU6050 not found! Check wiring.");
    while (1) delay(1000);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_44_HZ);
  Serial.println("MPU6050 ready.");

  // Init BLE
  BLEDevice::init("Baseline Velocity");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(SERVICE_UUID);

  repChar = service->createCharacteristic(
    REP_DATA_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  repChar->addDescriptor(new BLE2902());

  controlChar = service->createCharacteristic(
    CONTROL_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  controlChar->setCallbacks(new ControlCallbacks());

  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();

  Serial.println("BLE advertising as 'Baseline Velocity'. Waiting for connection...");

  // Auto-calibrate on startup
  Serial.println("Auto-calibrating on startup...");
  delay(2000); // Give user time to set bar down
  calibrate();
}

void loop() {
  if (!deviceConnected || !tracking || !calibrated) {
    delay(100);
    return;
  }

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  unsigned long now = micros();
  float dt = (now - lastSampleTime) / 1000000.0; // Convert to seconds
  lastSampleTime = now;

  if (dt > 0.1 || dt <= 0) {
    // Bad dt (first sample or overflow), skip
    return;
  }

  // Compute vertical acceleration (subtract gravity)
  float accelMag = sqrt(a.acceleration.x * a.acceleration.x +
                        a.acceleration.y * a.acceleration.y +
                        a.acceleration.z * a.acceleration.z);
  float verticalAccel = accelMag - gravityOffset;

  switch (phase) {
    case IDLE:
      if (verticalAccel > ACCEL_THRESHOLD) {
        phase = CONCENTRIC;
        velocity = 0;
        displacement = 0;
        peakVelocity = 0;
        repStartTime = millis();
      }
      break;

    case CONCENTRIC:
      velocity += verticalAccel * dt;
      if (velocity > peakVelocity) peakVelocity = velocity;
      displacement += velocity * dt;

      if (velocity < VELOCITY_THRESHOLD) {
        float duration = (millis() - repStartTime) / 1000.0;
        if (duration > MIN_REP_DURATION && displacement > 0.05) {
          float mcv = displacement / duration;
          publishRep(mcv, peakVelocity, displacement, duration);
          phase = LOCKOUT;
        } else {
          // Too short / too little movement — false positive
          phase = IDLE;
        }
      }
      break;

    case LOCKOUT:
      if (verticalAccel < -ACCEL_THRESHOLD) {
        phase = ECCENTRIC;
      }
      break;

    case ECCENTRIC:
      if (abs(verticalAccel) < ACCEL_THRESHOLD) {
        velocity = 0; // Reset drift
        phase = IDLE;
      }
      break;
  }

  delay(5); // ~200 Hz sample rate
}
```

### Step 5: Test it on the bench

Before attaching it to a barbell:

1. Upload the code and open Serial Monitor
2. You should see "BLE advertising as 'Baseline Velocity'" and the calibration output
3. Pick up the breadboard and move it up and down like a barbell rep (seriously — this is how you test)
4. You should see rep data printing in the serial monitor
5. If no reps detected, try more deliberate up-down movements — the thresholds need clear acceleration followed by deceleration

### Step 6: Connect the battery (for wireless use)

**⚠️ Be careful with LiPo batteries.** They're safe if handled correctly, but:
- Never short the red and black wires together
- Never puncture or bend the battery
- Don't leave it charging unattended overnight (until you trust the setup)

**Wiring:**
1. The TP4056 charger module has 4 connections: USB-C input, BAT+, BAT−, OUT+, OUT−
2. Connect the LiPo battery's JST plug to the BAT+ and BAT− pads on the TP4056
3. Connect TP4056 OUT+ to the ESP32's **VIN** (or 5V) pin
4. Connect TP4056 OUT− to ESP32's **GND**

```
                  TP4056 Charger
                 ┌──────────────┐
USB-C power ────→│ USB-C IN     │
                 │              │
                 │ BAT+  BAT−  │←─── LiPo battery (JST plug)
                 │              │
                 │ OUT+  OUT−  │
                 └──┬──────┬───┘
                    │      │
                    ↓      ↓
                ESP32 VIN  ESP32 GND
```

Now the ESP32 runs on battery. The TP4056 charges the battery when you plug in USB-C.

### Step 7: Mount it on the barbell

For now, just rubber-band or tape the breadboard to the barbell sleeve to test. A real mount comes later:

**Quick-and-dirty mount:**
- Wrap the breadboard in a small ziplock bag (sweat protection)
- Rubber-band it to the inside of the barbell sleeve
- Make sure the MPU6050 chip faces vertically (it'll calibrate regardless, but this helps)

**Better mount (later):**
- 3D print a clip that snaps onto the 50mm Olympic sleeve
- Or buy a cheap GoPro mount clip and Velcro the board inside
- Search Printables.com for "barbell sensor mount" for free STL files

### Step 8: Connect from Baseline

This step is **software** — you'll tell Claude to implement this in a future coding session:

> Read docs/arduino-build-guide.md section 5 (Web Bluetooth). Implement BLE connection in Body Mode:
> - Add a "Connect Sensor" button to the workout logger
> - Use Web Bluetooth API to scan for "Baseline Velocity"
> - Display real-time rep velocity after each rep
> - Store velocity data in WorkoutSet.velocityMean
> - Show velocity trend per set (is the bar slowing down?)

---

## Troubleshooting

### "BME280 not found" / "MPU6050 not found"

The sensor isn't communicating. Check in order:
1. **Power:** Is VCC connected to 3V3 (not 5V for these sensors)?
2. **Ground:** Is GND connected?
3. **SDA/SCL:** Are they on GPIO 21 and GPIO 22? Not swapped?
4. **Seating:** Push the sensor board more firmly into the breadboard
5. **Wires:** Tug each jumper wire gently — if it comes out easily, it wasn't connected

### "WiFi connect failed"

1. Your SSID is case-sensitive — "MyWifi" ≠ "mywifi"
2. ESP32 only supports 2.4 GHz WiFi, NOT 5 GHz. If your router broadcasts both, make sure you're using the 2.4 GHz name.
3. Some mesh routers (like Google Wifi, Eero) can cause issues. Try setting the ESP32 close to the router for the first test.

### "POST failed" / no data in Baseline

1. Make sure your Baseline app is running (`npm run dev`)
2. The URL must include your laptop's local IP (not `localhost`) — the ESP32 can't resolve `localhost`. Find your IP: Mac → System Preferences → Network. Windows → `ipconfig` in Command Prompt.
3. Check that `SENSOR_API_KEY` in your `.env` matches the `API_KEY` in the Arduino code
4. Open the Baseline serial monitor and check the HTTP response code. 401 = wrong API key. 404 = wrong URL.

### No rep detection on IMU

1. The movement needs to be deliberate — slow, controlled reps work best
2. If the bar barely moves (like a partial rep), it might not cross the acceleration threshold
3. Try adjusting `ACCEL_THRESHOLD` down to 0.3 if your movements are gentle
4. Make sure it calibrated successfully (check serial monitor for "Calibrated. Gravity offset: ~9.8")

### Battery doesn't charge / ESP32 doesn't power on

1. TP4056 has a tiny LED: red = charging, blue/green = full. If no light, the USB cable might be power-only (no data). Try a different cable.
2. Check OUT+ goes to VIN (not 3V3 — the charger outputs ~4.2V which VIN can regulate down)
3. Make sure BAT+ and BAT− aren't swapped on the LiPo

---

## Summary: What to order now

**One Amazon cart, ~$45–55:**

1. Breadboard 830-point, 2-pack — ~$8
2. Jumper wire kit (M-M, M-F, F-F, 120 pieces) — ~$7
3. Resistor assortment kit (1/4 watt, 30 values) — ~$7
4. ESP32-S3 DevKit (or ESP32-WROOM) — ~$10
5. MPU6050 GY-521 breakout — ~$4
6. 3.7V LiPo 500mAh with JST connector — ~$8
7. TP4056 USB-C charger module — ~$4
8. Micro-USB cables 2-pack (if you don't have any) — ~$6

**Build order:**
1. Environment sensor first (easier, parts already here)
2. IMU velocity tracker second (once you're comfortable with breadboarding)

**Time estimate:**
- Environment sensor: 1–2 hours for a first-timer (most of that is installing Arduino IDE and debugging WiFi)
- IMU velocity tracker: 2–3 hours (simpler wiring, but BLE testing takes patience)
