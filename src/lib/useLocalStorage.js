import { useCallback, useEffect, useState } from "react"
import { clearAppRecords, getAppRecord, getCachedAppRecord, primeAppRecordCache, setAppRecord, writeAppRecordSync } from "@/lib/appStorage"
import { syncKeyToCloud } from "@/lib/cloudSync"

function readLegacyValue(key, initialValue) {
  if (typeof window === "undefined") return initialValue

  const cached = getCachedAppRecord(key)
  if (cached !== undefined) return cached

  try {
    const item = window.localStorage.getItem(key)
    return item ? JSON.parse(item) : initialValue
  } catch {
    return initialValue
  }
}

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => readLegacyValue(key, initialValue))

  const setStoredValue = useCallback(
    (nextValue) => {
      setValue((currentValue) => {
        const resolvedValue = typeof nextValue === "function" ? nextValue(currentValue) : nextValue
        primeAppRecordCache(key, resolvedValue)
        try {
          writeAppRecordSync(key, resolvedValue)
        } catch {
          // Ignore sync write failures and let the async store path try next.
        }
        const persist = async () => {
          try {
            await setAppRecord(key, resolvedValue)
            await syncKeyToCloud(key, resolvedValue)
          } finally {
            window.dispatchEvent(new CustomEvent("apexai-storage", { detail: { key } }))
          }
        }
        void persist()
        return resolvedValue
      })
    },
    [key]
  )

  useEffect(() => {
    let cancelled = false
    const syncValue = async () => {
      const storedValue = await getAppRecord(key, initialValue)
      if (!cancelled) setValue(storedValue)
    }
    void syncValue()
    window.addEventListener("storage", syncValue)
    window.addEventListener("apexai-storage", syncValue)
    return () => {
      cancelled = true
      window.removeEventListener("storage", syncValue)
      window.removeEventListener("apexai-storage", syncValue)
    }
  }, [initialValue, key])

  return [value, setStoredValue]
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function uid(prefix = "item") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function resetApexData() {
  if (typeof window === "undefined") return

  await clearAppRecords()
  window.dispatchEvent(new CustomEvent("apexai-storage", { detail: { key: "*" } }))
}
