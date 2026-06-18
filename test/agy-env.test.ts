import { describe, expect, it } from 'vitest'
import { buildAgyChildEnv, buildAgyPrintArgs } from '../src/agy.js'

describe('buildAgyChildEnv', () => {
  it('strips the Discord bot token from the agy child environment', () => {
    const env = buildAgyChildEnv({
      DISCORD_BOT_TOKEN: 'super-secret',
      PATH: '/usr/bin',
    })
    expect(env.DISCORD_BOT_TOKEN).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
  })

  it('preserves other environment variables', () => {
    const env = buildAgyChildEnv({
      DISCORD_BOT_TOKEN: 'super-secret',
      HOME: '/home/me',
      PATH: '/usr/bin',
    })
    expect(env.HOME).toBe('/home/me')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('does not mutate the source environment', () => {
    const source = { DISCORD_BOT_TOKEN: 'super-secret' }
    buildAgyChildEnv(source)
    expect(source.DISCORD_BOT_TOKEN).toBe('super-secret')
  })
})

describe('buildAgyPrintArgs', () => {
  const base = { sandbox: false, workdir: '/work', extraArgs: [], timeoutMs: 900_000, imagesDir: '/imgs' }

  it('passes the prompt as the value of --print, last, and adds workdir + images dir', () => {
    const args = buildAgyPrintArgs(base, 'hello world', undefined)
    expect(args[args.length - 2]).toBe('--print')
    expect(args[args.length - 1]).toBe('hello world')
    const di = args.indexOf('--add-dir')
    expect(di).toBeGreaterThanOrEqual(0)
    expect(args[di + 1]).toBe('/work')
    expect(args).toContain('/imgs')
    expect(args).not.toContain('--conversation')
    expect(args).not.toContain('--sandbox')
  })

  it('adds --sandbox when enabled and --conversation when resuming', () => {
    const args = buildAgyPrintArgs({ ...base, sandbox: true }, 'hi', 'uuid-123')
    expect(args).toContain('--sandbox')
    const ci = args.indexOf('--conversation')
    expect(ci).toBeGreaterThanOrEqual(0)
    expect(args[ci + 1]).toBe('uuid-123')
  })

  it('includes --model and a go-duration --print-timeout', () => {
    const args = buildAgyPrintArgs({ ...base, model: 'fast' }, 'hi', undefined)
    const mi = args.indexOf('--model')
    expect(args[mi + 1]).toBe('fast')
    const pi = args.indexOf('--print-timeout')
    expect(args[pi + 1]).toBe('900s')
  })
})
