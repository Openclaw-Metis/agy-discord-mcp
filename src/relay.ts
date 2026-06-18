import { AgyRunner, agyOptionsFromEnv } from './agy.js'
import { DiscordBridge } from './discord.js'
import { warnUnsafeBotMode } from './safety.js'
import { installShutdownHandlers } from './shutdown.js'
import {
  acquireProcessLock,
  getStatePaths,
  listPendingMessages,
  loadStateEnv,
  markMessageHandled,
} from './state.js'
import type { QueuedMessage, StatePaths } from './types.js'

export async function runRelay(): Promise<void> {
  const paths = getStatePaths()
  loadStateEnv(paths)

  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) {
    throw new Error(
      `DISCORD_BOT_TOKEN is required. Set it in ${paths.envFile} or the process environment.`,
    )
  }

  const lock = acquireProcessLock(paths.botPidFile, 'agy-discord relay')
  const bridge = new DiscordBridge(token, paths)
  const agyOptions = agyOptionsFromEnv()
  warnUnsafeBotMode(agyOptions)
  const runner = new AgyRunner(agyOptions, paths)
  const chains = new Map<string, Promise<void>>()

  function enqueue(message: QueuedMessage): void {
    const previous = chains.get(message.chatId) ?? Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(() => processMessage(bridge, runner, message, paths))

    chains.set(message.chatId, next)
    void next.finally(() => {
      if (chains.get(message.chatId) === next) chains.delete(message.chatId)
    })
  }

  bridge.on('message', message => enqueue(message as QueuedMessage))

  for (const pending of listPendingMessages(100, paths)) {
    enqueue(pending)
  }

  installShutdownHandlers({
    label: 'agy-discord relay',
    stop: async () => {
      try {
        await bridge.stop()
      } finally {
        lock.release()
      }
    },
  })
  try {
    await bridge.start()
    process.stderr.write('agy-discord relay: ready\n')
  } catch (err) {
    lock.release()
    throw err
  }
}

async function processMessage(
  bridge: DiscordBridge,
  runner: AgyRunner,
  message: QueuedMessage,
  paths: StatePaths,
): Promise<void> {
  const typing = setInterval(() => {
    void bridge.sendTyping(message.chatId).catch(() => {})
  }, 9000)
  typing.unref()

  try {
    void bridge.sendTyping(message.chatId).catch(() => {})
    const result = await runner.runForMessage(message)
    await bridge.sendMessage({
      chatId: message.chatId,
      text: result.text,
      replyTo: message.messageId,
      files: result.imagePaths.length > 0 ? result.imagePaths : undefined,
    })
    await markMessageHandled(message.id, paths)
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    await bridge
      .sendMessage({
        chatId: message.chatId,
        text: `agy run failed: ${trimForDiscord(text)}`,
        replyTo: message.messageId,
      })
      .catch(sendErr => {
        process.stderr.write(`agy-discord relay: failed to report error: ${sendErr}\n`)
      })
    await markMessageHandled(message.id, paths)
  } finally {
    clearInterval(typing)
  }
}

function trimForDiscord(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > 1500 ? `${trimmed.slice(0, 1500)}...` : trimmed
}
