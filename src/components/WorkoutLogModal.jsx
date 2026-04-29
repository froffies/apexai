import { useEffect, useMemo, useState } from "react"
import { Check, Plus, Search, Sparkles, TimerReset, Trash2, X } from "lucide-react"
import { writeAppRecordSync } from "@/lib/appStorage"
import { emptyActiveWorkout, starterExercises, starterWorkoutSets, starterWorkouts, storageKeys } from "@/lib/fitnessDefaults"
import { buildExerciseHistoryMap, detectSessionRecords, getExerciseAutocompleteOptions, getRecentExerciseNames, parseSetsRepsSpec } from "@/lib/workoutIntelligence"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

function makeActualSets(count, reps = 8, weightKg = 0, previous = []) {
  return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, index) => ({
    reps: previous[index]?.reps ?? reps,
    weight_kg: previous[index]?.weight_kg ?? weightKg,
  }))
}

function validateRow(row) {
  const sets = Number(row.sets) || 0
  const repMin = Number(row.rep_min) || 0
  const repMax = Number(row.rep_max) || 0
  if (!row.exercise_name?.trim()) return "Choose an exercise for every row."
  if (sets < 1 || sets > 12) return "Sets must stay between 1 and 12."
  if (repMin < 0 || repMax < 0 || repMin > repMax || repMax > 50) return "Use a valid rep range."
  if (!Array.isArray(row.actual_sets) || row.actual_sets.length !== sets) return "Each row needs one logged entry per set."
  for (const set of row.actual_sets) {
    const reps = Number(set.reps) || 0
    const weight = Number(set.weight_kg) || 0
    if (reps < 0 || reps > 100) return "Set reps must stay between 0 and 100."
    if (weight < 0 || weight > 500) return "Set load must stay between 0kg and 500kg."
  }
  return ""
}

function createRowFromExercise(exerciseName, historyMap, exerciseLibrary = [], existingExercise = null) {
  const history = historyMap[String(exerciseName || "").trim().toLowerCase()]
  const libraryMatch = exerciseLibrary.find((exercise) => exercise.name === exerciseName)
  const parsed = parseSetsRepsSpec(existingExercise?.setsReps || "")
  const repMin = existingExercise?.target_rep_min || parsed.repMin || history?.latest?.reps || 8
  const repMax = existingExercise?.target_rep_max || parsed.repMax || repMin
  const sets = existingExercise?.target_sets || parsed.sets || 3
  const weight = existingExercise?.target_weight_kg ?? history?.suggestedWeight ?? history?.bestWeight ?? history?.latest?.weight_kg ?? 0
  const previousSets = existingExercise?.logged_sets?.map((set) => ({ reps: set.reps, weight_kg: set.weight_kg })) || []

  return {
    exercise_name: exerciseName,
    muscle_group: libraryMatch?.category || libraryMatch?.muscle_group || history?.category || existingExercise?.muscle || "full_body",
    sets,
    rep_min: repMin,
    rep_max: repMax,
    rest_seconds: existingExercise?.target_duration_minutes ? 60 : 90,
    actual_sets: makeActualSets(sets, repMax || repMin || 8, weight, previousSets),
  }
}

function createWorkoutForm(existingWorkout = null) {
  return {
    date: existingWorkout?.date || todayISO(),
    workout_type: existingWorkout?.workout_type || "",
    duration_minutes: existingWorkout?.duration_minutes ? String(existingWorkout.duration_minutes) : "",
    notes: existingWorkout?.notes || "",
    completed: existingWorkout?.completed !== false,
  }
}

function buildRowsFromExistingWorkout(existingWorkout, workoutSets = [], historyMap = {}, exerciseLibrary = []) {
  if (!existingWorkout?.id) return []
  const sessionSets = workoutSets.filter((set) => set.session_id === existingWorkout.id)
  if (!sessionSets.length) return []

  const groupedRows = []
  for (const set of sessionSets) {
    const exerciseName = String(set.exercise_name || "Exercise").trim() || "Exercise"
    let row = groupedRows.find((entry) => entry.exercise_name === exerciseName)
    if (!row) {
      const reps = Number(set.reps) || 0
      row = createRowFromExercise(exerciseName, historyMap, exerciseLibrary, {
        muscle: set.muscle_group,
        target_sets: 1,
        target_rep_min: reps,
        target_rep_max: reps,
        logged_sets: [],
      })
      row.actual_sets = []
      groupedRows.push(row)
    }

    row.actual_sets.push({
      reps: Number(set.reps) || 0,
      weight_kg: Number(set.weight_kg) || 0,
    })
  }

  return groupedRows.map((row) => {
    const reps = row.actual_sets.map((set) => Number(set.reps) || 0).filter((value) => value > 0)
    const repMin = reps.length ? Math.min(...reps) : Number(row.rep_min) || 0
    const repMax = reps.length ? Math.max(...reps) : Number(row.rep_max) || repMin
    const sets = row.actual_sets.length || Number(row.sets) || 1
    return {
      ...row,
      sets,
      rep_min: repMin,
      rep_max: repMax,
      actual_sets: makeActualSets(sets, repMax || repMin || 8, row.actual_sets[0]?.weight_kg || 0, row.actual_sets),
    }
  })
}

