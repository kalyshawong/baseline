# Arduino IMU Build Guide — Bar Velocity Tracker

**Last Updated:** 2026-04-03
**Purpose:** Hardware specification, wiring, firmware, and BLE protocol for the Baseline barbell velocity sensor.

---

## 1. Parts List

### Option A: ESP32 + External IMU (Recommended for Baseline)

| Part | Model | Purpose | Approx Price | Source |
|---|---|---|---|---|
| Microcontroller | ESP32-S3 DevKit or ESP32-WROOM-32 | BLE + WiFi + processing | $9–15 | [Amazon](https://amazon.com), [Adafruit](https://adafruit.com) |
| IMU | MPU6050 (GY-521 breakout) | 6-axis accelerometer + gyroscope | $3–5 | [Amazon](https://amazon.com), [AliExpress](https://aliexpress.com) |
| Battery | 3.7V LiPo 500mAh (JST connector) | Wireless operation during lifts | $7–10 | [Adafruit](https://adafruit.com), Amazon |
| Charger | TP4056 USB-C LiPo charger module | Recharge battery via USB-C | $2–4 | Amazon, AliExpress |
| Voltage regulator | AMS1117-3.3V or built into ESP32 | Regulate LiPo to 3.3V | $1–2 (if needed) | Amazon |
| Enclosure | 3D printed barbell clip mount | Attach to barbell sleeve | $0–5 | DIY or [Printables](https://printables.com) |
| Misc | Jumper wires, proto board, solder | Assembly | $5–10 | Amazon |

**Total: ~$30–50**

### Option B: Arduino Nano 33 BLE Sense (All-in-one)

| Part | Model | Purpose | Approx Price | Source |
|---|---|---|---|---|
| Board | Arduino Nano 33 BLE Sense Rev2 | BLE + LSM6DSO 6-axis IMU built in | $35–40 | [Arduino Store](https://store.arduino.cc), Amazon |
| Battery | 3.7V LiPo 500mAh | Wireless operation | $7–10 | Adafruit, Amazon |
| Charger | TP4056 USB-C | Recharge | $2–4 | Amazon |
| Enclosure | 3D printed | Mount | $0–5 | DIY |

**Total: ~$45–60**

**Recommendation:** Option A (ESP32 + MPU6050) is cheaper and more flexible. ESP32 has better BLE range and dual-core processing for real-time velocity computation. Option B is simpler (fewer wires) but more expensive and the Arduino ecosystem has weaker BLE library support.

### Already Ordered (Environment Sensor — Separate Build)

These parts are for the bedroom environment sensor, NOT the barbell velocity tracker. They share the ESP32 platform but are separate devices:

- ESP32-WROOM DevKit — $8.99 (Amazon)
- BME280 — $8.99
- PMS5003 — $20.99
- MAX4466 — $8.39

---

## 2. Wiring Diagram

### ESP32 + MPU6050

```
ESP32-S3 DevKit              MPU6050 (GY-521)
┌──────────────┐             ┌──────────────┐
│              │             │              │
│     3V3  ●───────────────●── VCC          │
│     GND  ●───────────────●── GND          │
│     GPIO21 (SDA)  ●──────●── SDA          │
│     GPIO22 (SCL)  ●──────●── SCL          │
│              │             │  INT  ●──────── GPIO4 (optional: interrupt for data-ready)
│              │             │  AD0  ●──────── GND (sets I2C address to 0x68)
│              │             └──────────────┘
│              │
│     BAT+ ●──────── LiPo 3.7V (+)
│     GND  ●──────── LiPo 3.7V (−)
│              │
└──────────────┘

TP4056 Charger Module:
  BAT+ → LiPo (+)
  BAT− → LiPo (−)
  USB-C → External power for charging
```

**Wiring notes:**

- MPU6050 runs on 3.3V — connect to ESP32's 3V3 output, NOT 5V (the GY-521 breakout has an onboard regulator, but 3.3V direct is cleaner).
- I2C pull-up resistors (4.7kΩ on SDA and SCL to 3.3V) are built into the GY-521 breakout. No external resistors needed.
- AD0 pin grounded sets the I2C address to 0x68 (default). Leave floating or connect to 3.3V for 0x69 if using two MPU6050s.
- The INT pin is optional — it signals when new accelerometer data is available. Useful for high-frequency sampling but not required for 200 Hz polling.

### Power Considerations

- ESP32-S3 draws ~80–240mA depending on BLE activity
- MPU6050 draws ~3.6mA
- Total: ~85–250mA
- 500mAh LiPo at 150mA average ≈ 3.3 hours of continuous use
- That's enough for 2–3 training sessions per charge
- For longer battery life, use a 1000mAh LiPo (same form factor, slightly heavier)

---

## 3. Firmware

### 3.1 Platform

**Arduino IDE** with ESP32 board support:
- Board Manager URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- Board: "ESP32S3 Dev Module" (or "ESP32 Dev Module" for WROOM-32)
- Partition scheme: "Default 4MB with spiffs"

### 3.2 Libraries

```
Adafruit_MPU6050        — MPU6050 driver
Adafruit_Sensor         — Unified sensor abstraction
Wire                    — I2C communication
BLEDevice, BLEServer    — ESP32 BLE stack (built in)
ArduinoJson             — JSON serialization for BLE payloads
```

### 3.3 Firmware Architecture

```
setup()
  ├── Init I2C + MPU6050 (200 Hz sample rate, ±4g range, ±500°/s gyro)
  ├── Init BLE server + GATT service + characteristic
  └── Calibrate IMU (10 seconds stationary — capture gravity offset)

loop()
  ├── Read accelerometer + gyroscope at 200 Hz
  ├── Apply Kalman filter for sensor fusion
  ├── Detect rep phases:
  │   ├── IDLE: bar stationary (acceleration ≈ gravity only)
  │   ├── CONCENTRIC: upward acceleration detected (a_z > threshold)
  │   ├── LOCKOUT: velocity returns to ~0 at top of movement
  │   └── ECCENTRIC: downward acceleration (a_z < -threshold)
  ├── During CONCENTRIC:
  │   ├── Integrate acceleration to compute velocity: v += a * dt
  │   ├── Track peak velocity
  │   ├── Track displacement (ROM): d += v * dt
  │   └── Track duration
  ├── On LOCKOUT (rep complete):
  │   ├── Compute MCV = displacement / duration
  │   ├── Increment rep counter
  │   ├── Build JSON payload
  │   ├── Notify BLE characteristic
  │   └── Reset integrators for next rep
  └── Idle detection: if no movement for 30s, enter light sleep
```

### 3.4 IMU Configuration

```cpp
// MPU6050 setup
mpu.setAccelerometerRange(MPU6050_RANGE_4_G);   // ±4g covers heavy squats
mpu.setGyroRange(MPU6050_RANGE_500_DEG);        // ±500°/s
mpu.setFilterBandwidth(MPU6050_BAND_44_HZ);     // Low-pass filter noise
```

**Why ±4g?** Heavy compound lifts generate ~2–3g peak acceleration during the concentric phase. ±4g provides headroom without sacrificing resolution. For Olympic lifts (clean, snatch), consider ±8g — but ±4g covers all standard strength training.

### 3.5 Kalman Filter

The complementary/Kalman filter fuses accelerometer and gyroscope data to reduce integration drift:

```cpp
// Simplified complementary filter
float alpha = 0.98; // Weight toward gyro (less drift than pure accel integration)
float angle = alpha * (angle + gyroRate * dt) + (1 - alpha) * accelAngle;

// For vertical velocity:
// 1. Rotate accelerometer data to earth frame using orientation estimate
// 2. Subtract gravity (9.81 m/s²)
// 3. Integrate remaining acceleration to get velocity
// 4. Reset velocity to 0 at rep boundaries (drift correction)
```

**Drift management:** The main challenge with IMU-based velocity tracking is integration drift — small accelerometer errors compound over time. Mitigation:
- Reset velocity to 0 at start and end of each rep (when bar is stationary)
- Use gyroscope to correct accelerometer orientation
- Keep concentric phase short (<3 seconds) — drift is minimal over short intervals
- Calibrate gravity offset at session start (10 seconds stationary)

### 3.6 Rep Detection State Machine

```cpp
enum RepPhase { IDLE, CONCENTRIC, LOCKOUT, ECCENTRIC };

RepPhase currentPhase = IDLE;
float velocityThreshold = 0.05;       // m/s — minimum to detect movement
float accelerationThreshold = 0.5;    // m/s² above gravity to detect concentric start

void detectPhase(float verticalAccel, float verticalVelocity) {
  switch (currentPhase) {
    case IDLE:
      if (verticalAccel > accelerationThreshold) {
        currentPhase = CONCENTRIC;
        resetIntegrators();
      }
      break;

    case CONCENTRIC:
      // Accumulate velocity and displacement
      if (verticalVelocity < velocityThreshold && repDuration > 0.3) {
        currentPhase = LOCKOUT;
        publishRep();
      }
      break;

    case LOCKOUT:
      if (verticalAccel < -accelerationThreshold) {
        currentPhase = ECCENTRIC;
      }
      break;

    case ECCENTRIC:
      if (abs(verticalVelocity) < velocityThreshold && abs(verticalAccel) < accelerationThreshold) {
        currentPhase = IDLE;
        repCount++;
      }
      break;
  }
}
```

---

## 4. BLE Data Format

### 4.1 GATT Service Structure

```
Service: Baseline Velocity Tracker
  UUID: "4241534C-494E-4500-0001-000000000000" (custom)

  Characteristics:

  1. Rep Data (Notify)
     UUID: "4241534C-494E-4500-0001-000000000001"
     Properties: Notify
     Format: JSON string (UTF-8)
     Payload: { rep, mcv, peakVelocity, rom, duration, timestamp }

  2. Session Control (Write)
     UUID: "4241534C-494E-4500-0001-000000000002"
     Properties: Write
     Commands: "START", "STOP", "RESET", "CALIBRATE"

  3. Battery Level (Read/Notify)
     UUID: "0x2A19" (standard Battery Level characteristic)
     Properties: Read, Notify
     Format: uint8 (0-100 percent)

  4. Device Info (Read)
     UUID: "4241534C-494E-4500-0001-000000000004"
     Properties: Read
     Format: JSON string
     Payload: { firmwareVersion, sensorType, sampleRate, calibrated }
```

### 4.2 Rep Data Payload

```json
{
  "rep": 3,
  "mcv": 0.52,
  "peakVelocity": 0.71,
  "rom": 0.65,
  "duration": 1.84,
  "timestamp": "2026-04-03T18:30:45.123Z"
}
```

| Field | Type | Unit | Range | Description |
|---|---|---|---|---|
| `rep` | uint8 | — | 1–255 | Rep number in current set |
| `mcv` | float32 | m/s | 0.05–2.0 | Mean concentric velocity |
| `peakVelocity` | float32 | m/s | 0.10–3.0 | Peak instantaneous velocity |
| `rom` | float32 | m | 0.1–1.5 | Vertical range of motion |
| `duration` | float32 | s | 0.3–5.0 | Concentric phase duration |
| `timestamp` | string | ISO 8601 | — | UTC timestamp at rep completion |

### 4.3 Session Control Commands

| Command | Action |
|---|---|
| `START` | Begin rep detection. Reset rep counter to 0. |
| `STOP` | Stop rep detection. Enter idle mode. |
| `RESET` | Reset rep counter without stopping detection. Use between sets. |
| `CALIBRATE` | Run 10-second gravity calibration. Must be stationary. |

### 4.4 Connection Flow

```
1. User opens Baseline Body Mode on phone/laptop
2. App scans for BLE devices advertising "Baseline Velocity"
3. User selects device → app connects
4. App sends "CALIBRATE" → sensor calibrates for 10s
5. App sends "START" → sensor begins rep detection
6. Each rep → sensor notifies Rep Data characteristic
7. App receives notification → displays velocity in real-time
8. Between sets → app sends "RESET" to reset rep counter
9. End of session → app sends "STOP"
10. App disconnects
```

---

## 5. Web Bluetooth Integration (Next.js)

The Baseline web app connects to the IMU via Web Bluetooth API:

```typescript
// src/lib/velocity-ble.ts

const VELOCITY_SERVICE_UUID = "4241534c-494e-4500-0001-000000000000";
const REP_DATA_UUID = "4241534c-494e-4500-0001-000000000001";
const SESSION_CONTROL_UUID = "4241534c-494e-4500-0001-000000000002";

export async function connectVelocitySensor(): Promise<BluetoothRemoteGATTCharacteristic> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [VELOCITY_SERVICE_UUID] }],
  });

  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(VELOCITY_SERVICE_UUID);
  const repChar = await service.getCharacteristic(REP_DATA_UUID);

  await repChar.startNotifications();
  repChar.addEventListener("characteristicvaluechanged", (event) => {
    const decoder = new TextDecoder();
    const json = decoder.decode((event.target as BluetoothRemoteGATTCharacteristic).value!.buffer);
    const repData = JSON.parse(json);
    // dispatch to UI: repData.mcv, repData.peakVelocity, etc.
  });

  return repChar;
}

export async function sendCommand(
  device: BluetoothDevice,
  command: "START" | "STOP" | "RESET" | "CALIBRATE"
): Promise<void> {
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(VELOCITY_SERVICE_UUID);
  const controlChar = await service.getCharacteristic(SESSION_CONTROL_UUID);
  const encoder = new TextEncoder();
  await controlChar.writeValue(encoder.encode(command));
}
```

**Browser support:** Web Bluetooth works in Chrome, Edge, and Opera on desktop and Android. Not supported in Safari/iOS — for iOS, a native app or Bleak (Python BLE) bridge would be needed.

---

## 6. Mounting

The sensor must be rigidly attached to the barbell to capture accurate acceleration data.

**Recommended mount: barbell sleeve clip**

- 3D print a clip that snaps onto the barbell sleeve (standard 50mm / 2" Olympic sleeve)
- The sensor sits inside the clip, oriented with Z-axis vertical
- Must be tight enough to not shift during heavy lifts
- Must be positioned at the center of the sleeve to minimize rotational artifacts

**Alternative: magnetic mount**

- Embed neodymium magnets in the enclosure
- Stick directly to the barbell shaft
- Advantage: quick on/off. Disadvantage: may shift under heavy vibration.

**Orientation calibration:**

The firmware's calibration step (10 seconds stationary) determines the gravity vector, which defines "vertical." This means the sensor can be mounted at any angle — the firmware mathematically rotates the reference frame to align with gravity.

---

## 7. Accuracy Expectations

Based on published validation studies of IMU-based velocity trackers:

| Metric | Expected Accuracy | Compared To |
|---|---|---|
| Mean concentric velocity | ±8–12% | GymAware (gold standard linear position transducer) |
| Peak velocity | ±10–15% | Higher error due to noise at peak values |
| Rep detection | >95% correct | False positives during eccentric or reracking |
| 1RM estimation | ±5–8 kg | From velocity-load profile with 10+ calibration points |

**Acceptable for:** Autoregulation (velocity loss thresholds), trend tracking (is velocity improving over weeks?), relative load estimation.

**Not reliable enough for:** Absolute 1RM testing (use actual lifts), publication-quality research, power output calculations.

**Improving accuracy over time:**
- More calibration data points per exercise → better velocity-load curve
- Firmware updates to tune Kalman filter parameters
- Per-user, per-exercise calibration (the app learns your movement patterns)

---

## References

- González-Badillo, J.J., & Sánchez-Medina, L. (2010). "Movement velocity as a measure of loading intensity." *IJSM*, 31(5), 347–352.
- Banyard, H.G., et al. (2019). "Effects of velocity loss thresholds on kinetic characteristics during back squat." *JSCR*.
- Sato, K., et al. (2021). "Valid and reliable barbell velocity estimation using an inertial measurement unit." *Sensors*, 21(7), 2505.
- OpenBarbell project. Hackaday: [https://hackaday.io/project/9363-openbarbell](https://hackaday.io/project/9363-openbarbell)
- ESP32 BLE documentation: [https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/bluetooth/](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/bluetooth/)
