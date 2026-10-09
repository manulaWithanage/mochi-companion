# 🔏 Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

A signature lets you check two things before you run an installer: that it was published by this project, and that nobody has changed it since. This page says what Mochi signs, how a signed build is produced, and who can approve one.

---

## Status

| Platform | Signed                                                                                                              |
| :------- | :------------------------------------------------------------------------------------------------------------------ |
| Windows  | **Not yet.** Mochi applied to the SignPath Foundation on 2026-10-09. Until it is approved, installers are unsigned. |
| macOS    | **No.** Signing needs an Apple Developer ID, which the project does not have yet. The disk image is experimental.   |
| Linux    | Not distributed yet.                                                                                                |

This page is updated when any of these change. Until a platform says **Yes**, its downloads carry no signature at all, and your operating system will warn you before running them.

---

## What gets signed

Only files built from this repository by its own release workflow:

- `Mochi-Setup.exe`, the Windows installer published on [GitHub Releases](https://github.com/manulaWithanage/mochi-companion/releases)
- the application executable and uninstaller inside it

Nothing built on a developer's own machine is ever signed. Third-party projects, forks and builds from other sources are not covered by this policy, even when they use the Mochi name.

---

## How a signed build is produced

Every step runs on GitHub-hosted runners, defined in files that are public in this repository:

1. **A version tag is pushed.** [`release.yml`](.github/workflows/release.yml) starts from that exact commit.
2. **The tag is checked** against the version in `apps/desktop/package.json`. A mismatch stops the release.
3. **Every gate runs** on Windows, macOS and Linux: lint, format, typecheck, tests and build ([`ci.yml`](.github/workflows/ci.yml)).
4. **The installer is built from source** with `electron-builder`.
5. **The build is submitted to SignPath for signing.** SignPath checks that it came from this repository's workflow, and an approver (below) must approve the request by hand. The private key never leaves SignPath's hardware security module, so no maintainer holds it.
6. **The signed installer is uploaded to a draft release.** Nothing is offered to anyone until a maintainer reviews the draft and publishes it.

Build scripts and workflow files are treated as source code: they are reviewed in the same way as any other change.

---

## Team roles

| Role                     | Who can                                                       | Members                                                |
| :----------------------- | :------------------------------------------------------------ | :----------------------------------------------------- |
| Committers and reviewers | Change the source code, and review every outside contribution | [Manula Withanage](https://github.com/manulaWithanage) |
| Approvers                | Approve each signing request                                  | [Manula Withanage](https://github.com/manulaWithanage) |

Changes from anyone who is not a committer arrive as pull requests and are reviewed by a committer before they are merged. Every team member uses multi-factor authentication for both GitHub and SignPath.

---

## Privacy

Mochi has no account, no server and no telemetry. It only contacts the services you connect yourself, such as an AI provider or your mail and calendar, plus GitHub Releases to check for updates. The full details are in the [privacy policy](PRIVACY.md).

---

## Checking a signature

Once Windows signing is live, right-click the installer, choose **Properties**, then the **Digital Signatures** tab. Or, in PowerShell:

```powershell
Get-AuthenticodeSignature .\Mochi-Setup.exe | Format-List Status, SignerCertificate
```

`Status` should be `Valid`. If it is anything else, do not run the file.

---

## Reporting a problem

If you think a signed Mochi file is malicious, has been tampered with, or was signed by mistake, email **manula.withanage@gmail.com** with the file's SHA-256 hash and where you downloaded it. You can get the hash with:

```powershell
Get-FileHash .\Mochi-Setup.exe -Algorithm SHA256
```

Reports like this are treated as urgent. Conduct problems in the project itself are covered by the [code of conduct](CODE_OF_CONDUCT.md).
