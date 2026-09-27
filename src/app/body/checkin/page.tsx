import { redirect } from "next/navigation";
import { getIntakeStatus } from "@/lib/intake";
import { lifterCheckinData } from "@/lib/strength/checkin";
import { CheckinScreen } from "@/components/strength/checkin-screen";
import "@/app/strength.css";

export const dynamic = "force-dynamic";

/** /body/checkin?mode=morning|evening — lifter check-in (strength mode, screen 4). */
export default async function CheckinPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { needsOnboarding } = await getIntakeStatus();
  if (needsOnboarding) redirect("/onboarding");
  const params = await searchParams;
  const mode = params.mode === "morning" ? "morning" : "evening";
  const data = await lifterCheckinData();
  return <CheckinScreen data={data} mode={mode} />;
}
