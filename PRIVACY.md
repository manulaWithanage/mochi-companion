# 🔒 Privacy policy

_Last updated: 2026-10-09_

**The short version:** Mochi has no account, no server and no telemetry. The project never receives any of your data. Everything Mochi records stays on your computer, and it only talks to services you have connected yourself.

---

## What stays on your computer

Mochi keeps all of this in its data folder (`%APPDATA%\Mochi` on Windows, `~/Library/Application Support/Mochi` on macOS):

- time tracking sessions, projects and categories
- tasks, reminders and routines
- settings
- activity history, recorded as **application names only**
- cached email details and calendar events, if you connect them
- AI-generated reply drafts, and what Mochi has learned about your working patterns

**API keys, your Gmail app password and Google sign-in tokens** are encrypted with your operating system's keystore. They are only ever read by Mochi's main process, never by any window that displays content.

**Window titles** are read only if you turn on site tracking. Even then they are matched against a fixed list of sites and discarded in the same moment. They are never stored, never logged and never sent anywhere.

---

## What leaves your computer

Only what you turn on, and only to the service you chose.

### Your AI provider

If you set up AI, Mochi sends requests to the provider you picked: OpenAI, Azure OpenAI, Anthropic or Google. If you pick a local runtime such as **Ollama** or **LM Studio**, nothing leaves your computer at all. Mochi sends:

| Feature             | What is sent                                                                                                           |
| :------------------ | :--------------------------------------------------------------------------------------------------------------------- |
| Activity categories | The names of applications Mochi's built-in list does not recognise                                                     |
| Email triage        | For each email: the sender's name and address, the subject, and the first 150 characters of the message                |
| Reply drafts        | The email you are replying to, **only** if you turn on "Allow email bodies in AI draft prompts". It is off by default. |
| Morning briefing    | A few facts about your day, such as meeting titles and times, so Mochi can phrase its greeting                         |

That provider's own privacy policy then applies to what it receives. Your API key is sent only to that provider.

### Gmail

If you connect Gmail, Mochi signs in to Google's mail server (`imap.gmail.com`) with the app password you gave it, and reads your mail from there. It adds a draft to your Gmail only when you click to save one. **It never sends or deletes email.**

### Calendar

If you connect a calendar, Mochi downloads the calendar feed address you gave it. If you use a Google account through your own Google Cloud project instead, Mochi asks only for read-only calendar access.

### Updates

Mochi checks [GitHub Releases](https://github.com/manulaWithanage/mochi-companion/releases) for new versions and downloads them from there. GitHub sees your IP address, as it would for any download. No other information is sent.

---

## What is never sent

- Nothing is ever sent to the Mochi project or its developer. There is no server to send it to.
- No analytics, crash reports or usage statistics.
- Your time tracking history, tasks and window titles never leave your computer.

---

## Deleting your data

In Mochi's settings window, **Delete all local Mochi data** removes everything listed above, including your connected accounts and keys, and restarts Mochi as a new installation. Uninstalling Mochi removes the program; to remove your data too, use that option first or delete the data folder.

To disconnect a service, remove it in Mochi's settings. To cut Mochi off from Google's side as well, delete its app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), or revoke a Google Calendar sign-in at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

---

## Changes and contact

When this policy changes, the change is made in this file, so its full history is public. Questions go to **manula.withanage@gmail.com**.
