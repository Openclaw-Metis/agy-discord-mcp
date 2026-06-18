import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Unlike Codex (whose image_gen only emits inline base64), agy writes generated
// images as real files on disk — e.g. via its native generate_image tool or the
// agy-image skill, which save to a path you choose (default ~/agy_images). This
// module lists the most recent ones so the bridge can attach them to Discord.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])
const DEFAULT_LIMIT = 1
const MAX_LIMIT = 50
const DEFAULT_MAX_DEPTH = 3

export type GeneratedImage = {
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

export function listGeneratedImages(
  options: { limit?: number; dir?: string; maxDepth?: number } = {},
): GeneratedImage[] {
  const dir = options.dir ?? generatedImagesDir()
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT))
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH

  const images: GeneratedImage[] = []
  collect(dir, maxDepth, images)
  images.sort((a, b) => b.modifiedMs - a.modifiedMs)
  return images.slice(0, limit)
}

function collect(dir: string, depth: number, out: GeneratedImage[]): void {
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
      if (depth > 0) collect(path, depth - 1, out)
      continue
    }
    if (!stat.isFile() || !isImageName(name)) continue
    out.push({ path, name, size: stat.size, modifiedMs: stat.mtimeMs })
  }
}

function isImageName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}
