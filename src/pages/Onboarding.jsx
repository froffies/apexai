import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Dumbbell, Flame, Sparkles, Target, Utensils } from "lucide-react"
import ChoiceGrid from "@/components/ChoiceGrid"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import { writeAppRecordSync } from "@/lib/appStorage"
import { defaultProfile, starterProgress, storageKeys } from "@/lib/fitnessDefaults"
import { activityLevelChoices, genderChoices, goalChoices, localeChoices, splitChoices } from "@/lib/profileFieldOptions"
import { buildStarterRecommendations, recommendTargetWeight } from "@/lib/profileRecommendations"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

function asFieldString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function sanitizeIntegerInput(value) {
  return value.replace(/[^\d]/g, "")
}

function sanitizeDecimalInput(value) {
  const cleaned = value.replace(/[^0-9.]/g, "")
  const [whole = "", ...rest] = cleaned.split(".")
  return rest.length ? `${whole}.${rest.join("")}` : cleaned
}

function progressWidth(step) {
  return `${((step + 1) / 3) * 100}%`
}

function formatSignedCalories(value) {
  const numeric = Number(value) || 0
  if (!numeric) return "0 kcal"
  return `${numeric > 0 ? "+" : ""}${numeric} kcal`
}

const STEP_META = [
  {
    heroTitle: "Build your coaching profile",
    heroSubtitle: "A few details now so your training targets, units, and nutrition guidance feel personal from day one.",
    summaryTitle: "Profile and units",
    summaryBody: "We use this first step to set your baseline, show the right unit system, and anchor your starting targets.",
    sectionTitle: "Personal details",
    validationHint: "Fill in your name, age, weight, and height so we can calculate accurate starting targets.",
  },
  {
    heroTitle: "Shape your starting plan",
    heroSubtitle: "Choose your goal, training frequency, and preferred split so the coach starts in the right lane.",
    summaryTitle: "Goal and schedule",
    summaryBody: "This tells ApexAI how often you train, what you are aiming for, and how aggressive the first targets should be.",
    sectionTitle: "Goal and training setup",
    validationHint: "Pick 2-7 training days and a target weight so the starter plan lines up with your goal.",
  },
  {
    heroTitle: "Review the reasoning, then choose your start",
    heroSubtitle: "Targets are built from your inputs with an evidence-based starting estimate. Starter workout and nutrition plans are optional.",
    summaryTitle: "Evidence-based starting point",
    summaryBody: "Calories and macros are calculated from your inputs. Starter plans are optional suggestions, not hardcoded commitments.",
    sectionTitle: "Your starting plan",
    validationHint: "",
  },
]

const STEP_LABELS = ["Profile", "Preferences", "Review"]

function StepShell({ children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {children}
    </section>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode = undefined,
  min = undefined,
  max = undefined,
  autoComplete = undefined,
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        min={min}
        max={max}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        className="relative z-10 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-950 shadow-sm"
      />
    </div>
  )
}

function StatTile({ label, value, detail = "" }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  )
}

function OptionCard({ option, selected, onSelect, kind }) {
  const plan = option.plan

  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      className={`grid gap-3 rounded-2xl border p-4 text-left transition ${selected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${selected ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
              {option.badge}
            </span>
            {selected ? <span className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Selected</span> : null}
          </div>
          <h3 className="mt-2 text-base font-bold text-slate-950">{option.label}</h3>
          <p className="mt-1 text-sm text-slate-600">{option.description}</p>
        </div>
        <div className={`rounded-full p-2 ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
          {kind === "workout" ? <Dumbbell size={16} /> : <Utensils size={16} />}
        </div>
      </div>

      <p className={`text-sm ${selected ? "text-indigo-700" : "text-slate-500"}`}>{option.reason}</p>

      {option.summary ? (
        <div className={`rounded-xl px-3 py-2 text-sm font-medium ${selected ? "bg-white text-slate-900" : "bg-slate-50 text-slate-700"}`}>
          {option.summary}
        </div>
      ) : null}

      {plan?.exercises?.length ? (
        <div className="grid gap-2">
          {plan.exercises.slice(0, 4).map((exercise) => (
            <div key={exercise.name} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${selected ? "bg-white" : "bg-slate-50"}`}>
              <span className="text-slate-700">{exercise.name}</span>
              <span className="font-semibold text-slate-950">{exercise.setsReps}</span>
            </div>
          ))}
        </div>
      ) : null}

      {plan?.meals?.length ? (
        <div className="grid gap-2">
          {plan.meals.slice(0, 5).map((meal, index) => (
            <div key={`${meal.food_name}-${index}`} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${selected ? "bg-white" : "bg-slate-50"}`}>
              <span className="text-slate-700">{meal.food_name}</span>
              <span className="font-semibold text-slate-950">{meal.calories} kcal</span>
            </div>
          ))}
        </div>
      ) : null}
    </button>
  )
}

