import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPersistedMealSession,
  buildPersistedWorkoutSession,
  createEmptyMealSession,
  createEmptyWorkoutSession,
  resolveCoachSessionStates,
} from "../src/lib/coachSessionMerge.js"

test("resolveCoachSessionStates preserves pending meal context when only a workout save succeeds", () => {
  const currentMealSession = {
    ...createEmptyMealSession(),
    active: true,
    mealConversation: true,
    summary: "steak",
    clarifyQuestion: "How much steak did you have?",
    pendingClarification: {
      type: "quantity",
      targetBaseName: "steak",
    },
  }
  const persistedWorkoutSession = buildPersistedWorkoutSession(
    {
      ...createEmptyWorkoutSession(),
      active: true,
      workoutConversation: true,
      summary: "Squat 100kg for 1 set of 5",
      exercise_name: "Squat",
      workout_type: "Squat",
      reps: 5,
      weight_kg: 100,
    },
    {
      exercise_name: "Squat",
      workout_type: "Squat",
      sets: 1,
      reps: 5,
      weight_kg: 100,
    },
    "workout-1",
  )

  const resolved = resolveCoachSessionStates({
    currentMealSession,
    currentWorkoutSession: null,
    nextMealSession: null,
    nextWorkoutSession: null,
    workoutSaveSucceeded: true,
    persistedWorkoutSession,
  })

  assert.equal(resolved.mealSession.summary, "steak")
  assert.equal(resolved.mealSession.clarifyQuestion, "How much steak did you have?")
  assert.equal(resolved.mealSession.pendingClarification?.targetBaseName, "steak")
  assert.equal(resolved.workoutSession.persistedWorkoutId, "workout-1")
  assert.equal(resolved.workoutSession.exercise_name, "Squat")
})

test("resolveCoachSessionStates preserves persisted workout context when only a meal save succeeds", () => {
  const currentWorkoutSession = {
    ...createEmptyWorkoutSession(),
    persisted: true,
    persistedWorkoutId: "workout-1",
    persistedSummary: "Pushups for 1 set of 4",
    exercise_name: "Pushups",
    workout_type: "Pushups",
    summary: "Pushups for 1 set of 4",
  }
  const persistedMealSession = buildPersistedMealSession(
    {
      ...createEmptyMealSession(),
      active: true,
      mealConversation: true,
      summary: "18 eggs",
    },
    { food_name: "18 eggs" },
    "meal-1",
  )

  const resolved = resolveCoachSessionStates({
    currentMealSession: null,
    currentWorkoutSession,
    nextMealSession: null,
    nextWorkoutSession: null,
    mealSaveSucceeded: true,
    persistedMealSession,
  })

  assert.equal(resolved.mealSession.persistedMealId, "meal-1")
  assert.equal(resolved.mealSession.persistedSummary, "18 eggs")
  assert.equal(resolved.workoutSession.persistedWorkoutId, "workout-1")
  assert.equal(resolved.workoutSession.exercise_name, "Pushups")
})

test("resolveCoachSessionStates clears deleted domains while preserving the untouched side", () => {
  const resolved = resolveCoachSessionStates({
    currentMealSession: {
      ...createEmptyMealSession(),
      persisted: true,
      persistedMealId: "meal-1",
      persistedSummary: "burger",
      summary: "burger",
    },
    currentWorkoutSession: {
      ...createEmptyWorkoutSession(),
      persisted: true,
      persistedWorkoutId: "workout-1",
      persistedSummary: "Bench 80kg",
      summary: "Bench 80kg",
    },
    nextMealSession: null,
    nextWorkoutSession: null,
    mealDeleted: true,
  })

  assert.equal(resolved.mealSession.persistedMealId, "")
  assert.equal(resolved.mealSession.summary, "")
  assert.equal(resolved.workoutSession.persistedWorkoutId, "workout-1")
})
