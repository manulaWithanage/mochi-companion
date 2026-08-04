# 📜 Mochi Licensing

Mochi is split-licensed. **Which license applies depends on which part of the repository you are using.**

| Path                  | License                              | Full text                                    |
| :-------------------- | :----------------------------------- | :------------------------------------------- |
| `apps/desktop/`       | **MIT**                              | [LICENSE](LICENSE)                           |
| `packages/**`         | **MIT**                              | [LICENSE](LICENSE)                           |
| `skins/**`            | **MIT** (code) — see _Artwork_ below | [LICENSE](LICENSE)                           |
| Specs & docs (`*.md`) | **MIT**                              | [LICENSE](LICENSE)                           |
| `services/**`         | **AGPL-3.0-or-later**                | [LICENSE-AGPL-3.0.txt](LICENSE-AGPL-3.0.txt) |

Anything not listed above is MIT.

The public website used to live here as `apps/web/` and is **AGPL-3.0-or-later**. It moved to
its own repository on 2026-08-04 — github.com/manulaWithanage/mochi-website — and carries the
AGPL text with it. Nothing in this repository is AGPL today; the `services/**` row is reserved
for cloud code that does not exist yet.

---

## Why the split

**The desktop client is MIT** because we want the widest possible use. Embed it, fork it, ship it inside something commercial, build skins for it, vendor `packages/core` into your own project — no obligations beyond keeping the copyright notice.

**The cloud service is AGPL-3.0** because AGPL §13 covers the one case MIT cannot: running modified software as a network service. Under AGPL, anyone who hosts a modified version of `services/**` must publish their source. Fork it and self-host for yourself — that is fine and encouraged. Fork it, close it, and sell hosting — that is not.

The desktop app is deliberately _not_ AGPL, because §13 does nothing for locally-run software anyway. It would impose copyleft costs with none of the anti-SaaS benefit.

---

## What this means in practice

**Using Mochi desktop, or building on it** — MIT. Keep the copyright notice. Nothing else.

**Self-hosting the cloud service, unmodified** — AGPL imposes no obligation on you. Run it.

**Self-hosting a modified cloud service** — you must offer your users the corresponding source of your modified version.

**Contributing** — contributions are licensed under whichever license already governs the file you are changing (inbound = outbound, per GitHub's Terms of Service §D.6). There is **no CLA**; you keep your copyright.

**A consequence worth stating plainly:** because there is no CLA and no copyright assignment, the project **cannot** later sell commercial exceptions to the AGPL, and cannot relicense contributed code without every contributor's permission. That is a deliberate trade — lower friction to contribute, in exchange for giving up the AGPL-plus-paid-license business model.

---

## Artwork and skins

The MIT license is a software license and is a poor fit for sprite art. Code in `skins/` — manifests, loaders, tooling — is MIT.

**Contributed artwork keeps its own license**, declared in that skin's `manifest.json`:

```json
{
  "name": "my-skin",
  "author": "Your Name",
  "license": "CC-BY-4.0",
  "source": "https://github.com/you/my-mochi-skin"
}
```

The bundled `skins/default/` artwork is MIT alongside the code. Third-party skins may use CC BY 4.0, CC BY-SA 4.0, or any license the artist chooses — the loader must display it in the skin picker.

---

## Known constraint

AGPL-licensed code conflicts with the Apple App Store's terms. This does not affect `apps/desktop` (MIT), so Mac App Store distribution of the desktop client remains possible. It does mean the website (now its own repository) and `services/**` can never ship through Apple's stores — which is not a distribution channel a web app and a webhook relay would use anyway.

---

## Adding a new package

Any new top-level package must be added to the table above **and** carry its own `LICENSE` file at the package root. A package with no entry here defaults to MIT.
