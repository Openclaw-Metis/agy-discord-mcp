import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildConfigSnippet,
  buildInviteUrl,
  formatDoctorReport,
  isDirectRun,
  type DoctorReport,
} from '../src/cli.js'
import { buildUnsafeBotModeWarning } from '../src/safety.js'
import { acquireProcessLock } from '../src/state.js'

describe('buildConfigSnippet', () => {
  it('prints an npx-compatible mcpServers JSON block', () => {
    const snippet = buildConfigSnippet({ useNpx: true })

    expect(snippet).toContain('"mcpServers"')
    expect(snippet).toContain('"command": "npx"')
    expect(snippet).toContain('"agy-discord-mcp"')
    expect(snippet).toContain('"trust": true')
  })

  it('uses the node + path form by default', () => {
    const snippet = buildConfigSnippet({ cliPath: '/opt/agy-discord-mcp/dist/cli.js' })

    expect(snippet).toContain('"command": "node"')
    expect(snippet).toContain('/opt/agy-discord-mcp/dist/cli.js')
  })
})

describe('buildInviteUrl', () => {
  it('prints a Discord OAuth bot invite URL', () => {
    const url = new URL(buildInviteUrl('123456789012345678'))

    expect(url.origin).toBe('https://discord.com')
    expect(url.pathname).toBe('/oauth2/authorize')
    expect(url.searchParams.get('client_id')).toBe('123456789012345678')
    expect(url.searchParams.get('scope')).toContain('bot')
    expect(url.searchParams.get('scope')).toContain('applications.commands')
  })
})

describe('isDirectRun', () => {
  it('recognizes npm-linked CLI symlinks as direct runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agy-discord-mcp-'))
    try {
      const distDir = join(dir, 'dist')
      const binDir = join(dir, 'bin')
      mkdirSync(distDir)
      mkdirSync(binDir)

      const target = join(distDir, 'cli.js')
      const link = join(binDir, 'agy-discord-mcp')
      writeFileSync(target, '#!/usr/bin/env node\n')
      symlinkSync(target, link)

      expect(isDirectRun(link, pathToFileURL(target).href)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('formatDoctorReport', () => {
  it('formats JSON output for machine readers', () => {
    const report: DoctorReport = {
      ok: false,
      checks: {
        node: { ok: true, value: 'v20.0.0' },
        discordToken: { ok: false, value: 'missing' },
      },
    }

    const parsed = JSON.parse(formatDoctorReport(report, true))
    expect(parsed.ok).toBe(false)
    expect(parsed.checks.node.ok).toBe(true)
    expect(parsed.checks.discordToken.value).toBe('missing')
  })
})

describe('buildUnsafeBotModeWarning', () => {
  it('warns for unattended full-access bot mode (no sandbox)', () => {
    const warning = buildUnsafeBotModeWarning({ sandbox: false })

    expect(warning).toContain('WARNING')
    expect(warning).toContain('--dangerously-skip-permissions')
  })

  it('does not warn when sandboxed or explicitly suppressed', () => {
    expect(buildUnsafeBotModeWarning({ sandbox: true })).toBeUndefined()

    expect(
      buildUnsafeBotModeWarning({ sandbox: false }, { AGY_DISCORD_ASSUME_YES: 'true' }),
    ).toBeUndefined()
  })
})

describe('acquireProcessLock', () => {
  it('refuses to acquire a lock held by a live process', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agy-discord-mcp-'))
    try {
      const lockFile = join(dir, 'bot.pid')
      writeFileSync(lockFile, `${process.pid}\n`)

      expect(() => acquireProcessLock(lockFile, 'test relay')).toThrow(
        /test relay is already running/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('replaces a stale lock and releases only its own pid file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agy-discord-mcp-'))
    try {
      const lockFile = join(dir, 'bot.pid')
      writeFileSync(lockFile, 'not-a-pid\n')

      const lock = acquireProcessLock(lockFile, 'test relay', 12345)
      expect(lock.pid).toBe(12345)
      expect(lock.path).toBe(lockFile)

      writeFileSync(lockFile, `${process.pid}\n`)
      lock.release()
      expect(() => acquireProcessLock(lockFile, 'test relay', 12345)).toThrow(
        /test relay is already running/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