export default function WorkoutLogModal({ existingWorkout = null, onClose, onSaved = null, standalone = false }) {
  const [workouts, setWorkouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutSets, setWorkoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [exercises] = useLocalStorage(storageKeys.exercises, starterExercises)
  const [activeWorkout, setActiveWorkout] = useLocalStorage(storageKeys.activeWorkout, emptyActiveWorkout)
  const historyMap = useMemo(() => buildExerciseHistoryMap(workoutSets, exercises), [exercises, workoutSets])
  const recentExerciseNames = useMemo(() => getRecentExerciseNames(workoutSets), [workoutSets])
  const existingRows = useMemo(() => buildRowsFromExistingWorkout(existingWorkout, workoutSets, historyMap, exercises), [existingWorkout, exercises, historyMap, workoutSets])
  const initialRow = useMemo(() => createRowFromExercise(recentExerciseNames[0] || "Bench Press", historyMap, exercises), [exercises, historyMap, recentExerciseNames])
  const [form, setForm] = useState(() => createWorkoutForm(existingWorkout))
  const [setRows, setSetRows] = useState(() => existingRows.length ? existingRows : [initialRow])
  const [restTimer, setRestTimer] = useState({ rowIndex: -1, remaining: 0 })
  const [openPickerRow, setOpenPickerRow] = useState(-1)
  const [exerciseSearch, setExerciseSearch] = useState({})
  const [status, setStatus] = useState("")
  const [hydratedActiveWorkoutId, setHydratedActiveWorkoutId] = useState("")

  useEffect(() => {
    if (restTimer.remaining <= 0) return undefined
    const timeout = window.setTimeout(() => {
      setRestTimer((current) => ({ ...current, remaining: Math.max(0, current.remaining - 1) }))
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [restTimer])

  useEffect(() => {
    if (!existingWorkout?.id) return
    setForm(createWorkoutForm(existingWorkout))
    setSetRows(existingRows.length ? existingRows : [createRowFromExercise(recentExerciseNames[0] || "Bench Press", historyMap, exercises)])
    setHydratedActiveWorkoutId(existingWorkout.id)
  }, [existingRows, existingWorkout, exercises, historyMap, recentExerciseNames])

  useEffect(() => {
    if (existingWorkout?.id) return
    if (!activeWorkout?.id || activeWorkout.id === hydratedActiveWorkoutId) return
    const rows = (activeWorkout.exercises || []).length
      ? activeWorkout.exercises.map((exercise) => createRowFromExercise(exercise.name, historyMap, exercises, exercise))
      : [createRowFromExercise(recentExerciseNames[0] || "Bench Press", historyMap, exercises)]

    setForm({
      date: activeWorkout.date || todayISO(),
      workout_type: activeWorkout.name || "",
      duration_minutes: activeWorkout.started_at ? String(Math.max(0, Math.round((Date.now() - new Date(activeWorkout.started_at).getTime()) / 60000))) : "",
      notes: "",
      completed: true,
    })
    setSetRows(rows)
    setHydratedActiveWorkoutId(activeWorkout.id)
  }, [activeWorkout, exercises, existingWorkout, historyMap, hydratedActiveWorkoutId, recentExerciseNames])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const updateRow = (index, updater) => {
    setSetRows((current) => current.map((row, rowIndex) => rowIndex === index ? updater(row) : row))
  }

  const updateSetCount = (index, value) => {
    updateRow(index, (row) => {
      const nextSets = Math.max(1, Math.min(12, Number(value) || 1))
      return {
        ...row,
        sets: nextSets,
        actual_sets: makeActualSets(nextSets, row.rep_max, row.actual_sets[0]?.weight_kg || 0, row.actual_sets),
      }
    })
  }

  const updateActualSet = (rowIndex, setIndex, key, value) => {
    updateRow(rowIndex, (row) => ({
      ...row,
      actual_sets: row.actual_sets.map((set, index) => index === setIndex ? { ...set, [key]: value } : set),
    }))
  }

  const selectExercise = (index, exerciseName) => {
    const nextRow = createRowFromExercise(exerciseName, historyMap, exercises)
    updateRow(index, () => nextRow)
  }

  const chooseExercise = (index, exerciseName) => {
    selectExercise(index, exerciseName)
    setOpenPickerRow(-1)
    setExerciseSearch((current) => ({ ...current, [index]: "" }))
  }

  const addSetRow = (exerciseName = "") => setSetRows((current) => [
    ...current,
    createRowFromExercise(exerciseName || recentExerciseNames[0] || "", historyMap, exercises),
  ])

  const removeSetRow = (index) => setSetRows((current) => current.filter((_, rowIndex) => rowIndex !== index))

  const startRestTimer = (rowIndex, seconds) => {
    setRestTimer({ rowIndex, remaining: Math.max(15, Number(seconds) || 90) })
  }

  const save = (event) => {
    event.preventDefault()
    const validationError = setRows.map(validateRow).find(Boolean)
    if (validationError) {
      setStatus(validationError)
      return
    }

    const sessionId = existingWorkout?.id || activeWorkout?.session_id || uid("workout")
    const workoutName = form.workout_type.trim() || existingWorkout?.workout_type || activeWorkout?.name || setRows.map((row) => row.exercise_name).filter(Boolean).join(", ") || "Workout"
    const durationMinutes = Number(form.duration_minutes) || (!existingWorkout?.id && activeWorkout.started_at ? Math.max(0, Math.round((Date.now() - new Date(activeWorkout.started_at).getTime()) / 60000)) : 0)

    const structuredSets = setRows.flatMap((row) => row.actual_sets.map((set, index) => ({
      id: uid("set"),
      session_id: sessionId,
      exercise_name: row.exercise_name || "Exercise",
      muscle_group: row.muscle_group || "full_body",
      set_number: index + 1,
      reps: Number(set.reps) || 0,
      weight_kg: Number(set.weight_kg) || 0,
      duration_seconds: 0,
      distance_km: 0,
      notes: `${form.notes}${form.notes ? " | " : ""}Target ${row.rep_min}-${row.rep_max} reps, rest ${row.rest_seconds}s`,
      date: form.date,
    })))
    const previousSets = workoutSets.filter((set) => set.session_id !== sessionId)
    const prNotes = detectSessionRecords(structuredSets, previousSets)

    const nextWorkout = {
      ...form,
      id: sessionId,
      workout_type: workoutName,
      duration_minutes: durationMinutes,
      notes: [form.notes, ...prNotes].filter(Boolean).join("\n"),
      completed: true,
    }
    const nextWorkouts = workouts.some((workout) => workout.id === sessionId)
      ? workouts.map((workout) => workout.id === sessionId ? nextWorkout : workout)
      : [nextWorkout, ...workouts]
    const nextWorkoutSets = [...structuredSets, ...workoutSets.filter((set) => set.session_id !== sessionId)]

    writeAppRecordSync(storageKeys.workouts, nextWorkouts)
    writeAppRecordSync(storageKeys.workoutSets, nextWorkoutSets)
    if (!existingWorkout?.id) writeAppRecordSync(storageKeys.activeWorkout, emptyActiveWorkout)

    setWorkouts(nextWorkouts)
    setWorkoutSets(nextWorkoutSets)
    if (!existingWorkout?.id) setActiveWorkout(emptyActiveWorkout)
    setStatus("")
    onSaved?.(nextWorkout, structuredSets)
    onClose?.()
  }

  return (
    <form onSubmit={save} className={standalone ? "mx-auto max-w-4xl p-4" : ""}>
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{existingWorkout?.id ? "Edit workout log" : "Log workout"}</h2>
            <p className="text-sm text-slate-500">Use exercise history, current-session targets, and real set-by-set logging.</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </button>
          )}
        </div>

        {activeWorkout?.id && !existingWorkout?.id && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-800">Active session loaded</p>
            <p className="mt-1 text-sm text-slate-700">{activeWorkout.name} with {(activeWorkout.exercises || []).length} planned exercise(s).</p>
          </div>
        )}

        {!!recentExerciseNames.length && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles size={16} className="text-indigo-600" />
              Quick add from recent history
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recentExerciseNames.slice(0, 8).map((exerciseName) => (
                <button key={exerciseName} type="button" onClick={() => addSetRow(exerciseName)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  {exerciseName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3">
          <input value={form.workout_type} onChange={(event) => update("workout_type", event.target.value)} placeholder="Workout name" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
            <input value={form.duration_minutes} onChange={(event) => update("duration_minutes", event.target.value)} inputMode="decimal" placeholder="Minutes" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
          </div>

          <div className="space-y-4">
            {setRows.map((row, index) => {
              const history = historyMap[String(row.exercise_name || "").trim().toLowerCase()]
              const isTimerRow = restTimer.rowIndex === index && restTimer.remaining > 0
              const searchTerm = exerciseSearch[index] || ""
              const matchingExercises = getExerciseAutocompleteOptions({ query: searchTerm, exercises, workoutSets })

              return (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setOpenPickerRow((current) => current === index ? -1 : index)}
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-slate-950"
                      >
                        <span className="block text-sm font-semibold">
                          {row.exercise_name || "Select exercise"}
                        </span>
                        <span className="mt-1 block text-sm text-slate-500">
                          Tap to choose from your library and history
                        </span>
                      </button>
                      {openPickerRow === index && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                            <Search size={16} />
                            <input
                              value={exerciseSearch[index] || ""}
                              onChange={(event) => setExerciseSearch((current) => ({ ...current, [index]: event.target.value }))}
                              placeholder="Search exercises"
                              className="w-full bg-transparent text-slate-950"
                            />
                          </label>
                          <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                            {matchingExercises.map((exercise) => (
                              <button
                                key={exercise.id}
                                type="button"
                                onClick={() => chooseExercise(index, exercise.name)}
                                className={`w-full rounded-lg border px-3 py-3 text-left ${
                                  exercise.name === row.exercise_name
                                    ? "border-indigo-500 bg-indigo-50 text-indigo-950"
                                    : "border-slate-200 bg-white text-slate-700"
                                }`}
                              >
                                <span className="block text-sm font-semibold">{exercise.name}</span>
                                <span className="mt-1 block text-sm text-slate-500">
                                  {(exercise.category || "general").replace("_", " ")}
                                  {exercise.history?.sessionCount ? ` - ${exercise.history.sessionCount} sessions` : ""}
                                </span>
                              </button>
                            ))}
                            {!matchingExercises.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">No matching exercises yet.</p>}
                          </div>
                        </div>
                      )}
                      {history && (
                        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                          <p>Latest {history.latest?.weight_kg || 0}kg x {history.latest?.reps || 0}. Best {history.bestWeight || 0}kg.</p>
                          <p className="mt-1">Suggested working load: {history.suggestedWeight || history.bestWeight || history.latest?.weight_kg || 0}kg.</p>
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => removeSetRow(index)} disabled={setRows.length === 1} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600 disabled:opacity-40">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <label className="grid gap-1 text-sm text-slate-600">Sets<input type="number" min="1" max="12" value={row.sets} onChange={(event) => updateSetCount(index, event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" /></label>
                    <label className="grid gap-1 text-sm text-slate-600">Rep min<input type="number" min="0" max="50" value={row.rep_min} onChange={(event) => updateRow(index, (current) => ({ ...current, rep_min: Number(event.target.value) || 0 }))} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" /></label>
                    <label className="grid gap-1 text-sm text-slate-600">Rep max<input type="number" min="0" max="50" value={row.rep_max} onChange={(event) => updateRow(index, (current) => ({ ...current, rep_max: Number(event.target.value) || 0 }))} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" /></label>
                    <label className="grid gap-1 text-sm text-slate-600">Rest sec<input type="number" min="15" max="600" value={row.rest_seconds} onChange={(event) => updateRow(index, (current) => ({ ...current, rest_seconds: Number(event.target.value) || 90 }))} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" /></label>
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Actual sets</p>
                      <button type="button" onClick={() => startRestTimer(index, row.rest_seconds)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        <TimerReset size={16} /> {isTimerRow ? `${restTimer.remaining}s` : `Rest ${row.rest_seconds}s`}
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {row.actual_sets.map((set, setIndex) => (
                        <div key={setIndex} className="grid grid-cols-[72px_1fr_1fr] gap-2">
                          <div className="flex items-center rounded-lg bg-white px-3 text-sm font-semibold text-slate-500">Set {setIndex + 1}</div>
                          <input value={set.reps} onChange={(event) => updateActualSet(index, setIndex, "reps", event.target.value)} inputMode="decimal" placeholder="Reps" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                          <input value={set.weight_kg} onChange={(event) => updateActualSet(index, setIndex, "weight_kg", event.target.value)} inputMode="decimal" placeholder="kg" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <button type="button" onClick={() => addSetRow()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"><Plus size={16} /> Add exercise</button>
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Notes" className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
        </div>
        {status && <p className="mt-3 text-sm font-semibold text-rose-700">{status}</p>}
        <button type="submit" className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white">
          <Check size={18} /> {existingWorkout?.id ? "Save changes" : "Save workout"}
        </button>
      </div>
    </form>
  )
}
