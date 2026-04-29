import { useState } from "react"
import { LockKeyhole, Mail, UserRound } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, continueLocally, cloudConfigured } = useAuth()
  const [mode, setMode] = useState("sign-in")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setStatus("")
    try {
      if (mode === "sign-up") {
        await signUpWithEmail(email, password, fullName)
        setStatus("Account created. Check your email if confirmation is enabled, then sign in.")
      } else {
        await signInWithEmail(email, password)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-white p-5 text-slate-950 shadow-2xl">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">ApexAI Cloud</p>
          <h1 className="mt-1 text-2xl font-bold">Sign in to sync your coach data</h1>
          <p className="mt-2 text-sm text-slate-600">Your workouts, meals, plans, and profile sync through Supabase when cloud credentials are configured.</p>
        </div>

        {!cloudConfigured && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Supabase is not configured yet, so the app can only run locally on this device.
          </div>
        )}

        <form onSubmit={submit} className="grid gap-3">
          {mode === "sign-up" && (
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Name
              <span className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <UserRound size={17} className="text-slate-400" />
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="min-h-8 flex-1 border-0 p-0 text-slate-950 outline-none" placeholder="Your name" />
              </span>
            </label>
          )}
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Email
            <span className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <Mail size={17} className="text-slate-400" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="min-h-8 flex-1 border-0 p-0 text-slate-950 outline-none" placeholder="you@example.com" />
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Password
            <span className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <LockKeyhole size={17} className="text-slate-400" />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} className="min-h-8 flex-1 border-0 p-0 text-slate-950 outline-none" placeholder="6+ characters" />
            </span>
          </label>
          <button type="submit" disabled={busy || !cloudConfigured} className="mt-2 min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Working..." : mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
        </form>

        {status && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{status}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
            {mode === "sign-up" ? "I already have an account" : "Create a new account"}
          </button>
          <button type="button" onClick={continueLocally} className="min-h-11 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700">
            Continue locally on this device
          </button>
        </div>
      </section>
    </main>
  )
}
