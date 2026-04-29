import { pathToFileURL } from "node:url"
import path from "node:path"

const rootUrl = pathToFileURL(path.resolve(process.cwd(), "src")).href

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const target = specifier.slice(2)
    const withExtension = path.extname(target) ? target : `${target}.js`
    return defaultResolve(new URL(withExtension, `${rootUrl}/`).href, context, defaultResolve)
  }
  return defaultResolve(specifier, context, defaultResolve)
}
