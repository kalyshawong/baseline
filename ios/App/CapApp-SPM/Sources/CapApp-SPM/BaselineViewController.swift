import UIKit
import Capacitor

/**
 * Bridge view controller subclass whose only job is deterministic plugin
 * registration: registerPluginInstance doesn't depend on packageClassList /
 * NSClassFromString resolution, so the HealthKit plugin is always available
 * to the web layer. Referenced from Main.storyboard (customModule CapApp_SPM).
 */
@objc(BaselineViewController)
open class BaselineViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitSyncPlugin())
    }
}
