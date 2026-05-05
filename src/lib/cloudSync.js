import { supabase, supabaseConfigured } from "@/lib/supabaseClient"
import { listAppRecords, setAppRecord } from "@/lib/appStorage"
import { recordTelemetry } from "@/lib/telemetry"

const dataPrefix = "apexai."
const schemaVersion = 1
const cloudExcludedKeys = new Set([
  "apexai.telemetry.buffer",
  "apexai.coachMealSession",
  "apexai.coachWorkoutSession",
])
let cloudUser = null
let syncPaused = false
let syncState = {
  pending: 0,
  failed: 0,
  queuedKeys: [],
  lastSyncedAt: "",
  lastError: "",
  conflicts: [],
}

function emitSyncState() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("apexai-cloud-sync", { detail: syncState }))
  }
}

function setSyncState(updater) {
  syncState = typeof updater === "function" ? updater(syncState) : updater
  emitSyncState()
}

export function getCloudSyncState() {
  return syncState
}

export function subscribeCloudSync(listener) {
  if (typeof window === "undefined") return () => undefined
  const handler = (event) => listener(event.detail)
  window.addEventListener("apexai-cloud-sync", handler)
  listener(syncState)
  return () => window.removeEventListener("apexai-cloud-sync", handler)
}

export function isCloudConfigured() {
  return supabaseConfigured
}

export function setCloudUser(user) {
  cloudUser = user
}

export function getCloudUser() {
  return cloudUser
}

export async function getCloudAccessToken() {
  if (!supabase) return ""
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ""
}

export async function readAllLocalState() {
  return listAppRecords()
}

function shouldSyncKey(key) {
  return key.startsWith(dataPrefix) && !cloudExcludedKeys.has(key)
}

