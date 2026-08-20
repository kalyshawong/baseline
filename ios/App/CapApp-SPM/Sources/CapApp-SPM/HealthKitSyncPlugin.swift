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
 * - syncNow(): manual full push.
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

    // HealthKit type → HAE metric name (matches /api/healthkit-sync switch).
    // Running-dynamics metrics are iOS 16+; guarded so the package's iOS 15
    // floor still compiles. On a modern iPhone all types are included.
    private var quantityTypes: [(HKQuantityTypeIdentifier, String, HKUnit)] {
        var types: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            (.heartRate, "heart_rate", HKUnit.count().unitDivided(by: .minute())),
            (.restingHeartRate, "resting_heart_rate", HKUnit.count().unitDivided(by: .minute())),
            (.stepCount, "step_count", .count()),
            (.activeEnergyBurned, "active_energy", .kilocalorie()),
            (.bodyMass, "weight_body_mass", .gramUnit(with: .kilo)),
            (.bodyFatPercentage, "body_fat_percentage", .percent()),
            (.distanceWalkingRunning, "walking_running_distance", .meterUnit(with: .kilo)),
            (.respiratoryRate, "respiratory_rate", HKUnit.count().unitDivided(by: .minute())),
            (.vo2Max, "vo2_max", HKUnit(from: "ml/kg*min")),
        ]
        if #available(iOS 16.0, *) {
            types.append(contentsOf: [
                (.runningSpeed, "running_speed", HKUnit(from: "km/hr")),
                (.runningPower, "running_power", .watt()),
                (.runningGroundContactTime, "ground_contact_time", .secondUnit(with: .milli)),
                (.runningVerticalOscillation, "vertical_oscillation", .meterUnit(with: .centi)),
                (.runningStrideLength, "running_stride_length", .meter()),
                (.heartRateRecoveryOneMinute, "cardio_recovery", HKUnit.count().unitDivided(by: .minute())),
            ])
        }
        return types
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
            // Diagnostic probe first, so it reports even if the POST fails:
            // workouts VISIBLE in the last 7 days, ignoring anchors. 0 =
            // permission/data problem; >0 = anchors already consumed them.
            let visible = (try? await self.probeWorkouts()) ?? -1
            do {
                let n = try await self.collectAndPost()
                call.resolve(["posted": n, "workoutsVisible7d": visible])
            } catch {
                call.resolve(["posted": 0, "workoutsVisible7d": visible,
                              "error": error.localizedDescription])
            }
        }
    }

    private func probeWorkouts() async throws -> Int {
        try await withCheckedThrowingContinuation { cont in
            let start = Calendar.current.date(byAdding: .day, value: -7, to: Date())
            let pred = HKQuery.predicateForSamples(withStart: start, end: nil)
            let q = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: pred,
                                  limit: 100, sortDescriptors: nil) { _, samples, err in
                if let err = err { cont.resume(throwing: err) } else { cont.resume(returning: samples?.count ?? 0) }
            }
            store.execute(q)
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

    // MARK: - Sync serialization
    //
    // Registering ~17 observers fires them all at once on startup; without a
    // gate that's ~17 concurrent POSTs stampeding the server (connection-pool
    // exhaustion, client timeouts). The gate allows ONE in-flight sync and
    // coalesces every request that arrives meanwhile into a single follow-up.
    private actor SyncGate {
        private var inFlight = false
        private var queued = false
        func begin() -> Bool {
            if inFlight { queued = true; return false }
            inFlight = true
            return true
        }
        func end() -> Bool {
            inFlight = false
            if queued { queued = false; return true }
            return false
        }
    }
    private let gate = SyncGate()

    private func collectAndPost() async throws -> Int {
        guard await gate.begin() else { return 0 } // coalesced into in-flight sync
        var total: Int
        do {
            total = try await performSync()
        } catch {
            _ = await gate.end()
            throw error
        }
        if await gate.end() {
            total += (try? await collectAndPost()) ?? 0 // one follow-up for coalesced requests
        }
        return total
    }

    // MARK: - Collect new samples since anchors → POST in HAE envelope

    private func performSync() async throws -> Int {
        guard let server = UserDefaults.standard.string(forKey: "bl_server"),
              let key = UserDefaults.standard.string(forKey: "bl_key") else { return 0 }

        let syncStart = Date() // watermark candidate; committed only on success
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
            let energyKcal: Double
            if #available(iOS 16.0, *) {
                energyKcal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?
                    .sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
            } else {
                energyKcal = w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0
            }
            workouts.append([
                "id": w.uuid.uuidString,
                "name": w.workoutActivityType.baselineName,
                "start": df.string(from: w.startDate),
                "end": df.string(from: w.endDate),
                "duration": w.duration,
                "activeEnergyBurned": ["qty": energyKcal, "units": "kcal"],
                "distance": [
                    "qty": (w.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0),
                    "units": "km",
                ],
            ])
        }

        // Cycle tracking
        var cycle: [[String: Any]] = []
        if let flowType = HKObjectType.categoryType(forIdentifier: .menstrualFlow) {
            for case let c as HKCategorySample in try await newSamples(for: flowType) {
                // Raw values are shared by HKCategoryValueMenstrualFlow (iOS 9+)
                // and its iOS 18 successor HKCategoryValueVaginalBleeding:
                // 1 unspecified, 2 light, 3 medium, 4 heavy, 5 none.
                let value: String
                switch c.value {
                case 2: value = "Light"
                case 3: value = "Medium"
                case 4: value = "Heavy"
                default: value = "Unspecified"
                }
                cycle.append([
                    "name": "Menstrual Flow", "value": value,
                    "start": df.string(from: c.startDate), "end": df.string(from: c.endDate),
                ])
            }
        }

        let total = metrics.count + workouts.count + cycle.count
        guard total > 0 else { return 0 }

        let envelope: [String: Any] = ["data": ["metrics": metrics, "workouts": workouts, "cycleTracking": cycle]]
        guard let url = URL(string: "\(server)/api/healthkit-sync") else {
            throw NSError(domain: "bl", code: 2, userInfo: [NSLocalizedDescriptionKey: "bad server url"])
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 180 // server can take minutes on big batches
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        // Label this post as the native pipeline. URLSession does NOT carry
        // the WebView's appendUserAgent token, so without this header the
        // server logs every native sync as "health-auto-export".
        req.setValue("native-app", forHTTPHeaderField: "X-Baseline-Client")
        req.httpBody = try JSONSerialization.data(withJSONObject: envelope)
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
            throw NSError(domain: "bl", code: 1, userInfo: [NSLocalizedDescriptionKey: "sync POST failed"])
        }
        commitWatermark(syncStart) // only advance the watermark after a successful POST
        return total
    }

    // MARK: - Timestamp-window incremental fetch
    //
    // HKQueryAnchor persistence proved unreliable across dev installs and
    // background wakes, causing full 7-day re-sends every sync (heavy POSTs
    // that time out). Instead: a plain watermark date in UserDefaults. Each
    // sync fetches samples since (watermark − 2h overlap); the watermark
    // advances only after a successful POST. Server upserts make the overlap
    // harmless. First sync: last 7 days.
    private var sinceDate: Date {
        let last = UserDefaults.standard.object(forKey: "bl_last_sync") as? Date
        let overlap = last?.addingTimeInterval(-2 * 3600)
        let floor = Calendar.current.date(byAdding: .day, value: -7, to: Date())!
        return max(overlap ?? floor, floor)
    }

    private func commitWatermark(_ d: Date) {
        UserDefaults.standard.set(d, forKey: "bl_last_sync")
    }

    private func newSamples(for type: HKSampleType) async throws -> [HKSample] {
        // strictStartDate: only samples that BEGIN in the window — otherwise
        // long-running samples (e.g. a years-old contraceptive record) match
        // every window and re-send ~1.5k cycle entries on every single sync.
        let predicate = HKQuery.predicateForSamples(withStart: sinceDate, end: nil,
                                                    options: .strictStartDate)
        return try await withCheckedThrowingContinuation { cont in
            // 4k cap per type keeps each POST light on the server's DB pool.
            let q = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: 4_000, sortDescriptors: nil) { _, samples, err in
                if let err = err { cont.resume(throwing: err) } else { cont.resume(returning: samples ?? []) }
            }
            store.execute(q)
        }
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
