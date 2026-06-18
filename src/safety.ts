import type { AgyRunnerOptions } from './agy.js'

export function buildUnsafeBotModeWarning(
  options: Pick<AgyRunnerOptions, 'sandbox'>,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (isTruthy(env.AGY_DISCORD_ASSUME_YES)) return undefined
  if (options.sandbox) return undefined

  return [
    'WARNING: agy-discord-mcp bot is running unattended with full agy tool access.',
    'agy is launched through its wrapper, which auto-injects --dangerously-skip-permissions,',
    'so every tool call is auto-approved and there is no sandbox.',
    '',
    'Discord messages are untrusted input. Approved Discord users can trigger agy runs',
    'that may read or modify files and run shell commands.',
    'Set AGY_SANDBOX=1 to run agy with terminal restrictions, or run the bot only inside an',
    'isolated workspace. Set AGY_DISCORD_ASSUME_YES=true to suppress this warning.',
  ].join('\n')
}

export function warnUnsafeBotMode(
  options: Pick<AgyRunnerOptions, 'sandbox'>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const warning = buildUnsafeBotModeWarning(options, env)
  if (warning) process.stderr.write(`${warning}\n`)
}

function isTruthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? '')
}