export default function Onboarding() {
  const [profile, setProfile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [workoutPlans, setWorkoutPlans] = useLocalStorage(storageKeys.workoutPlans, [])
  const [mealPlans, setMealPlans] = useLocalStorage(storageKeys.mealPlans, [])
  const [progress, setProgress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [step, setStep] = useState(0)
  const [targetWeightTouched, setTargetWeightTouched] = useState(Boolean(profile.target_weight_kg))
  const [selectedWorkoutOptionId, setSelectedWorkoutOptionId] = useState("")
  const [selectedMealOptionId, setSelectedMealOptionId] = useState("")
  const [form, setForm] = useState({
    ...defaultProfile,
    name: profile.name || "",
    age: asFieldString(profile.age ?? defaultProfile.age),
    weight_kg: asFieldString(profile.weight_kg ?? defaultProfile.weight_kg),
    height_cm: asFieldString(profile.height_cm ?? defaultProfile.height_cm),
    training_days_per_week: asFieldString(profile.training_days_per_week ?? defaultProfile.training_days_per_week),
    onboarded: false,
    target_weight_kg: asFieldString(profile.target_weight_kg || recommendTargetWeight(profile)),
  })

  const recommendation = useMemo(() => buildStarterRecommendations(form), [form])
  const numericAge = Number(form.age)
  const numericWeight = Number(form.weight_kg)
  const numericHeight = Number(form.height_cm)
  const numericTrainingDays = Number(form.training_days_per_week)
  const numericTargetWeight = Number(form.target_weight_kg)
  const stepZeroValid = Boolean(form.name.trim()) && numericAge >= 13 && numericAge <= 120 && numericWeight > 0 && numericHeight > 0
  const stepOneValid = numericTrainingDays >= 2 && numericTrainingDays <= 7 && numericTargetWeight > 0
  const currentMeta = STEP_META[step]

  useEffect(() => {
    if (!recommendation.workoutOptions.some((option) => option.id === selectedWorkoutOptionId)) {
      setSelectedWorkoutOptionId(recommendation.recommendedWorkoutOptionId)
    }
  }, [recommendation.recommendedWorkoutOptionId, recommendation.workoutOptions, selectedWorkoutOptionId])

  useEffect(() => {
    if (!recommendation.mealOptions.some((option) => option.id === selectedMealOptionId)) {
      setSelectedMealOptionId(recommendation.recommendedMealOptionId)
    }
  }, [recommendation.mealOptions, recommendation.recommendedMealOptionId, selectedMealOptionId])

  useEffect(() => {
    if (targetWeightTouched) return
    const suggested = asFieldString(recommendTargetWeight(form))
    if (suggested !== form.target_weight_kg) {
      setForm((current) => ({ ...current, target_weight_kg: suggested }))
    }
  }, [form.goal, form.weight_kg, form.target_weight_kg, targetWeightTouched])

  const selectedWorkoutOption = recommendation.workoutOptions.find((option) => option.id === selectedWorkoutOptionId) || recommendation.workoutOptions[0]
  const selectedMealOption = recommendation.mealOptions.find((option) => option.id === selectedMealOptionId) || recommendation.mealOptions[0]

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const updateInteger = (key, value) => update(key, sanitizeIntegerInput(value))
  const updateDecimal = (key, value) => {
    if (key === "target_weight_kg") setTargetWeightTouched(true)
    update(key, sanitizeDecimalInput(value))
  }

  const finish = () => {
    const nextProfile = { ...recommendation.profile, name: form.name || "Athlete", onboarded: true }
    const starterWorkoutPlan = selectedWorkoutOption?.plan ? { ...selectedWorkoutOption.plan, date: todayISO() } : null
    const starterMealPlan = selectedMealOption?.plan ? { ...selectedMealOption.plan, date: todayISO() } : null
    const nextWorkoutPlans = workoutPlans.length ? workoutPlans : starterWorkoutPlan ? [starterWorkoutPlan] : []
    const nextMealPlans = mealPlans.length ? mealPlans : starterMealPlan ? [starterMealPlan] : []
    const nextProgress = progress.length ? progress : [{
      id: uid("progress"),
      date: todayISO(),
      weight_kg: nextProfile.weight_kg,
      body_fat_estimate: 0,
      waist_cm: 0,
      notes: "Baseline set during onboarding",
    }]

    writeAppRecordSync(storageKeys.profile, nextProfile)
    writeAppRecordSync(storageKeys.workoutPlans, nextWorkoutPlans)
    writeAppRecordSync(storageKeys.mealPlans, nextMealPlans)
    writeAppRecordSync(storageKeys.progress, nextProgress)

    setProfile(nextProfile)
    setWorkoutPlans(nextWorkoutPlans)
    setMealPlans(nextMealPlans)
    setProgress(nextProgress)
    window.dispatchEvent(new CustomEvent("apexai-storage", { detail: { key: "*" } }))
    window.location.assign("/")
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <aside className="grid gap-6 lg:sticky lg:top-6">
          <PageHeader
            eyebrow="Getting started"
            title={currentMeta.heroTitle}
            subtitle={currentMeta.heroSubtitle}
            action={<div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm">Step {step + 1} of 3</div>}
          />

          <SectionCard
            title={currentMeta.summaryTitle}
            description={currentMeta.summaryBody}
            tone="subtle"
            action={<div className="rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">Editable later in Profile, Nutrition, and Coach.</div>}
          >
            <div className="grid grid-cols-3 gap-2">
              {STEP_LABELS.map((label, index) => {
                const stateClass = index === step
                  ? "border-indigo-500 bg-indigo-50 text-indigo-950"
                  : index < step
                    ? "border-indigo-200 bg-white text-indigo-700"
                    : "border-slate-200 bg-white text-slate-500"
                return (
                  <div
                    key={label}
                    className={`rounded-xl border px-3 py-3 text-sm ${stateClass}`}
                    aria-current={index === step ? "step" : undefined}
                  >
                    <p className="font-semibold">{label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] opacity-80">Step {index + 1}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 h-2 rounded-full bg-white">
              <div className="h-2 rounded-full bg-indigo-600 transition-all" style={{ width: progressWidth(step) }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white p-3">
                <p className="text-slate-500">Goal</p>
                <p className="mt-1 font-semibold text-slate-950">{recommendation.profile.goal ? recommendation.profile.goal.replace(/_/g, " ") : form.goal.replace(/_/g, " ")}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-slate-500">Calories</p>
                <p className="mt-1 font-semibold text-slate-950">{recommendation.profile.daily_calories} kcal</p>
              </div>
            </div>
          </SectionCard>
        </aside>

        <div className="grid gap-6">
          {step === 0 && (
            <StepShell>
              <h2 className="text-lg font-bold text-slate-950">{currentMeta.sectionTitle}</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextField id="onboarding-name" label="Name" value={form.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" />
                <TextField id="onboarding-age" label="Age" inputMode="numeric" min="0" max="120" value={form.age} onChange={(event) => updateInteger("age", event.target.value)} />
                <TextField id="onboarding-weight" label="Weight kg" inputMode="decimal" min="0" max="400" value={form.weight_kg} onChange={(event) => updateDecimal("weight_kg", event.target.value)} />
                <TextField id="onboarding-height" label="Height cm" inputMode="decimal" min="0" max="300" value={form.height_cm} onChange={(event) => updateDecimal("height_cm", event.target.value)} />
                <ChoiceGrid
                  label="Locale"
                  value={form.locale}
                  onChange={(value) => update("locale", value)}
                  options={localeChoices}
                  columns={3}
                  className="md:col-span-2"
                  compact
                />
                <ChoiceGrid
                  label="Gender"
                  value={form.gender}
                  onChange={(value) => update("gender", value)}
                  options={genderChoices}
                  columns={3}
                  className="md:col-span-2"
                  compact
                />
              </div>
              {!stepZeroValid && (
                <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  {currentMeta.validationHint}
                </p>
              )}
              <div className="mt-5 flex justify-end">
                <button type="button" disabled={!stepZeroValid} onClick={() => setStep(1)} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight size={16} /> Continue</button>
              </div>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell>
              <h2 className="text-lg font-bold text-slate-950">{currentMeta.sectionTitle}</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextField id="onboarding-training-days" label="Training days" inputMode="numeric" min="2" max="7" value={form.training_days_per_week} onChange={(event) => updateInteger("training_days_per_week", event.target.value)} />
                <TextField id="onboarding-target-weight" label="Target weight kg" inputMode="decimal" min="0" max="400" value={form.target_weight_kg} onChange={(event) => updateDecimal("target_weight_kg", event.target.value)} />
                <ChoiceGrid
                  label="Goal"
                  value={form.goal}
                  onChange={(value) => update("goal", value)}
                  options={goalChoices}
                  className="md:col-span-2"
                  compact
                />
                <ChoiceGrid
                  label="Activity"
                  value={form.activity_level}
                  onChange={(value) => update("activity_level", value)}
                  options={activityLevelChoices}
                  className="md:col-span-2"
                />
                <ChoiceGrid
                  label="Preferred split"
                  value={form.split_type}
                  onChange={(value) => update("split_type", value)}
                  options={splitChoices}
                  className="md:col-span-2"
                  compact
                />
              </div>
              {!targetWeightTouched ? (
                <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  We are suggesting a starting target weight from your current weight and goal. Override it anytime if you already know the number you want to work toward.
                </p>
              ) : null}
              {!stepOneValid && (
                <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  {currentMeta.validationHint}
                </p>
              )}
              <div className="mt-5 flex justify-between">
                <button type="button" onClick={() => setStep(0)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Back</button>
                <button type="button" disabled={!stepOneValid} onClick={() => setStep(2)} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight size={16} /> Review plan</button>
              </div>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell>
              <h2 className="text-lg font-bold text-slate-950">{currentMeta.sectionTitle}</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
                <div className="grid gap-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Daily target</p>
                        <p className="mt-1 text-3xl font-semibold text-slate-950">{recommendation.profile.daily_calories}</p>
                      </div>
                      <div className="rounded-full bg-white p-2 text-indigo-600 shadow-sm">
                        <Target size={18} />
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl bg-white p-3 text-sm text-slate-600">
                      <p><span className="font-semibold text-slate-900">Goal:</span> {form.goal.replace(/_/g, " ")}</p>
                      <p className="mt-1"><span className="font-semibold text-slate-900">Split:</span> {recommendation.profile.split_type.replace(/_/g, " ")}</p>
                      <p className="mt-1"><span className="font-semibold text-slate-900">Training days:</span> {numericTrainingDays} per week</p>
                      <p className="mt-1"><span className="font-semibold text-slate-900">Target weight:</span> {recommendation.profile.target_weight_kg} kg</p>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-2xl bg-white p-3"><p className="text-slate-500">Protein</p><p className="font-semibold text-slate-950">{recommendation.profile.protein_g}g</p></div>
                      <div className="rounded-2xl bg-white p-3"><p className="text-slate-500">Carbs</p><p className="font-semibold text-slate-950">{recommendation.profile.carbs_g}g</p></div>
                      <div className="rounded-2xl bg-white p-3"><p className="text-slate-500">Fat</p><p className="font-semibold text-slate-950">{recommendation.profile.fat_g}g</p></div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">How this is calculated</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-950">{recommendation.targetModel.method}</h3>
                      </div>
                      <div className="rounded-full bg-slate-50 p-2 text-indigo-600">
                        <Flame size={18} />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <StatTile label="Estimated BMR" value={`${recommendation.targetModel.bmr} kcal`} detail="Resting burn from age, height, weight, and gender setting." />
                      <StatTile label="Maintenance" value={`${recommendation.targetModel.maintenanceCalories} kcal`} detail={`${recommendation.targetModel.activityMultiplier}x activity multiplier`} />
                      <StatTile label="Goal adjustment" value={formatSignedCalories(recommendation.targetModel.goalAdjustmentCalories)} detail="Applied after maintenance based on your goal." />
                      <StatTile label="BMI context" value={recommendation.targetModel.bmi ? recommendation.targetModel.bmi : "-"} detail={recommendation.targetModel.bmiCategory} />
                    </div>
                    <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-600" />
                        <p>{recommendation.targetModel.summary}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <section className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Optional starter workout</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-950">Choose how you want week one to start</h3>
                        <p className="mt-1 text-sm text-slate-600">These options are built from your split, goal, training frequency, and current lack of training history. You can also skip this and decide later.</p>
                      </div>
                      <div className="rounded-full bg-slate-50 p-2 text-indigo-600">
                        <Dumbbell size={18} />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {recommendation.workoutOptions.map((option) => (
                        <OptionCard
                          key={option.id}
                          option={option}
                          selected={selectedWorkoutOption?.id === option.id}
                          onSelect={setSelectedWorkoutOptionId}
                          kind="workout"
                        />
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Optional starter nutrition</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-950">Choose the first food structure you want to follow</h3>
                        <p className="mt-1 text-sm text-slate-600">These days are built from the verified Australian food catalogue and topped up toward your calorie and protein targets.</p>
                      </div>
                      <div className="rounded-full bg-slate-50 p-2 text-indigo-600">
                        <Utensils size={18} />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {recommendation.mealOptions.map((option) => (
                        <OptionCard
                          key={option.id}
                          option={option}
                          selected={selectedMealOption?.id === option.id}
                          onSelect={setSelectedMealOptionId}
                          kind="meal"
                        />
                      ))}
                    </div>
                  </section>
                </div>
              </div>
              <div className="mt-5 flex justify-between">
                <button type="button" onClick={() => setStep(1)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Back</button>
                <button type="button" onClick={finish} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"><CheckCircle2 size={16} /> Save profile and enter dashboard</button>
              </div>
            </StepShell>
          )}
        </div>
      </div>
    </div>
  )
}
