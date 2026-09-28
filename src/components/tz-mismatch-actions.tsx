"use client";

import { useState } from "react";
import { TZ_ACK_COOKIE } from "@/lib/tz-ack";

function cityOf(tz: string): string {
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

export function TzMismatchActions({ userTz, deviceTz }: { userTz: string; deviceTz: string }) {
  const [busy, setBusy] = useState(false);

  async function switchZone() {
    setBusy(true);
    try {
      const res = await fetch("/api/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: deviceTz }),
      });
      if (res.ok) window.location.reload();
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  function keep() {
    document.cookie = `${TZ_ACK_COOKIE}=${encodeURIComponent(`${userTz}|${deviceTz}`)}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <span className="flex gap-3">
      <button type="button" onClick={switchZone} disabled={busy} style={{ textDecoration: "underline" }}>
        Switch to {cityOf(deviceTz)}
      </button>
      <button type="button" onClick={keep} disabled={busy} style={{ opacity: 0.7 }}>
        Keep {cityOf(userTz)}
      </button>
    </span>
  );
}
