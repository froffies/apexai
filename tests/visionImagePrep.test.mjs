import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"

import { normalizeVisionImageDataUrl } from "../server/visionImagePrep.mjs"

test("normalizeVisionImageDataUrl downsizes oversized images for vision requests", async () => {
  const largePng = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      background: { r: 220, g: 40, b: 40 },
    },
  }).png().toBuffer()

  const original = `data:image/png;base64,${largePng.toString("base64")}`
  const normalized = await normalizeVisionImageDataUrl(original)

  assert.match(normalized, /^data:image\/jpeg;base64,/i)
  assert.ok(normalized.length < original.length)
})
