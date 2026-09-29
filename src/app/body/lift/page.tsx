import { redirect } from "next/navigation";
import { getIntakeStatus } from "@/lib/intake";
import BodyPage from "@/app/body/page";

export const dynamic = "force-dynamic";

/** Hybrid (runs + lifts): the Lift tab — the strength body on its own page. */
export default async function LiftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { gates } = await getIntakeStatus();
  if (!gates.hybrid || gates.strengthFirst) redirect("/body");
  return BodyPage({ searchParams: searchParams.then((p) => ({ ...p, __view: "lift" })) });
}
