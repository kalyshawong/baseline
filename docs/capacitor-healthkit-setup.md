# Capacitor + HealthKit Setup — Baseline iOS Shell

**Status:** Step 1 of `roadmap-2026-08.md`
**Goal:** Replace Health Auto Export with first-party background HealthKit sync.
**What's already done (repo):** Capacitor 8 installed, `capacitor.config.ts` pointing
at production, native Swift module written below, server endpoint `/api/healthkit-sync`
already accepts the payload this module sends.

The native pieces require Xcode on the Mac, so they can't be automated from a sandbox.
Follow this top to bottom — it's ~1 hour of setup the first time.

---

## 0. Prerequisites (one-time)

1. **Apple Developer Program** — enroll at https://developer.apple.com/programs/
   ($99/yr, takes minutes–48h to activate). Required for HealthKit entitlement +
   TestFlight. Free accounts can run on your own device for 7-day installs, so you
   can start before enrollment finishes.
2. **Xcode** — install from the Mac App Store (large download; start it early).
3. **CocoaPods** — `sudo gem install cocoapods` (or `brew install cocoapods`).

---

## 1. Generate the iOS project

```bash
cd ~/projects/baseline
npx cap add ios
npx cap open ios     # opens Xcode
```

In Xcode, select the **App** target →

- **Signing & Capabilities** tab:
  - Set your Team (your Apple ID / dev account)
  - **+ Capability → HealthKit** (check "Background Delivery")
  - **+ Capability → Background Modes** → check **Background fetch** and
    **Background processing**
- **Info** tab — add these keys (HealthKit access dialogs require them):
  - `NSHealthShareUsageDescription` = "Baseline reads your workouts, heart rate,
    activity, and cycle data to compute your daily readiness."
  - `NSHealthUpdateUsageDescription` = "Baseline does not write to Health." (still
    required by some SDK paths; harmless)

---

## 2. Add the native module

Create these two files in Xcode under `App/App/` (File → New → Swift File; when asked
about an Objective-C bridging header, accept):

### `HealthKitSyncPlugin.swift`

