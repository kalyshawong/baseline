"use client";

import { useRef } from "react";
import { stopNativeSync } from "@/lib/native-health";
import { deleteAccountAction, signOutAction } from "./actions";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        await stopNativeSync();
        await signOutAction();
      }}
    >
      <button type="submit" className="btn w-full">Sign out</button>
    </form>
  );
}

export function DeleteAccountForm() {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await stopNativeSync();
        await deleteAccountAction(fd);
      }}
      className="flex flex-col gap-3"
    >
      <label className="ov" htmlFor="confirm">Type DELETE to confirm</label>
      <input id="confirm" name="confirm" required autoComplete="off" autoCapitalize="characters" className="field" placeholder="DELETE" />
      <label className="ov mt-2" htmlFor="password">Password</label>
      <input id="password" name="password" type="password" required autoComplete="current-password" className="field" />
      <button type="submit" className="btn mt-3 w-full" style={{ background: "var(--color-red)" }}>
        Delete my account and data
      </button>
    </form>
  );
}
