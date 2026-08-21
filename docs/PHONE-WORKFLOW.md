# Working Claude from your phone — the multi-project setup

Written 20 Aug 2026. Grounded in what the CLI on this machine actually
supports (checked via `claude --help`), not from memory.

## The problem you hit, named

One dispatch window driving several projects means every instruction needs
"which project" context, replies interleave, and a wrong-project command is
one ambiguous message away. The fix is structural, not discipline:
**one session per project, each with its own name, each its own thread on
your phone.** Claude's session list then works like a chat app — you pick the
project by picking the conversation.

---

## Setup on this PC, before you travel (5 minutes)

Remote Control makes a session on this machine drivable from your phone. The
flag takes a **name** — that name is what you'll see and tap on the phone, so
name sessions after projects:

```bash
cd D:\INDIZILLA
claude --remote-control indizilla
```

And for any other local project, its own window:

```bash
cd D:\OTHER-PROJECT
claude --remote-control other-project
```

Notes that matter:

- Un-named sessions get auto-named by hostname
  (`--remote-control-session-name-prefix` changes that), which is how "which
  window is which" confusion starts — **always pass the name.**
- The PC must stay **on and online**. Windows: Settings → System → Power →
  set *Sleep* to Never while plugged in. A sleeping PC is a dead session.
- Each session keeps its own working directory, permissions and context.
  Nothing about this changes how the session behaves locally.

## On the phone

Open the **Claude app** (or claude.ai/code in the phone browser) and go to
the Code area. Your named Remote Control sessions appear in the session list
alongside any cloud sessions. Tap `indizilla` → you're talking to this
machine, this repo, this context — the same session that's been doing all of
this work. Tap the other name → the other project. No prefixing messages
with project names, no cross-talk.

---

## The better way for repo-backed projects: cloud sessions

For any project that lives on GitHub (indi does), you don't need this PC on
at all: start a **cloud session** from claude.ai/code → it clones the repo
and works on Anthropic's machines. From your phone you can open one cloud
session per repo, and they survive your PC being off, asleep, or on a plane
with you.

**When to use which:**

| | Remote Control (this PC) | Cloud session |
|---|---|---|
| Needs the PC on | yes | no |
| Sees D:\ files not in git | yes | no |
| Can run `ship.mjs` with your local env creds | yes | no |
| Deploy via git push (Vercel) | yes | yes |
| Best for | deploys, local files, anything already set up here | code + push work from anywhere |

Practical split for Indizilla: **cloud session for site/code changes**
(everything deploys on push anyway), **Remote Control for the odd job that
needs this machine** — credentials in your shell, local artwork files, the
local test browser.

Two facts that make multi-session work smooth:

- Sessions can see and message each other (a session lists the others and
  can send to them by name), so "tell the indizilla session to redeploy" is
  a thing you can literally say from any session.
- Long tasks can run as **background agents** (`claude --bg`, managed with
  `claude agents`) so a session isn't blocked while something builds.

## Recurring work while travelling: scheduled routines

For things that should happen without you asking — a daily lead-queue
summary, a weekly link check — use `/schedule` in a session to create a
scheduled cloud agent (a routine) on a cron. It runs in the cloud whether or
not any device of yours is awake, and you read the results from the phone.

---

## The travel checklist

Before leaving:
1. `claude --remote-control indizilla` running in `D:\INDIZILLA` (and one per
   other local project, each named).
2. PC sleep set to Never (plugged in), Wi-Fi stable.
3. Phone: Claude app signed into the same account; confirm the named
   sessions appear in the Code session list.

While away:
- Repo work → cloud session for that repo.
- This-machine work → the `indizilla` Remote Control thread.
- One project per thread; never multiplex.

If a Remote Control session drops (PC rebooted, network blip): anything
committed and pushed is safe; restart the same command when you're back —
`claude --continue` in the project directory resumes the most recent
conversation there.

## Honest limits

- Remote Control is a live link to a running session — it cannot start the
  PC or wake it from sleep.
- Cloud sessions see the GitHub repo, not this disk: `D:\` artwork, local
  `.env.local`, and your shell credentials stay PC-only by design.
- Exact button labels in the phone app shift between versions; the shape
  (Code area → session list → named threads) is the stable part.
