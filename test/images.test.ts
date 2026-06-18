import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generatedImagesDir, listGeneratedImages } from '../src/images.js'

function touch(path: string, secondsAgo: number): void {
  writeFileSync(path, 'x')
  const when = new Date(Date.now() - secondsAgo * 1000)
  utimesSync(path, when, when)
}

describe('generatedImagesDir', () => {
  it('honors an explicit override', () => {
    expect(
      generatedImagesDir({ AGY_DISCORD_GENERATED_IMAGES_DIR: '/custom/out' }),
    ).toBe('/custom/out')
  })

  it('defaults to ~/agy_images', () => {
    expect(generatedImagesDir({})).toBe(join(homedir(), 'agy_images'))
  })
})

describe('listGeneratedImages', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agy-discord-images-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns an empty array when the directory is missing', () => {
    expect(listGeneratedImages({ dir: join(dir, 'nope') })).toEqual([])
  })

  it('returns the newest image first and ignores non-images', () => {
    touch(join(dir, 'old.png'), 100)
    touch(join(dir, 'new.png'), 10)
    touch(join(dir, 'notes.txt'), 1)

    const result = listGeneratedImages({ dir, limit: 5 })
    expect(result.map(image => image.name)).toEqual(['new.png', 'old.png'])
    expect(result[0].path).toBe(join(dir, 'new.png'))
  })

  it('respects the limit', () => {
    touch(join(dir, 'a.png'), 30)
    touch(join(dir, 'b.jpg'), 20)
    touch(join(dir, 'c.webp'), 10)

    expect(listGeneratedImages({ dir, limit: 1 })).toHaveLength(1)
    expect(listGeneratedImages({ dir, limit: 1 })[0].name).toBe('c.webp')
  })

  it('recurses into nested subdirectories', () => {
    const nested = join(dir, 'session-1')
    mkdirSync(nested)
    touch(join(nested, 'render.png'), 5)

    const result = listGeneratedImages({ dir, limit: 5 })
    expect(result.map(image => image.name)).toContain('render.png')
  })
})
