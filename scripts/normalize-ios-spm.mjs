import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packagePath = path.resolve(__dirname, "..", "ios", "App", "CapApp-SPM", "Package.swift")

async function main() {
  const source = await readFile(packagePath, "utf8")
  const normalized = source.replaceAll("\\", "/")
  if (source !== normalized) await writeFile(packagePath, normalized)
  console.log(`Normalized ${packagePath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
