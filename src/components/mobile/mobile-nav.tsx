import { getIntakeStatus } from "@/lib/intake";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";

/** Server wrapper: hybrid users (runs + lifts) get Run and Lift tabs instead of Body. */
export async function MobileNav() {
  let hybrid = false;
  try {
    const { gates } = await getIntakeStatus();
    hybrid = gates.hybrid && !gates.strengthFirst;
  } catch {
    /* signed out / no DB — default tabs */
  }
  return <MobileTabBar hybrid={hybrid} />;
}