```swift
import Foundation
import Capacitor
import HealthKit

/**
 * Baseline HealthKit sync.
 *
 * - requestAuthorization(): shows the Health permission sheet.
 * - startBackgroundSync(serverUrl, apiKey): registers HKObserverQuery +
 *   enableBackgroundDelivery for each type; observers fire on new data
 *   (even with the app backgrounded) and POST to /api/healthkit-sync in
 *   the same envelope Health Auto Export used, so the server needs NO changes.
 * - syncNow(): manual full push (used by the in-app Sync button when native).
 *
 * Anchors (HKQueryAnchor) are persisted per-type in UserDefaults so each
 * sync only sends NEW samples.
 */
@objc(HealthKitSyncPlugin)
public class HealthKitSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitSyncPlugin"
    public let jsName = "HealthKitSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBackgroundSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncNow", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    // HealthKit type → HAE metric name (matches /api/healthkit-sync switch)
    private var quantityTypes: [(HKQuantityTypeIdentifier, String, HKUnit)] {
        [
            (.heartRate, "heart_rate", HKUnit.count().unitDivided(by: .minute())),
            (.restingHeartRate, "resting_heart_rate", HKUnit.count().unitDivided(by: .minute())),
            (.stepCount, "step_count", .count()),
            (.activeEnergyBurned, "active_energy", .kilocalorie()),
            (.bodyMass, "weight_body_mass", .gramUnit(with: .kilo)),
            (.bodyFatPercentage, "body_fat_percentage", .percent()),
            (.distanceWalkingRunning, "walking_running_distance", .meterUnit(with: .kilo)),
            (.respiratoryRate, "respiratory_rate", HKUnit.count().unitDivided(by: .minute())),
            (.vo2Max, "vo2_max", HKUnit(from: "ml/kg*min")),
            (.runningSpeed, "running_speed", HKUnit(from: "km/hr")),
            (.runningPower, "running_power", .watt()),
            (.runningGroundContactTime, "ground_contact_time", .secondUnit(with: .milli)),
            (.runningVerticalOscillation, "vertical_oscillation", .meterUnit(with: .centi)),
            (.runningStrideLength, "running_stride_length", .meter()),
            (.heartRateRecoveryOneMinute, "cardio_recovery", HKUnit.count().unitDivided(by: .minute())),
        ]
    }

    private func allReadTypes() -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        for (id, _, _) in quantityTypes {
            if let t = HKObjectType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        types.insert(HKObjectType.workoutType())
        if let flow = HKObjectType.categoryType(forIdentifier: .menstrualFlow) { types.insert(flow) }
        return types
    }

    // MARK: - JS API

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available on this device"); return
        }
        store.requestAuthorization(toShare: nil, read: allReadTypes()) { ok, err in
            if let err = err { call.reject(err.localizedDescription) } else { call.resolve(["granted": ok]) }
        }
    }

    @objc func startBackgroundSync(_ call: CAPPluginCall) {
        guard let serverUrl = call.getString("serverUrl"),
              let apiKey = call.getString("apiKey") else {
            call.reject("serverUrl and apiKey required"); return
        }
        UserDefaults.standard.set(serverUrl, forKey: "bl_server")
        UserDefaults.standard.set(apiKey, forKey: "bl_key")

        for (id, _, _) in quantityTypes {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
            registerObserver(for: type)
        }
        registerObserver(for: HKObjectType.workoutType())
        if let flow = HKObjectType.categoryType(forIdentifier: .menstrualFlow) {
            registerObserver(for: flow)
        }
        call.resolve(["started": true])
    }

    @objc func syncNow(_ call: CAPPluginCall) {
        Task {
            do {
                let n = try await self.collectAndPost()
                call.resolve(["posted": n])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: - Observers + background delivery

    private func registerObserver(for type: HKSampleType) {
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, _ in
            Task {
                _ = try? await self?.collectAndPost()
                completion() // MUST be called or iOS throttles future deliveries
            }
        }
        store.execute(query)
        store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
    }

    // MARK: - Collect new samples since anchors → POST in HAE envelope

    private func collectAndPost() async throws -> Int {
        guard let server = UserDefaults.standard.string(forKey: "bl_server"),
              let key = UserDefaults.standard.string(forKey: "bl_key") else { return 0 }

        var metrics: [[String: Any]] = []
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd HH:mm:ss Z"

        for (id, haeName, unit) in quantityTypes {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
            let samples = try await newSamples(for: type)
            guard !samples.isEmpty else { continue }
            let data: [[String: Any]] = samples.compactMap { s in
                guard let q = s as? HKQuantitySample else { return nil }
                return ["date": df.string(from: q.startDate), "qty": q.quantity.doubleValue(for: unit)]
            }
            if !data.isEmpty { metrics.append(["name": haeName, "data": data]) }
        }

        // Workouts
        var workouts: [[String: Any]] = []
        for case let w as HKWorkout in try await newSamples(for: HKObjectType.workoutType()) {
            workouts.append([
                "id": w.uuid.uuidString,
                "name": w.workoutActivityType.baselineName,
                "start": df.string(from: w.startDate),
                "end": df.string(from: w.endDate),
                "duration": w.duration,
                "activeEnergyBurned": ["qty": w.statistics(for: HKQuantityType(.activeEnergyBurned))?
                    .sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0, "units": "kcal"],
                "distance": ["qty": (w.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0), "units": "km"],
            ])
        }

        // Cycle tracking
        var cycle: [[String: Any]] = []
        if let flowType = HKObjectType.categoryType(forIdentifier: .menstrualFlow) {
            for case let c as HKCategorySample in try await newSamples(for: flowType) {
                let value: String
                switch HKCategoryValueVaginalBleeding(rawValue: c.value) {
                case .light: value = "Light"
                case .medium: value = "Medium"
                case .heavy: value = "Heavy"
                default: value = "Unspecified"
                }
                cycle.append(["name": "Menstrual Flow", "value": value,
                              "start": df.string(from: c.startDate), "end": df.string(from: c.endDate)])
            }
        }

        let total = metrics.count + workouts.count + cycle.count
        guard total > 0 else { return 0 }

        let envelope: [String: Any] = ["data": ["metrics": metrics, "workouts": workouts, "cycleTracking": cycle]]
        var req = URLRequest(url: URL(string: "\(server)/api/healthkit-sync")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: envelope)
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
            throw NSError(domain: "bl", code: 1, userInfo: [NSLocalizedDescriptionKey: "sync POST failed"])
        }
        commitAnchors() // only advance anchors after a successful POST
        return total
    }

    // MARK: - Anchored queries (per-type incremental fetch)

    private var pendingAnchors: [String: HKQueryAnchor] = [:]

    private func newSamples(for type: HKSampleType) async throws -> [HKSample] {
        let anchorKey = "bl_anchor_\(type.identifier)"
        var anchor: HKQueryAnchor? = nil
        if let data = UserDefaults.standard.data(forKey: anchorKey) {
            anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
        }
        return try await withCheckedThrowingContinuation { cont in
            let q = HKAnchoredObjectQuery(type: type, predicate: nil, anchor: anchor,
                                          limit: HKObjectQueryNoLimit) { [weak self] _, samples, _, newAnchor, err in
                if let err = err { cont.resume(throwing: err); return }
                if let newAnchor = newAnchor { self?.pendingAnchors[anchorKey] = newAnchor }
                cont.resume(returning: samples ?? [])
            }
            store.execute(q)
        }
    }

    private func commitAnchors() {
        for (k, a) in pendingAnchors {
            if let data = try? NSKeyedArchiver.archivedData(withRootObject: a, requiringSecureCoding: true) {
                UserDefaults.standard.set(data, forKey: k)
            }
        }
        pendingAnchors.removeAll()
    }
}

extension HKWorkoutActivityType {
    var baselineName: String {
        switch self {
        case .running: return "Running"
        case .walking: return "Walking"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "Strength Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .cycling: return "Cycling"
        case .rowing: return "Rowing"
        case .swimming: return "Swimming"
        case .yoga: return "Yoga"
        case .hiking: return "Hiking"
        default: return "Workout"
        }
    }
}
```

