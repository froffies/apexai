import { Suspense, lazy, useEffect, useState } from "react"
import ChoiceGrid from "@/components/ChoiceGrid"
import MacroTargetEditor from "@/components/MacroTargetEditor"
import PageHeader from "@/components/PageHeader"
import { calculateAchievements } from "@/lib/achievements"
import { useAuth } from "@/lib/AuthContext"
import { defaultHabits, defaultProfile, starterMeals, starterProgress, starterWorkoutSets, starterWorkouts, storageKeys } from "@/lib/fitnessDefaults"
import { activityLevelChoices, goalChoices, localeChoices, splitChoices } from "@/lib/profileFieldOptions"
import { resetApexData, useLocalStorage } from "@/lib/useLocalStorage"

const DataManager = lazy(() => import("@/components/DataManager"))
const NativeIntegrationPanel = lazy(() => import("@/components/NativeIntegrationPanel"))

export default function Profile() {
  const { user, cloudConfigured, cloudStatus, localMode, logout, deleteAccountPermanently } = useAuth()
  const [profile, setProfile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [workouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [progress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [workoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [habits] = useLocalStorage(storageKeys.habits, defaultHabits)
  const [form, setForm] = useState(profile)
  const [saved, setSaved] = useState(false)
  const [editingTargets, setEditingTargets] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState("")
  const [deleteStatus, setDeleteStatus] = useState("")
  const achievements = calculateAchievements({ profile, meals, workouts, progress, workoutSets, habits })
  const developerToolsEnabled =
    import.meta.env.VITE_APEXAI_SHOW_DEVELOPER_TOOLS === "true" ||
    (typeof window !== "undefined" && window.localStorage.getItem("apexai.developerTools") === "true")

  useEffect(() => {
    setForm(profile)
  }, [profile])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const save = (event) => {
    event.preventDefault()
    setProfile({ ...form, onboarded: true })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }
  const saveTargets = (targets) => {
    setForm((current) => ({ ...current, ...targets }))
    setProfile((current) => ({ ...current, ...targets }))
  }
  const deleteLocalData = async () => {
    try {
      await resetApexData()
      setProfile(defaultProfile)
      setConfirmDelete("")
      setDeleteStatus("Local device data deleted.")
    } catch (error) {
      setDeleteStatus(error instanceof Error ? error.message : "Failed to delete local data.")
    }
  }
  const deletePermanentAccount = async () => {
    try {
      await deleteAccountPermanently()
      await resetApexData()
      setProfile(defaultProfile)
      setConfirmDelete("")
      setDeleteStatus("Your account and synced data were deleted.")
    } catch (error) {
      setDeleteStatus(error instanceof Error ? error.message : "Account deletion failed.")
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Profile"
        title="Profile and targets"
        subtitle="Keep your personal details, nutrition targets, and training preferences up to date."
        action={<button type="button" onClick={() => setEditingTargets(true)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">Adjust targets</button>}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Account</h2>
            <p className="mt-1 text-sm text-slate-600">
              {cloudConfigured && !localMode
                ? `${user?.email || "Signed-in account"} • ${cloudStatus || "Cloud sync active"}`
                : "You're using ApexAI on this device only."}
            </p>
          </div>
          {cloudConfigured && !localMode ? (
            <button type="button" onClick={() => void logout()} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
              Sign out
            </button>
          ) : (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
              Local mode
            </div>
          )}
        </div>
      </section>

      <form onSubmit={save} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">Name<input value={form.name || ""} onChange={(event) => update("name", event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Age<input type="number" value={form.age || ""} onChange={(event) => update("age", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Weight kg<input type="number" value={form.weight_kg || ""} onChange={(event) => update("weight_kg", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Target kg<input type="number" value={form.target_weight_kg || ""} onChange={(event) => update("target_weight_kg", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Height cm<input type="number" value={form.height_cm || ""} onChange={(event) => update("height_cm", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Calories<input type="number" value={form.daily_calories || ""} onChange={(event) => update("daily_calories", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Protein g<input type="number" value={form.protein_g || ""} onChange={(event) => update("protein_g", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Carbs g<input type="number" value={form.carbs_g || ""} onChange={(event) => update("carbs_g", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Fat g<input type="number" value={form.fat_g || ""} onChange={(event) => update("fat_g", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Training days<input type="number" value={form.training_days_per_week || ""} onChange={(event) => update("training_days_per_week", Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2" /></label>
          <ChoiceGrid
            label="Goal"
            value={form.goal}
            onChange={(value) => update("goal", value)}
            options={goalChoices}
            className="md:col-span-2"
          />
          <ChoiceGrid
            label="Locale"
            value={form.locale}
            onChange={(value) => update("locale", value)}
            options={localeChoices}
            columns={3}
            className="md:col-span-2"
          />
          <ChoiceGrid
            label="Activity"
            value={form.activity_level}
            onChange={(value) => update("activity_level", value)}
            options={activityLevelChoices}
            className="md:col-span-2"
          />
          <ChoiceGrid
            label="Split"
            value={form.split_type}
            onChange={(value) => update("split_type", value)}
            options={splitChoices}
            className="md:col-span-2"
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">{saved ? "Saved" : "Save profile"}</button>
        </div>
      </form>
      {developerToolsEnabled && (
        <>
          <Suspense fallback={<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Loading device tools...</p></section>}>
            <NativeIntegrationPanel />
          </Suspense>
          <Suspense fallback={<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Loading data tools...</p></section>}>
            <DataManager />
          </Suspense>
        </>
      )}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Achievements</h2>
            <p className="mt-1 text-sm text-slate-500">{achievements.filter((achievement) => achievement.earned).length}/{achievements.length} badges earned</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((achievement) => (
            <div key={achievement.key} className={`rounded-lg border p-4 ${achievement.earned ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-slate-50 opacity-70"}`}>
              <p className="font-bold text-slate-950">{achievement.title}</p>
              <p className="mt-1 text-sm text-slate-600">{achievement.description}</p>
              <p className="mt-2 text-sm font-semibold text-indigo-700">{achievement.earned ? "Unlocked" : "Locked"} - {achievement.category}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-rose-700">Reset or delete</h2>
        <p className="mt-1 text-sm text-slate-600">
          {cloudConfigured && !localMode
            ? "Reset data on this device, or permanently delete your synced account."
            : "Reset the ApexAI data stored on this device."}
        </p>
        <div className={`mt-4 grid gap-2 ${cloudConfigured && !localMode ? "sm:grid-cols-2" : ""}`}>
          <button type="button" onClick={() => setConfirmDelete("local")} className="min-h-11 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700">Reset this device</button>
          {cloudConfigured && !localMode && (
            <button type="button" onClick={() => setConfirmDelete("account")} className="min-h-11 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white">
              Delete my account
            </button>
          )}
        </div>
        {confirmDelete && (
          <div className="mt-4 rounded-lg bg-rose-50 p-3">
            <p className="text-sm font-semibold text-rose-800">
              {confirmDelete === "account"
                ? "Delete your account and synced data permanently?"
                : "Reset all ApexAI data on this device?"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {confirmDelete === "local" && <button type="button" onClick={deleteLocalData} className="min-h-11 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white">Yes, reset this device</button>}
              {confirmDelete === "account" && <button type="button" onClick={deletePermanentAccount} className="min-h-11 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white">Yes, delete my account</button>}
              <button type="button" onClick={() => setConfirmDelete("")} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
            </div>
          </div>
        )}
        {deleteStatus && <p className="mt-3 text-sm font-semibold text-rose-700">{deleteStatus}</p>}
      </section>
      {editingTargets && <MacroTargetEditor profile={form} onSave={saveTargets} onClose={() => setEditingTargets(false)} />}
    </div>
  )
}
