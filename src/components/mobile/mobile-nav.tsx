import { cache } from "react";
import { getIntakeStatus } from "@/lib/intake";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { Nav } from "@/components/nav";

/** Hybrid users (runs + lifts) get Run and Lift in place of Body — both navs, one lookup per request. */
export const isHybridNav = cache(async (): Promise<boolean> => {
  try {
    const { gates } = await getIntakeStatus();
    return gates.hybrid && !gates.strengthFirst;
  } catch {
    return false; // signed out / no DB — default tabs
  }
});

export async function MobileNav() {
  return <MobileTabBar hybrid={await isHybridNav()} />;
}

export async function DesktopNav() {
  return <Nav hybrid={await isHybridNav()} />;
}
