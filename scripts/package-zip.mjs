import archiver from "archiver"
import { createWriteStream } from "node:fs"
import { mkdir, readdir, rm, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const defaultOutput = path.resolve(projectRoot, "..", "apexai-production-package.zip")
const outputPath = path.resolve(process.argv[2] || defaultOutput)
const fixedDate = new Date("2026-01-01T00:00:00.000Z")

const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "Pods",
  "DerivedData",
  "dist",
  "test-results",
  "tmp-ui-shots",
  "playwright-report",
  "server-data",
])

const excludedFiles = new Set([
  ".env",
  ".env.local",
])

function isExcluded(relativePath, name, directory) {
  if (directory && excludedDirectories.has(name)) return true
  if (!directory && excludedFiles.has(name)) return true
  if (!directory && name.endsWith(".log")) return true
  if (relativePath.startsWith("ios/App/Pods/")) return true
  if (relativePath.startsWith("ios/App/build/")) return true
  if (relativePath.startsWith("ios/App/DerivedData/")) return true
  if (relativePath.startsWith("ios/App/App/public/")) return true
  return false
}

function zipName(relativePath) {
  return relativePath.split(path.sep).join("/")
}

async function walk(currentDirectory, baseDirectory = currentDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = path.join(currentDirectory, entry.name)
    const relativePath = path.relative(baseDirectory, absolutePath)
    const normalized = zipName(relativePath)

    if (isExcluded(normalized, entry.name, entry.isDirectory())) continue

    if (entry.isDirectory()) {
      files.push(...await walk(absolutePath, baseDirectory))
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath: normalized })
    }
  }

  return files
}

async function main() {
  await mkdir(path.dirname(outputPath), { recursive: true })
  await rm(outputPath, { force: true })

  const files = await walk(projectRoot)
  const output = createWriteStream(outputPath)
  const archive = archiver("zip", { zlib: { level: 9 } })

  const finished = new Promise((resolve, reject) => {
    output.on("close", resolve)
    output.on("error", reject)
    archive.on("error", reject)
  })

  archive.pipe(output)

  for (const file of files) {
    const fileStat = await stat(file.absolutePath)
    archive.file(file.absolutePath, {
      name: file.relativePath,
      date: fixedDate,
      mode: fileStat.mode,
    })
  }

  await archive.finalize()
  await finished

  const outputStat = await stat(outputPath)
  console.log(`Created ${outputPath}`)
  console.log(`Files: ${files.length}`)
  console.log(`Size: ${(outputStat.size / 1024 / 1024).toFixed(2)} MB`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
