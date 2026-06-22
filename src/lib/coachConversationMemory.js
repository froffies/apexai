const RECALL_CUE_PATTERN = /\b(?:remember|earlier|before|previous(?:ly)?|last time|last week|yesterday|an hour ago|hours ago|days ago|we talked|we spoke|you said|you told me|your advice|what did you say|what was that|what advice|remind me|carry on|continue|pick up where we left off|same as before|back to that)\b/i
const FOLLOW_UP_CUE_PATTERN = /^(?:and|also|plus|then|but|so|it|that|same|continue|go on|what about|about that|as for|the rest)\b/i
const ASSISTANT_REFERENCE_PATTERN = /\b(?:you said|you told me|your advice|what were you saying|what did you say)\b/i
const TOKEN_SPLIT_PATTERN = /[^a-z0-9]+/i
const FOOD_MEASURE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|cup|cups|tbsp|tsp|slice|slices|serve|serves|serving|servings|bowl|bowls|plate|plates|mug|mugs)\b/i
const WORKOUT_MEASURE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:kg|reps?|sets?|km|min|mins|minutes)\b/i
const QUANTITY_ONLY_REPLY_PATTERN = /^(?:(?:about|around|roughly)\s+)?(?:(?:\d+(?:\.\d+)?)\s*(?:g|kg|ml|l|cup|cups|tbsp|tsp|slice|slices|serve|serves|serving|servings|bowl|bowls|plate|plates|mug|mugs|kg|reps?|sets?|km|min|mins|minutes)?|half|quarter|one|two|three|four|five|six|seven|eight|nine|ten)$/i

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "back",
  "be",
  "before",
  "but",
  "by",
  "can",
  "day",
  "days",
  "did",
  "do",
  "earlier",
  "for",
  "from",
  "go",
  "had",
  "have",
  "how",
  "hour",
  "hours",
  "i",
  "it",
  "left",
  "me",
  "many",
  "much",
  "my",
  "of",
  "on",
  "or",
  "said",
  "same",
  "so",
  "talked",
  "that",
  "the",
  "then",
  "thing",
  "this",
  "to",
  "told",
  "we",
  "were",
  "what",
  "where",
  "with",
  "was",
  "you",
  "your",
])

function cleanText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function extractTokens(text = "") {
  return cleanText(text)
    .split(TOKEN_SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

function extractNumbers(text = "") {
  return cleanText(text).match(/\d+(?:\.\d+)?/g) || []
}

function overlapCount(left = [], right = []) {
  if (!left.length || !right.length) return 0
  const rightSet = new Set(right)
  return left.reduce((total, token) => total + (rightSet.has(token) ? 1 : 0), 0)
}

function normalizeMessage(message = {}) {
  const role = String(message?.role || "").trim().toLowerCase() === "assistant" ? "assistant" : "user"
  const content = String(message?.content || "").trim()
  const timestamp = typeof message?.timestamp === "string" ? message.timestamp.trim() : ""
  if (!content) return null
  return timestamp ? { role, content, timestamp } : { role, content }
}

function expandNeighborIndexes(messages, indexes = []) {
  const selected = new Set()
  for (const index of indexes) {
    if (index < 0 || index >= messages.length) continue
    selected.add(index)
    if (messages[index]?.role === "assistant" && index > 0 && messages[index - 1]?.role === "user") {
      selected.add(index - 1)
    }
    if (messages[index]?.role === "user" && index + 1 < messages.length && messages[index + 1]?.role === "assistant") {
      selected.add(index + 1)
    }
  }
  return [...selected].sort((left, right) => left - right)
}

export function looksLikeCoachMemoryReference(text = "") {
  const normalized = cleanText(text)
  if (!normalized) return false
  return RECALL_CUE_PATTERN.test(normalized) || FOLLOW_UP_CUE_PATTERN.test(normalized)
}

export function buildRecalledCoachMessages(messages = [], currentMessage = "", {
  recentLimit = 20,
  recallLimit = 6,
  scoreLimit = 3,
} = {}) {
  const normalizedMessages = Array.isArray(messages)
    ? messages.map(normalizeMessage).filter(Boolean)
    : []
  if (!normalizedMessages.length) return []

  const olderMessages = normalizedMessages.slice(0, Math.max(0, normalizedMessages.length - recentLimit))
  if (!olderMessages.length) return []

  const normalizedCurrent = cleanText(currentMessage)
  if (!normalizedCurrent) return []

  const currentTokens = extractTokens(normalizedCurrent)
  const currentNumbers = extractNumbers(normalizedCurrent)
  const strongCue = RECALL_CUE_PATTERN.test(normalizedCurrent)
  const followUpCue = FOLLOW_UP_CUE_PATTERN.test(normalizedCurrent) || QUANTITY_ONLY_REPLY_PATTERN.test(normalizedCurrent)
  const assistantCue = ASSISTANT_REFERENCE_PATTERN.test(normalizedCurrent)
  const foodMeasureCue = FOOD_MEASURE_PATTERN.test(normalizedCurrent)
  const workoutMeasureCue = WORKOUT_MEASURE_PATTERN.test(normalizedCurrent)

  const scored = olderMessages
    .map((message, index) => {
      const messageTokens = extractTokens(message.content)
      const tokenOverlap = overlapCount(currentTokens, messageTokens)
      const numberOverlap = overlapCount(currentNumbers, extractNumbers(message.content))
      const normalizedMessage = cleanText(message.content)
      const containsExactLead = normalizedCurrent.length >= 12 && (
        normalizedMessage.includes(normalizedCurrent)
        || normalizedCurrent.includes(normalizedMessage)
      )
      let score = tokenOverlap * 3
      score += numberOverlap * 2
      if (containsExactLead) score += 5
      if (assistantCue && message.role === "assistant") score += 2
      if (followUpCue && index >= olderMessages.length - 6) score += 2
      if (strongCue && index >= olderMessages.length - 10) score += 1
      if (foodMeasureCue && /\bhow much\b/i.test(message.content)) score += 2
      if (workoutMeasureCue && /\b(?:how many|what weight|how much weight)\b/i.test(message.content)) score += 2
      if (/^(?:how much|how many|what kind|what type|what weight|which one)\b/i.test(message.content) && followUpCue) {
        score += 1
      }
      return { index, score }
    })
    .filter((entry) => entry.score >= scoreLimit)
    .sort((left, right) => right.score - left.score || right.index - left.index)

  if (!scored.length) {
    if (!strongCue && !followUpCue) return []
    return olderMessages.slice(-Math.min(recallLimit, 4))
  }

  const seedIndexes = scored.slice(0, Math.min(3, scored.length)).map((entry) => entry.index)
  const expandedIndexes = expandNeighborIndexes(olderMessages, seedIndexes)
  return expandedIndexes
    .slice(-recallLimit)
    .map((index) => olderMessages[index])
}

export function mergeRecalledCoachMessages(recentMessages = [], recalledMessages = [], maxMessages = 24) {
  const merged = []
  const seen = new Set()
  for (const rawMessage of [...recalledMessages, ...recentMessages]) {
    const message = normalizeMessage(rawMessage)
    if (!message) continue
    const key = `${message.role}|${message.timestamp || ""}|${cleanText(message.content)}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(message)
  }
  return merged.slice(-maxMessages)
}
