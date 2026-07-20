"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const host = params.get("host") === "1";
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (register && passcode !== confirm) { setError("PASSCODES DO NOT MATCH"); return; }
    setBusy(true);
    try {
      const response = await fetch(register ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(register ? { name, passcode, recoveryEmail } : { name, passcode }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error === "restaurant_exists" ? "RESTAURANT ALREADY EXISTS" : body.error === "too_many_attempts" ? "TRY AGAIN IN ONE MINUTE" : "NAME OR PASSCODE NOT RECOGNIZED");
        return;
      }
      window.location.assign(host ? "/host" : "/");
    } catch { setError("CONNECTION FAILED — TRY AGAIN"); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#101113] text-[#ecebe6] flex items-center justify-center p-5 font-mono">
    <section className="w-full max-w-sm rounded-xl border border-white/10 bg-[#18191d] p-7 shadow-2xl">
      <div className="mb-8 flex items-center gap-3"><img src="/brand/travola-icon.svg" alt="Travola" className="h-10 w-10 rounded-lg" /><div><h1 className="text-sm font-semibold tracking-[0.24em]">TRAVOLA</h1><p className="mt-1 text-[10px] tracking-[0.16em] text-white/45">{host ? "HOST STAND" : register ? "NEW RESTAURANT" : "MANAGER"}</p></div></div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-[10px] tracking-[0.12em] text-white/55">RESTAURANT NAME<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="organization" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-cyan-300" /></label>
        <label className="block text-[10px] tracking-[0.12em] text-white/55">4-DIGIT PASSCODE<input value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 4))} required inputMode="numeric" autoComplete={register ? "new-password" : "current-password"} className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm tracking-[0.35em] outline-none focus:border-cyan-300" /></label>
        {register && <><label className="block text-[10px] tracking-[0.12em] text-white/55">CONFIRM PASSCODE<input value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))} required inputMode="numeric" autoComplete="new-password" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm tracking-[0.35em] outline-none focus:border-cyan-300" /></label><label className="block text-[10px] tracking-[0.12em] text-white/55">RECOVERY EMAIL <span className="text-white/30">(OPTIONAL)</span><input value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} type="email" autoComplete="email" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-cyan-300" /></label></>}
        {error && <p className="text-[10px] tracking-[0.08em] text-rose-300">{error}</p>}
        <button disabled={busy} className="w-full rounded-md bg-cyan-300 py-3 text-xs font-bold tracking-[0.14em] text-[#101113] disabled:opacity-50">{busy ? "WORKING…" : register ? "CREATE & ENTER" : "ENTER TRAVOLA"}</button>
      </form>
      {!host && <button onClick={() => { setRegister((value) => !value); setError(""); }} className="mt-6 text-[10px] tracking-[0.08em] text-cyan-200/80 hover:text-cyan-100">{register ? "← BACK TO SIGN IN" : "CREATE RESTAURANT →"}</button>}
    </section>
  </main>;
}

export default function LoginPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#101113]" />}><LoginForm /></Suspense>;
}
