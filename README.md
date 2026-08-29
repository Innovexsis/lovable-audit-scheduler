# lovable-audit-scheduler

Public, billing-free scheduler for [`vivekearthz/lovable-repository-audit`](https://github.com/vivekearthz/lovable-repository-audit) (private).

## Why this repo exists, and why it's public with no real data in it

GitHub Actions on a **private** repo draws from the account's paid
Actions-minutes quota. When that account's billing has an issue (a failed
payment or a spending limit that needs raising), private-repo Actions runs
get refused before they even start. Actions on a **public** repo are
always free, independent of billing status — but a public repo's contents
and full git history are visible to anyone on the internet, forever, the
moment they're pushed.

Splitting the two solves both problems at once:

- This repo is public, so its scheduled workflow always runs regardless of
  the account's billing state — but it contains **zero** real repo names,
  mapping data, or audit results. It's just generic automation code.
- All of the account's actual data — the real repo names, the Lovable
  project → repo mapping, daily logs — lives only in the private
  `lovable-repository-audit` repo, and is read/written by this workflow
  entirely over the GitHub API at runtime. It is never written to disk in
  this checkout and never committed here.

## What this does not do

It does not fix the account's underlying billing problem. Any other
private-repo Actions workflow, Codespaces instance, or other paid feature
on the account is still blocked until that's resolved at
**[github.com/settings/billing](https://github.com/settings/billing)**.
This only routes one specific automation around that block.

## Setup

Requires a repository secret `LOVABLE_AUDIT_PAT` (a PAT with `repo` scope
and admin rights on the repos being managed) — see the parent repo's
README for the full one-time setup (`lovable-mapping.json`) that has to
exist in the private data repo before this scheduler has anything to act
on.
