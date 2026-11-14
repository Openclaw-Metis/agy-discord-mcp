import { describe, expect, it, vi } from 'vitest'
import { buildAgyPrintArgs, buildDiscordPrompt, runAgyProcess } from '../src/agy.js'
import { descendantPids, readProcessTable } from '../src/process-tree.js'
import type { QueuedMessage } from '../src/types.js'

const node = process.execPath
const opts = { cwd: process.cwd(), timeoutMs: 20_000 }

describe('runAgyProcess', () => {
  it('returns trimmed stdout as the reply text', async () => {
    await expect(
      runAgyProcess(node, ['-e', `process.stdout.write('  final answer\\n')`], opts),
    ).resolves.toBe('final answer')
  })

  it('rejects with stderr on a non-zero exit', async () => {
    const script = `process.stderr.write('bad things'); process.exit(3)`
    await expect(runAgyProcess(node, ['-e', script], opts)).rejects.toThrow(
      /agy exited with code 3: bad things/,
    )
  })

  it('kills the process and rejects promptly when aborted', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const run = runAgyProcess(node, ['-e', 'setTimeout(() => {}, 60_000)'], {
      ...opts,
      signal: controller.signal,
    })
    setTimeout(() => controller.abort('stop'), 150)
    await expect(run).rejects.toThrow(/cancelled/)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('does not spawn when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort('stop')
    await expect(
      runAgyProcess(node, ['-e', 'process.exit(0)'], { ...opts, signal: controller.signal }),
    ).rejects.toThrow(/before it started/)
  })

  it('times out after timeoutMs plus the grace window', async () => {
    await expect(
      runAgyProcess(node, ['-e', 'setTimeout(() => {}, 60_000)'], {
        ...opts,
        timeoutMs: 100,
        killGraceMs: 100,
      }),
    ).rejects.toThrow(/timed out after 100ms/)
  })
})

describe('buildAgyPrintArgs extra dirs', () => {
  const base = { sandbox: false, workdir: '/work', extraArgs: [], timeoutMs: 900_000, imagesDir: '/imgs' }

  it('adds extra dirs once each, after workdir and images dir', () => {
    const args = buildAgyPrintArgs(base, 'hi', undefined, ['/inbox', '/work'])
    const dirs = args.flatMap((arg, i) => (arg === '--add-dir' ? [args[i + 1]] : []))
    expect(dirs).toEqual(['/work', '/imgs', '/inbox'])
  })
})

describe('buildDiscordPrompt attachments', () => {
  const message: QueuedMessage = {
    id: 'm',
    chatId: 'c',
    messageId: 'm',
    userId: 'u',
    user: 'user',
    content: 'what is in these?',
    createdAt: '2026-11-14T00:00:00Z',
    receivedAt: '2026-11-14T00:00:00Z',
    source: 'discord',
    attachments: [
      { id: 'a1', name: 'pic.png', contentType: 'image/png', size: 2048 },
      { id: 'a2', name: 'huge.zip', size: 30 * 1024 * 1024 },
    ],
    status: 'pending',
  }

  it('lists local paths and download errors next to each attachment', () => {
    const prompt = buildDiscordPrompt(message, '/outbox/c', [
      { id: 'a1', name: 'pic.png', path: '/inbox/1-a1.png' },
      { id: 'a2', name: 'huge.zip', error: 'attachment too large: 30MB' },
    ])
    expect(prompt).toContain('- pic.png (image/png, 2KB, id: a1) — saved locally at /inbox/1-a1.png')
    expect(prompt).toContain('id: a2) — download failed: attachment too large: 30MB')
    expect(prompt).toContain('read them from the local paths')
  })

  it('keeps the plain listing when nothing was downloaded', () => {
    const prompt = buildDiscordPrompt(message, '/outbox/c')
    expect(prompt).toContain('- pic.png (image/png, 2KB, id: a1)\n')
    expect(prompt).not.toContain('saved locally')
  })
})

describe.skipIf(process.platform === 'win32')('runAgyProcess process tree', () => {
  it('kills tool subprocesses the CLI started, not just the CLI', async () => {
    // The fake CLI starts a long-lived grandchild in its own session (as agents
    // run tool commands) that shares its stdout, the
    // way a shell tool call would, then reports the grandchild pid on stderr.
    const script = [
      "const { spawn } = require('node:child_process')",
      "const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit', detached: true })",
      "process.stderr.write('GRANDCHILD=' + g.pid + '\\n')",
      'setTimeout(() => {}, 60000)',
    ].join(';')
    const controller = new AbortController()
    const run = runAgyProcess(node, ['-e', script], { ...opts, signal: controller.signal })
    let grandchild = 0
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      const match = /GRANDCHILD=(\d+)/.exec(String(chunk))
      if (match) grandchild = Number(match[1])
      return (original as (...args: unknown[]) => boolean)(chunk, ...rest)
    }) as typeof process.stderr.write
    try {
      await vi.waitFor(() => expect(grandchild).toBeGreaterThan(0), { timeout: 5_000 })
      controller.abort('stop')
      await expect(run).rejects.toThrow(/cancelled/)
      await vi.waitFor(
        () => expect(() => process.kill(grandchild, 0)).toThrow(),
        { timeout: 5_000 },
      )
    } finally {
      process.stderr.write = original
      try {
        process.kill(grandchild, 'SIGKILL')
      } catch {}
    }
  })
})
describe('descendantPids', () => {
  it('walks the whole tree from the given roots', () => {
    const table = new Map([
      [10, 1],
      [11, 10],
      [12, 11],
      [13, 10],
      [20, 1],
      [21, 20],
    ])
    expect(descendantPids([10], table).sort()).toEqual([11, 12, 13])
    expect(descendantPids([11, 20], table).sort()).toEqual([12, 21])
    expect(descendantPids([99], table)).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('sees real child processes', () => {
    const table = readProcessTable()
    expect(table.get(process.pid)).toBeGreaterThan(0)
  })
})
