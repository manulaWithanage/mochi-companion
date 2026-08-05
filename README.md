# 🍡 Mochi — The Super Assistant

> An open-source, animated desktop companion and lifestyle time tracker. No account, no server, no subscription.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/manulaWithanage/mochi-companion?label=release)](https://github.com/manulaWithanage/mochi-companion/releases/latest)
[![CI](https://github.com/manulaWithanage/mochi-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/manulaWithanage/mochi-companion/actions/workflows/ci.yml)

**[mochicompanion.com](https://mochicompanion.com)** · **[Download for Windows](https://github.com/manulaWithanage/mochi-companion/releases/latest/download/Mochi-Setup.exe)**

> **The installer is not code-signed yet.** Windows SmartScreen will warn you on first run — click **More info → Run anyway**. Signing is being worked on; until then this warning is expected and the honest thing to say about it is that you are trusting the build, not a certificate.

Mochi sits in the corner of your screen, tracks where your time actually goes, and speaks up when something genuinely needs you — a reply you owe, a meeting about to start, a task you set for yourself.

---

## What it does today

- **1-click time tracking.** Start a category from the overlay under the mascot. No timesheets.
- **Tasks and reminders** that survive a restart, a closed lid, and a machine that was asleep when they fell due.
- **Gmail triage.** A **Needs Reply** list grouped by what the mail actually wants from you — a deadline, a decision, an answer — rather than by how loud it is.
- **Calendar alerts** five minutes before a meeting, with a Join button when the invite carried a link.
- **Wellness routines.** Hydration, stretch and wind-down nudges on your schedule.
- **Activity tracking** by application name. Window titles are only read if you turn on site tracking, and are dropped in the same tick — see [Privacy](#privacy).

**One door to attention.** Everything that wants to speak goes through a single interruption governor: a rolling hourly budget, a minimum gap, quiet hours, and a Do Not Disturb that genuinely silences things. Mochi is meant to be a companion, not Clippy.

---

## Bring your own key, or no key at all

Mochi works with **OpenAI, Anthropic, Google and local runtimes (Ollama, LM Studio)**. Model IDs are never hardcoded — the provider is detected from the key and the live model list is fetched, so nothing here goes stale when a new model ships.

If Ollama or LM Studio is running locally, every AI feature works with **no key pasted and nothing leaving your machine**.

Keys live in the main process only, encrypted with the OS keystore (`safeStorage`). The renderer displays LLM output and email content — both attacker-influenced — so it never sees a key.

---

## Privacy

- **No Mochi account, no Mochi server.** There is nothing to sign up for.
- **Your keys never leave your machine.** When you pick a cloud model, the content you ask about goes to _that provider_ and nowhere else. Pick Ollama and nothing leaves at all.
- **Activity tracking records application names.** Window titles are read only if you switch on site tracking, matched against a fixed list, and discarded immediately — never stored, never logged, never sent to a model.
- **Only application names reach an LLM**, and only to categorise ones the built-in table does not recognise.

Full reasoning in [`docs/LLM_ROUTER_SECURITY.md`](docs/LLM_ROUTER_SECURITY.md).

---

## Built with

|                 |                                                                                                 |
| :-------------- | :---------------------------------------------------------------------------------------------- |
| Desktop shell   | Electron 43 + `electron-vite`                                                                   |
| UI              | React 19 + TypeScript (strict)                                                                  |
| Mascot          | Canvas 2D sprite sheets, 8–12 FPS, 0 FPS when hidden                                            |
| Storage         | `node:sqlite` — **zero native modules**, so no compile step and nothing to rebuild per platform |
| LLM             | Vercel AI SDK, with runtime model discovery                                                     |
| Mail & calendar | `ImapFlow` and an ICS feed — no Google Cloud project needed                                     |
| Packaging       | `electron-builder`, published to GitHub Releases with background auto-updates                   |

---

## Developing

```bash
pnpm install
pnpm dev
```

Before pushing:

```bash
pnpm verify
```

That runs all five gates — lint, format, typecheck, test, build — in the order CI runs them. A `pre-push` hook runs it for you and refuses the push if anything fails.

Releases are tag-driven: bump the version in a commit, tag it, and the pipeline builds a draft release you publish when ready. See [`AGENT_INSTRUCTIONS.md`](AGENT_INSTRUCTIONS.md) for the architectural rules, and [`docs/`](docs/) for background.

---

## License

The desktop client is [MIT](LICENSE) — embed it, fork it, ship it inside something commercial. See [`LICENSING.md`](LICENSING.md) for the full picture, including why the (as-yet-unwritten) cloud service would be AGPL.
