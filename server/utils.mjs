/**
 * server/utils.mjs
 *
 * Shared low-level utility functions used across the server layer.
 * No business logic. No imports from other server modules.
 *
 * Exported:
 *   cleanText       — normalise a string to lowercase, collapsed whitespace, smart-quote safe
 *   safeArray       — safely slice an unknown value to an array with a limit
 *   safeNumber      — parse a numeric value, returning a fallback on failure
 *   roundMacro      — round a macro value to one decimal place
 *   titleCase       — convert a string to Title Case
 *   escapeRegex     — escape special regex characters in a string
 */

export function cleanText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function safeArray(value, limit = 100) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

/**
 * Parse a numeric value.
 * Strips commas so "1,200" parses correctly.
 * Returns null (not 0) on failure so callers can distinguish "missing" from "zero".
 */
export function safeNumber(value, fallback = null) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : fallback
}

export function roundMacro(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

export function titleCase(text = "") {
  return String(text || "")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

export function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
