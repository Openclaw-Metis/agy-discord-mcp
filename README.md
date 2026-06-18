# agy-discord-mcp

Discord bridge and MCP tools for the [agy](https://antigravity.google) (Antigravity) CLI. It connects a Discord bot to agy in two ways:

- **`bot` relay** — inbound Discord messages are sent to `agy --print` and agy's reply is posted back (text only).
- **`mcp` mode** — exposes Discord tools (reply, send_message with file attachments, react, fetch history, download attachments, …) to an interactive agy session over stdio, so agy can talk to Discord itself — including posting generated images.

It is a sibling of `codex-discord-mcp`, ported to agy. Because `agy --print` writes a clean response straight to stdout (no JSON to parse) and agy saves generated images as real files on disk, the bridge is a little simpler than the Codex original.

## Requirements

- Node.js >= 20
- The `agy` (Antigravity) CLI installed and authenticated (check with `agy --version`)
- A Discord bot token (with the **Message Content** intent enabled)

## Install

```bash
npm install
npm run build
npm link        # optional: exposes the `agy-discord-mcp` command globally
```

## Configure

Store your Discord bot token (written to `~/.agy/discord/.env`, mode 600):

```bash
agy-discord-mcp configure <bot-token>
# or interactively:
agy-discord-mcp init
```

Invite the bot and check local status:

```bash
agy-discord-mcp invite-url <discord-client-id>
agy-discord-mcp doctor
```

## Access control

Inbound access is allowlist/pairing based and managed **only** from the CLI — never from Discord messages:

```bash
agy-discord-mcp access show
agy-discord-mcp access policy <pairing|allowlist|disabled>
agy-discord-mcp access allow-user <discord-user-id>
agy-discord-mcp access allow-channel <channel-id> [--no-mention] [--allow-user <id>...]
agy-discord-mcp access pair <code>      # approve a DM pairing code
```

Under the default `pairing` policy, the first DM from an unknown user returns a one-time code; run `access pair <code>` on the host to approve them.

## `bot` relay mode

```bash
agy-discord-mcp bot
```

Each allowed message becomes `agy --print "<prompt>"` run in `AGY_WORKDIR`, and the trimmed stdout is posted back. Set `AGY_RESUME_BY_CHANNEL=true` to keep a per-channel agy conversation (resumed via `--conversation <id>`, detected from agy's conversations directory).

**Files come back in relay mode too** — not just images. The relay adds the output dir (default `~/agy_images`, set by `AGY_DISCORD_GENERATED_IMAGES_DIR`) to agy's workspace and tells agy to save any user-facing file there; any deliverable agy writes during the turn — images plus common document/data/archive types (md, html, pdf, csv, json, zip, docx, …; code/temp files are ignored) — is detected and attached to the Discord reply automatically (≤25 MB each, up to 10). This needs no MCP server. If other agy workloads also write to `~/agy_images` (e.g. image-gen crons), point the bot at a dedicated dir via `AGY_DISCORD_GENERATED_IMAGES_DIR` so their output isn't picked up.

> agy is launched through its wrapper, which auto-injects `--dangerously-skip-permissions` — **every tool call is auto-approved**. Treat Discord input as untrusted: run in an isolated workspace, set `AGY_SANDBOX=1`, or acknowledge the risk with `AGY_DISCORD_ASSUME_YES=true`.

## `mcp` mode (agy drives Discord)

> **Caveat (current agy):** registering an MCP server in agy's settings makes a **headless** `agy --print` hang on a first-use, interactive "trust this MCP server?" prompt — there is no config key (the `mcpServers` schema has no `trust` field) or `agy mcp` subcommand to pre-approve it. Since that global setting is read by *every* agy invocation, it also breaks the relay's own `agy --print` calls and any other headless agy users. Enable this only for a dedicated **interactive** agy session that can answer the prompt; for normal use prefer relay mode above, which already attaches images.

Register the MCP server by merging a `mcpServers` block into `~/.gemini/settings.json` (or `~/.gemini/antigravity-cli/settings.json`). Generate it with:

```bash
agy-discord-mcp print-config        # node + absolute path form
agy-discord-mcp print-config --npx  # npx form
```

Example (`agy-mcp-config.example.json`):

```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["/path/to/agy-discord-mcp/dist/cli.js", "mcp"],
      "timeout": 60000,
      "trust": true
    }
  }
}
```

Then run agy normally; it can call the Discord tools below. Inbound Discord messages are queued — poll with `list_pending_messages`, `reply`, then `mark_message_handled`.

### Sending images / files

agy writes generated images as **real files** (its native `generate_image` tool, or the `agy-image` skill, save to a path you choose — default `~/agy_images`). Pass that absolute path in the `files` array of `reply`/`send_message`. Files must live under an allowed attachment root (see `AGY_DISCORD_ATTACHMENT_ROOTS`); the agy image dir and the bridge inbox are always allowed.

### Tools

| tool | purpose |
|---|---|
| `reply` / `send_message` | post text + optional file attachments |
| `react` | add an emoji reaction |
| `edit_message` | edit a message the bot sent |
| `fetch_messages` | recent channel history (Discord bot search is unavailable) |
| `download_attachment` | save a message's attachments to the inbox |
| `latest_generated_images` | newest images under the agy image dir |
| `list_pending_messages` / `mark_message_handled` | inbound message queue |
| `bridge_status` | state dir, queue counts, Discord login status |

## Environment

| var | default | purpose |
|---|---|---|
| `DISCORD_BOT_TOKEN` | — | bot token (usually stored in the state `.env`) |
| `AGY_DISCORD_STATE_DIR` | `~/.agy/discord` | state directory |
| `AGY_COMMAND` | `agy` | agy executable |
| `AGY_WORKDIR` | cwd | working directory for relay runs |
| `AGY_MODEL` | — | `--model` |
| `AGY_SANDBOX` | `false` | pass `--sandbox` (terminal restrictions) |
| `AGY_RESUME_BY_CHANNEL` | `false` | resume a per-channel conversation |
| `AGY_TIMEOUT_MS` | `900000` | relay run budget (also sets agy's `--print-timeout`) |
| `AGY_EXTRA_ARGS` | — | extra agy args (shell-style string or JSON array) |
| `AGY_CONVERSATIONS_DIR` | `~/.gemini/antigravity-cli/conversations` | where agy stores conversation `.db` files |
| `AGY_DISCORD_ATTACHMENT_ROOTS` | cwd + `AGY_WORKDIR` + inbox | allowed upload roots (os-delimiter separated) |
| `AGY_DISCORD_GENERATED_IMAGES_DIR` | `~/agy_images` | output dir the relay tells agy to save deliverables in and scans to auto-attach (always attachable) |
| `AGY_DISCORD_ASSUME_YES` | `false` | suppress the unsafe-mode warning |

## Development

```bash
npm run typecheck
npm test
npm run build
npm run dev:bot   # tsx src/cli.ts bot
npm run dev:mcp   # tsx src/cli.ts mcp
```

## License

MIT
