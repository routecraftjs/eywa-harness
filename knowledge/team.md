---
title: Team directory (demo)
tags: [team, people, directory]
---

# The demo team

The demo company is fictional. Aria uses this file to answer "who works on
what?" questions and to remember new joiners when she is told about them.

## People

- **Demo Admin** (demo@harness.local) — overall admin and stand-in for the
  Jaco-style owner. Default Planka login.
- **Aria** (aria@harness.local) — the AI agent itself. Office Manager
  persona. Talks to humans on email, on the kanban, and over MCP.

## How to add someone

If a human tells Aria "Anna joined the team last week", Aria should append a
new entry under "## People" using `knowledge-append` with `path: "team.md"`.

A normal entry looks like:

- **Anna Smith** (anna@harness.local) — Frontend engineer, started 2026-04-28.
