const dbName = "apexai-db"
const storeName = "records"
const dataPrefix = "apexai."
let dbPromise = null
const memoryRecords = new Map()

export function primeAppRecordCache(key, value) {
  memoryRecords.set(key, value)
}

export function writeAppRecordSync(key, value) {
  memoryRecords.set(key, value)
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function getCachedAppRecord(key) {
  return memoryRecords.get(key)
}

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window
}

function openDb() {
  if (!canUseIndexedDb()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

async function withStore(mode, callback) {
  const db = await openDb()
  if (!db) return callback(null)

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    let result
    try {
      result = callback(store)
    } catch (error) {
      reject(error)
      return
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
  })
}

function readLegacyLocalStorage(key) {
  if (typeof window === "undefined") return undefined
  const item = window.localStorage.getItem(key)
  if (item === null) return undefined
  try {
    return JSON.parse(item)
  } catch {
    return undefined
  }
}

export async function getAppRecord(key, fallbackValue) {
  if (!key.startsWith(dataPrefix)) return fallbackValue
  if (memoryRecords.has(key)) return memoryRecords.get(key)
  const db = await openDb()
  if (!db) return readLegacyLocalStorage(key) ?? fallbackValue

  const value = await withStore("readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  })

  if (value !== undefined) {
    memoryRecords.set(key, value)
    return value
  }

  const legacy = readLegacyLocalStorage(key)
  if (legacy !== undefined) {
    memoryRecords.set(key, legacy)
    await setAppRecord(key, legacy)
    window.localStorage.removeItem(key)
    return legacy
  }

  return fallbackValue
}

export async function setAppRecord(key, value) {
  memoryRecords.set(key, value)
  if (!key.startsWith(dataPrefix)) {
    window.localStorage.setItem(key, JSON.stringify(value))
    return
  }

  const db = await openDb()
  if (!db) {
    window.localStorage.setItem(key, JSON.stringify(value))
    return
  }

  await withStore("readwrite", (store) => store.put(value, key))
  window.localStorage.removeItem(key)
}

export async function removeAppRecord(key) {
  memoryRecords.delete(key)
  const db = await openDb()
  if (db) await withStore("readwrite", (store) => store.delete(key))
  window.localStorage.removeItem(key)
}

export async function listAppRecords() {
  const records = {}
  const db = await openDb()

  if (db) {
    await withStore("readonly", (store) => {
      return new Promise((resolve, reject) => {
        const request = store.openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            resolve()
            return
          }
          if (String(cursor.key).startsWith(dataPrefix)) {
            records[cursor.key] = cursor.value
            memoryRecords.set(cursor.key, cursor.value)
          }
          cursor.continue()
        }
        request.onerror = () => reject(request.error)
      })
    })
  }

  if (typeof window !== "undefined") {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(dataPrefix))
      .forEach((key) => {
        try {
          records[key] = JSON.parse(window.localStorage.getItem(key) || "null")
          memoryRecords.set(key, records[key])
        } catch {
          records[key] = null
          memoryRecords.set(key, null)
        }
      })
  }

  return records
}

export async function clearAppRecords() {
  memoryRecords.clear()
  const db = await openDb()
  if (db) await withStore("readwrite", (store) => store.clear())
  if (typeof window !== "undefined") {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(dataPrefix))
      .forEach((key) => window.localStorage.removeItem(key))
  }
}
