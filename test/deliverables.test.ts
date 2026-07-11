import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectRunDeliverables } from '../src/agy.js'
import { channelOutboxDir } from '../src/images.js'

function touchAt(path: string, whenMs: number, content = 'x'): void {
  writeFileSync(path, content)
  const when = new Date(whenMs)
  utimesSync(path, when, when)
}

describe('channelOutboxDir', () => {
  it('appends the chat id as a subdirectory', () => {
    expect(channelOutboxDir('/out', '123456')).toBe(join('/out', '123456'))
  })

  it('sanitizes path-hostile chat ids', () => {
    expect(channelOutboxDir('/out', '../evil')).toBe(join('/out', '___evil'))
  })
})

describe('detectRunDeliverables', () => {
  let dir = ''
  const now = Date.now()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agy-deliver-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns only deliverables written at or after the run start, oldest first', () => {
    touchAt(join(dir, 'first.md'), now + 1000)
    touchAt(join(dir, 'second.csv'), now + 2000)
    touchAt(join(dir, 'stale.pdf'), now - 60_000)
    touchAt(join(dir, 'script.py'), now + 1000)
    touchAt(join(dir, 'empty.md'), now + 1000, '')

    expect(detectRunDeliverables(dir, now).map(f => basename(f))).toEqual([
      'first.md',
      'second.csv',
    ])
  })

  it('recurses into subdirectories and tolerates a missing dir', () => {
    const nested = join(dir, 'report')
    mkdirSync(nested)
    touchAt(join(nested, 'deep.html'), now + 1000)

    expect(detectRunDeliverables(dir, now).map(f => basename(f))).toEqual(['deep.html'])
    expect(detectRunDeliverables(join(dir, 'missing'), now)).toEqual([])
  })
})