const mergeableCollectionKeys = new Set([
  "apexai.meals",
  "apexai.workouts",
  "apexai.progress",
  "apexai.photos",
  "apexai.habits",
  "apexai.shopping",
  "apexai.recipes",
  "apexai.favoriteFoods",
  "apexai.recentFoods",
  "apexai.exercises",
  "apexai.challenges",
  "apexai.workoutSets",
  "apexai.workoutPlans",
  "apexai.mealPlans",
  "apexai.achievements",
  "apexai.chat",
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stableStringify(value) {
  if (!isPlainObject(value)) return JSON.stringify(value)
  return JSON.stringify(value, Object.keys(value).sort())
}

function collectionIdentity(item) {
  if (!isPlainObject(item)) return stableStringify(item)
  if (item.id) return `id:${item.id}`
  if (item.date && item.food_name) return `meal:${item.date}:${item.meal_type || ""}:${item.food_name}`
  if (item.date && item.workout_type) return `workout:${item.date}:${item.workout_type}`
  if (item.date && item.title) return `plan:${item.date}:${item.title}`
  if (item.date && item.habit) return `habit:${item.date}:${item.habit}`
  return `json:${stableStringify(item)}`
}

function analyzeCollectionMerge(localValue = [], cloudValue = []) {
  const localMap = new Map(localValue.map((item) => [collectionIdentity(item), item]))
  const cloudMap = new Map(cloudValue.map((item) => [collectionIdentity(item), item]))
  const identities = new Set([...localMap.keys(), ...cloudMap.keys()])
  const merged = []
  const collisions = []
  let localOnlyCount = 0
  let cloudOnlyCount = 0

  for (const identity of identities) {
    const localItem = localMap.get(identity)
    const cloudItem = cloudMap.get(identity)

    if (localItem && cloudItem) {
      if (JSON.stringify(localItem) === JSON.stringify(cloudItem)) merged.push(localItem)
      else {
        collisions.push({ identity, localItem, cloudItem })
        merged.push(localItem)
      }
      continue
    }

    if (localItem) {
      localOnlyCount += 1
      merged.push(localItem)
      continue
    }

    cloudOnlyCount += 1
    merged.push(cloudItem)
  }

  return { merged, collisions, localOnlyCount, cloudOnlyCount }
}

export function analyzeSyncConflict(key, localValue, cloudValue, cloudUpdatedAt = "") {
  if (localValue === undefined) return null
  if (JSON.stringify(localValue) === JSON.stringify(cloudValue)) return null

  if (mergeableCollectionKeys.has(key) && Array.isArray(localValue) && Array.isArray(cloudValue)) {
    const merge = analyzeCollectionMerge(localValue, cloudValue)
    return {
      key,
      kind: "mergeable_collection",
      localValue,
      cloudValue,
      cloudUpdatedAt,
      collisions: merge.collisions,
      localOnlyCount: merge.localOnlyCount,
      cloudOnlyCount: merge.cloudOnlyCount,
      suggestedValue: merge.merged,
      canAutoMerge: true,
    }
  }

  if (isPlainObject(localValue) && isPlainObject(cloudValue)) {
    return {
      key,
      kind: "mergeable_object",
      localValue,
      cloudValue,
      cloudUpdatedAt,
      collisions: [],
      localOnlyCount: 0,
      cloudOnlyCount: 0,
      suggestedValue: { ...cloudValue, ...localValue },
      canAutoMerge: true,
    }
  }

  return {
    key,
    kind: "manual",
    localValue,
    cloudValue,
    cloudUpdatedAt,
    collisions: [],
    localOnlyCount: 0,
    cloudOnlyCount: 0,
    suggestedValue: null,
    canAutoMerge: false,
  }
}

export function reconcileSyncConflicts(localState = {}, cloudRows = []) {
  return cloudRows.reduce((result, row) => {
    if (!shouldSyncKey(row.storage_key)) return result
    const analysis = analyzeSyncConflict(row.storage_key, localState[row.storage_key], row.value, row.updated_at || "")
    if (!analysis) return result
    if (analysis.canAutoMerge) result.autoMerges.push(analysis)
    else result.conflicts.push(analysis)
    return result
  }, { conflicts: [], autoMerges: [] })
}

export function findSyncConflicts(localState = {}, cloudRows = []) {
  return reconcileSyncConflicts(localState, cloudRows).conflicts
}

export async function hydrateCloudState() {
  if (!supabase || !cloudUser || typeof window === "undefined") return 0

  const { data, error } = await supabase
    .from("user_app_state")
    .select("storage_key,value")
    .eq("user_id", cloudUser.id)

  if (error) throw error

  const localState = await readAllLocalState()
  const syncableCloudRows = (data || []).filter((row) => shouldSyncKey(row.storage_key))
  const { conflicts, autoMerges } = reconcileSyncConflicts(localState, syncableCloudRows)
  const conflictKeys = new Set(conflicts.map((conflict) => conflict.key))
  const autoMergeMap = new Map(autoMerges.map((merge) => [merge.key, merge]))
  syncPaused = true
  for (const row of syncableCloudRows) {
    if (conflictKeys.has(row.storage_key)) continue
    const merge = autoMergeMap.get(row.storage_key)
    await setAppRecord(row.storage_key, merge ? merge.suggestedValue : row.value)
  }
  syncPaused = false
  for (const merge of autoMerges) {
    await syncKeyToCloud(merge.key, merge.suggestedValue)
  }
  if (conflicts.length) {
    recordTelemetry("sync_conflict_detected", { keys: conflicts.map((conflict) => conflict.key) }, "error")
  }
  if (autoMerges.length) {
    recordTelemetry("sync_auto_merged", {
      keys: autoMerges.map((merge) => merge.key),
      counts: autoMerges.map((merge) => ({
        key: merge.key,
        localOnlyCount: merge.localOnlyCount,
        cloudOnlyCount: merge.cloudOnlyCount,
      })),
    })
  }
  setSyncState((current) => ({
    ...current,
    conflicts,
    lastSyncedAt: new Date().toISOString(),
    lastError: conflicts.length ? "Sync conflicts need review." : "",
  }))
  window.dispatchEvent(new CustomEvent("apexai-storage", { detail: { key: "*" } }))
  return syncableCloudRows.length
}

export async function syncKeyToCloud(key, value) {
  if (syncPaused || !supabase || !cloudUser || !shouldSyncKey(key)) return

  setSyncState((current) => ({
    ...current,
    pending: current.pending + 1,
    queuedKeys: current.queuedKeys.includes(key) ? current.queuedKeys : [...current.queuedKeys, key],
  }))

  try {
    const { error } = await supabase.from("user_app_state").upsert(
      {
        user_id: cloudUser.id,
        storage_key: key,
        value,
        schema_version: schemaVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,storage_key" }
    )
    if (error) throw error

    setSyncState((current) => ({
      ...current,
      pending: Math.max(0, current.pending - 1),
      queuedKeys: current.queuedKeys.filter((queuedKey) => queuedKey !== key),
      failed: 0,
      lastSyncedAt: new Date().toISOString(),
      lastError: "",
    }))
  } catch (error) {
    recordTelemetry("cloud_sync_failed", { key, message: error instanceof Error ? error.message : "Cloud sync failed" }, "error")
    setSyncState((current) => ({
      ...current,
      pending: Math.max(0, current.pending - 1),
      failed: current.failed + 1,
      lastError: error instanceof Error ? error.message : "Cloud sync failed",
    }))
  }
}

export async function syncAllLocalToCloud() {
  if (!supabase || !cloudUser) return
  const state = await readAllLocalState()
  const rows = Object.entries(state)
    .filter(([storage_key]) => shouldSyncKey(storage_key))
    .map(([storage_key, value]) => ({
      user_id: cloudUser.id,
      storage_key,
      value,
      schema_version: schemaVersion,
      updated_at: new Date().toISOString(),
    }))
  if (!rows.length) return

  setSyncState((current) => ({ ...current, pending: current.pending + rows.length }))
  const { error } = await supabase.from("user_app_state").upsert(rows, { onConflict: "user_id,storage_key" })
  if (error) {
    recordTelemetry("cloud_sync_bulk_failed", { message: error.message, count: rows.length }, "error")
    setSyncState((current) => ({
      ...current,
      pending: Math.max(0, current.pending - rows.length),
      failed: current.failed + rows.length,
      queuedKeys: rows.map((row) => row.storage_key),
      lastError: error.message,
    }))
    throw error
  }

  setSyncState((current) => ({
    ...current,
    pending: Math.max(0, current.pending - rows.length),
    queuedKeys: [],
    failed: 0,
    conflicts: [],
    lastSyncedAt: new Date().toISOString(),
    lastError: "",
  }))
}

export async function deleteCloudState() {
  if (!supabase || !cloudUser) return
  await supabase.from("user_app_state").delete().eq("user_id", cloudUser.id)
  setSyncState({ pending: 0, failed: 0, queuedKeys: [], lastSyncedAt: "", lastError: "", conflicts: [] })
}

export async function resolveSyncConflictWithCloud(key) {
  const conflict = syncState.conflicts.find((item) => item.key === key)
  if (!conflict) return
  syncPaused = true
  await setAppRecord(key, conflict.cloudValue)
  syncPaused = false
  setSyncState((current) => ({
    ...current,
    conflicts: current.conflicts.filter((item) => item.key !== key),
    lastError: current.conflicts.length > 1 ? "Sync conflicts need review." : "",
    lastSyncedAt: new Date().toISOString(),
  }))
  window.dispatchEvent(new CustomEvent("apexai-storage", { detail: { key } }))
}

export async function resolveSyncConflictWithLocal(key) {
  const conflict = syncState.conflicts.find((item) => item.key === key)
  if (!conflict) return
  await syncKeyToCloud(key, conflict.localValue)
  setSyncState((current) => ({
    ...current,
    conflicts: current.conflicts.filter((item) => item.key !== key),
    lastError: current.conflicts.length > 1 ? "Sync conflicts need review." : "",
  }))
}

export async function resolveSyncConflictWithSuggestedMerge(key) {
  const conflict = syncState.conflicts.find((item) => item.key === key)
  if (!conflict?.suggestedValue) return
  syncPaused = true
  await setAppRecord(key, conflict.suggestedValue)
  syncPaused = false
  await syncKeyToCloud(key, conflict.suggestedValue)
  setSyncState((current) => ({
    ...current,
    conflicts: current.conflicts.filter((item) => item.key !== key),
    lastError: current.conflicts.length > 1 ? "Sync conflicts need review." : "",
    lastSyncedAt: new Date().toISOString(),
  }))
  window.dispatchEvent(new CustomEvent("apexai-storage", { detail: { key } }))
}
