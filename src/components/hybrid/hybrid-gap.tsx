"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d: string) => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** "Nothing logged Oct 3–9. Traveling or a break?" — one tap, asked once per gap. */
export function HybridGap({ start, end }: { start: string; end: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answer = async (a: "travel" | "break") => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/hybrid/gap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, answer: a }) });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setErr("Didn't save — try again");
      setBusy(false);
    }
  };
  const range = start === end ? fmt(start) : start.slice(0, 7) === end.slice(0, 7) ? `${fmt(start)}–${Number(end.slice(8, 10))}` : `${fmt(start)}–${fmt(end)}`;
  return (
    <section className="panel">
      <div className="ph"><span className="ov">Nothing logged {range}</span></div>
      <div className="st-in">
        <div className="b">
          <div className="l">Traveling or a break?</div>
          <div className="c">Traveling pauses your consistency count. A break counts those days as missed.</div>
          {err && <div className="c">{err}</div>}
        </div>
      </div>
      <div className="row2">
        <button type="button" className="btn" disabled={busy} onClick={() => answer("travel")}>Traveling</button>
        <button type="button" className="btn" disabled={busy} onClick={() => answer("break")}>Break</button>
      </div>
    </section>
  );
}
