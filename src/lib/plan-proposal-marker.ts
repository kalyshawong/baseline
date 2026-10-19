/** Client-safe: pulls plan-card markers out of a coach message. */
export interface ClientPlanProposal {
  goalId: string;
  goalTitle: string;
  summary: string;
  raw: Record<string, unknown>;
  preview: {
    kcal: number | null; proteinG: number | null; fatG: number | null; carbsG: number | null;
    waterRestL: number | null; waterTrainingL: number | null;
    deadline: string | null; projectedDate: string | null; onTime: boolean | null;
    atDeadline: { weightKg: number; bodyFatPct: number | null } | null;
    exercisePerDayKcal: number | null;
    menu: { label: string; kcal: number; protein: number; source: string }[];
    warnings: string[];
  };
}

const MARK = /\n*<!--baseline-plan:([A-Za-z0-9+/=]+)-->/g;

function decode(b64: string): ClientPlanProposal | null {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as ClientPlanProposal;
  } catch {
    return null;
  }
}

export function splitPlanProposals(content: string): { text: string; proposals: ClientPlanProposal[] } {
  const proposals: ClientPlanProposal[] = [];
  const text = content.replace(MARK, (_m, b64: string) => {
    const p = decode(b64);
    if (p) proposals.push(p);
    return "";
  });
  return { text: text.trimEnd(), proposals };
}
