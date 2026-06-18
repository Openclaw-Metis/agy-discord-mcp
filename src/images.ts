import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Unlike Codex (whose image_gen only emits inline base64), agy writes generated
// files (images, documents, archives) as real files on disk. This module lists
// the most recent files matching a set of extensions so the bridge can attach
// them to Discord.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'])
const DEFAULT_LIMIT = 1
const MAX_LIMIT = 50
const DEFAULT_MAX_DEPTH = 3

export type ListedFile = {
  path: string
  name: string
  size: number
  modifiedMs: number
}

export function generatedImagesDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AGY_DISCORD_GENERATED_IMAGES_DIR?.trim()
  if (override) return override
  return join(homedir(), 'agy_images')
}

// Recursively list files under `dir` whose lowercase extension is in
// `extensions` (no leading dot), newest first, capped at `limit`.
export function listRecentFiles(
  dir: string,
  extensions: ReadonlySet<string>,
  options: { limit?: number; maxDepth?: number } = {},
): ListedFile[] {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT))
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const out: ListedFile[] = []
  collect(dir, maxDepth, out, extensions)
  out.sort((a, b) => b.modifiedMs - a.modifiedMs)
  return out.slice(0, limit)
}

export function listGeneratedImages(
  options: { limit?: number; dir?: string; maxDepth?: number } = {},
): ListedFile[] {
  return listRecentFiles(options.dir ?? generatedImagesDir(), IMAGE_EXTENSIONS, {
    limit: options.limit,
    maxDepth: options.maxDepth,
  })
}

function collect(
  dir: string,
  depth: number,
  out: ListedFile[],
  extensions: ReadonlySet<string>,
): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }

  for (const name of names) {
    const path = join(dir, name)
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue // skip unreadable entries
    }

    if (stat.isDirectory()) {
      if (depth > 0) collect(path, depth - 1, out, extensions)
      continue
    }
    if (!stat.isFile() || !hasExtension(name, extensions)) continue
    out.push({ path, name, size: stat.size, modifiedMs: stat.mtimeMs })
  }
}

function hasExtension(name: string, extensions: ReadonlySet<string>): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return extensions.has(name.slice(dot + 1).toLowerCase())
}
