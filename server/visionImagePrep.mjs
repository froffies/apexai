import sharp from "sharp"

const DATA_URL_PATTERN = /^data:(?<mime>image\/[a-z0-9.+-]+);base64,(?<data>[a-z0-9+/=\s]+)$/i
const MAX_EDGE = 1280
const MAX_BYTES = 1_200_000

function parseDataUrl(dataUrl = "") {
  const match = String(dataUrl || "").match(DATA_URL_PATTERN)
  if (!match?.groups?.mime || !match?.groups?.data) return null
  try {
    return {
      mime: match.groups.mime.toLowerCase(),
      buffer: Buffer.from(match.groups.data.replace(/\s+/g, ""), "base64"),
    }
  } catch {
    return null
  }
}

function toDataUrl(buffer, mime = "image/jpeg") {
  return `data:${mime};base64,${buffer.toString("base64")}`
}

export async function normalizeVisionImageDataUrl(dataUrl = "") {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed?.buffer?.length) return String(dataUrl || "")

  try {
    const image = sharp(parsed.buffer, { failOn: "none" }).rotate()
    const metadata = await image.metadata()
    const width = Number(metadata.width || 0)
    const height = Number(metadata.height || 0)
    const alreadySmallEnough = parsed.buffer.length <= MAX_BYTES && Math.max(width, height, 0) <= MAX_EDGE
    if (alreadySmallEnough && parsed.mime === "image/jpeg") {
      return String(dataUrl || "")
    }

    const normalizedBuffer = await image
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 82,
        mozjpeg: true,
      })
      .toBuffer()

    return toDataUrl(normalizedBuffer, "image/jpeg")
  } catch {
    return String(dataUrl || "")
  }
}