### Register the plugin

Capacitor 8 auto-registers `CAPBridgedPlugin` classes in Swift Package builds. For
CocoaPods builds, add to `App/App/MyViewController.swift` or create
`App/App/AppDelegate+Plugins.swift` — if the plugin doesn't appear in JS, add a
`capacitor.config.ts` `packageClassList: ["HealthKitSyncPlugin"]` entry under `ios`.

---

## 3. Wire it from the web app

Add once to the app shell (e.g. a small client component mounted in `layout.tsx`):

```ts
import { Capacitor, registerPlugin } from "@capacitor/core";

const HealthKitSync = registerPlugin<{
  requestAuthorization(): Promise<{ granted: boolean }>;
  startBackgroundSync(o: { serverUrl: string; apiKey: string }): Promise<{ started: boolean }>;
  syncNow(): Promise<{ posted: number }>;
}>("HealthKitSync");

export async function initNativeHealth() {
  if (Capacitor.getPlatform() !== "ios") return; // web/PWA: no-op
  await HealthKitSync.requestAuthorization();
  await HealthKitSync.startBackgroundSync({
    serverUrl: window.location.origin,
    apiKey: process.env.NEXT_PUBLIC_HEALTHKIT_SYNC_KEY!, // see note below
  });
}
```

**Key note:** `/api/healthkit-sync` authorizes with `HEALTHKIT_SYNC_KEY`. For the solo
phase, exposing it as `NEXT_PUBLIC_` inside the passcode-gated app is acceptable. When
real auth lands (roadmap step 2), replace the static key with a per-user session token
— the plugin just POSTs whatever key it's given.

---

## 4. Run it

```bash
npx cap sync ios   # after any config change
npx cap open ios   # build & run from Xcode onto YOUR IPHONE (not simulator —
                   # background delivery only works on a real device)
```

First launch: Health permission sheet → Allow All. Lift weights, close the app,
and watch `/api/healthkit-sync` rows appear on their own.

## 5. Gotchas

- **Background delivery is best-effort.** iOS batches deliveries (heart rate ≈ hourly
  at best, most types on data-write). That's fine — Baseline is a daily-cadence app.
- **Observer completion handler must always be called** (the code does) or iOS
  throttles the app's deliveries aggressively.
- **Simulator lies.** Test on the real phone.
- **Vercel Deployment Protection** must be OFF for this domain (or the native shell
  and the sync POSTs will hit Vercel's login wall — server-to-server requests can't
  pass it). App access stays protected by SITE_PASSWORD / future auth.
- Health Auto Export can be uninstalled once this works — same endpoint, same data.
