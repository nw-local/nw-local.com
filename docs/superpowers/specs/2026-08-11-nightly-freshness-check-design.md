# Nightly Freshness Check

**Date:** 2026-08-11
**Status:** Approved

## Problem

The nightly audit (`.github/workflows/nightly.yml`) stopped running after 2026-07-24 and nobody noticed for 18 days.

GitHub silently disables scheduled workflows in **public** repositories after 60 days without repository activity. The last commit before the August burst was `3445635` on 2026-05-24; the last scheduled run was 2026-07-24, 61 days later. This repository works in bursts with long dormancy between them (2026-05-24 → 2026-08-04 was a 72-day gap), so crossing the 60-day line is normal here, not exceptional.

The outage was undetectable from every signal the repo exposes:

- `gh workflow list` reported `state: active` throughout.
- `workflow_dispatch` worked perfectly — a manual run on 2026-08-12 passed all four jobs in 2m1s.
- No run failed, so GitHub sent no failure email. GitHub notifies on scheduled workflows that *fail*, never on ones that stop being scheduled.

The only symptom was an absence, and nothing watched for absences. Meanwhile the nightly is the sole place external links are checked — PR #25 deliberately moved external-link checking off pull requests — so a dead third-party link on a live public site would have gone unreported indefinitely.

A separate GitHub-side defect surfaced during diagnosis: the `workflow_dispatch` run from 2026-08-04 (`30958256147`) never created a single job and is permanently stuck in `queued`. Both `cancel` and `force-cancel` return HTTP 500. It is inert — a fresh dispatch started in under 25 seconds while it sat there — but it is uncancellable and will remain visible in the Actions list.

## Decision

Add a `nightly-freshness` job to `ci.yml` that fails when the last completed **scheduled** run of `nightly.yml` is older than 3 days.

Three decisions shape it, each rejecting a simpler alternative:

**Detect on next interaction, not continuously.** During dormancy nothing is published and the site is static, so the only decay is external link rot on someone else's server. Learning at the start of the next active burst is sufficient. This rejects an external dead-man's switch (healthchecks.io or similar), which would alert during dormancy at the cost of a third-party account and a secret, and rejects a keepalive workflow that pushes bot commits to reset the 60-day clock.

**Fail on pushes to `main`, never on pull requests.** A stale nightly is repo-wide infrastructure breakage that the PR author did not cause and cannot fix. Blocking their merge on it repeats exactly the problem PR #25 solved when it moved external-link checks off pull requests. Failing on `main` still turns the branch red and triggers GitHub's failure email — loud, on a channel already monitored, without holding up unrelated work.

**Threshold of 3 days.** Tolerates two consecutive GitHub-skipped nightlies without crying wolf. The 60-day disable presents as roughly 12 days stale by the time the next burst begins, so 3 days catches it with wide margin.

The comparison is strictly greater-than on whole days of age (`age_days > 3`): an age of exactly 3 days passes, 4 days and above fails.

## Changes

### 1. New job — `.github/workflows/ci.yml`

Add a `nightly-freshness` job. It depends on no other job, runs in parallel with `typecheck` and `audit`, and is gated with `if: github.event_name == 'push'` so it is skipped entirely on pull requests.

Permissions are declared at the **job** level, not the workflow level: the job needs `actions: read` to query run history, and scoping it here leaves the existing jobs on `contents: read` unchanged.

The check is a single `gh api` call against the workflow's run history, filtered on two parameters that are load-bearing:

- **`event=schedule`** — a `workflow_dispatch` run proves the workflow *can* run, not that GitHub is still firing the cron. A check that accepted dispatches would have reported healthy throughout the entire 18-day outage.
- **`status=completed`** — run `30958256147` sat in `queued` for seven days without ever creating a job. A check that treated the existence of a run as proof of life would have been fooled by that exact record.

Both reasons belong in comments; without them the parameters read as arbitrary.

The runner is `ubuntu-latest`, so date math uses GNU `date -d`. (BSD `date -jf` is required to run the same query on macOS — a difference that passes locally and breaks in CI.)

### 2. Failure message

The `::error::` annotation carries the remedy, not just the diagnosis:

```
Nightly cron has not fired in <N> days (last: <timestamp>, threshold: 3d).
GitHub silently drops the schedule after 60 days of repo inactivity — the workflow
still reports state=active and manual dispatch still works, so those prove nothing.
Fix: gh workflow disable nightly.yml && gh workflow enable nightly.yml
Then confirm a run with event=schedule appears within ~24h.
```

This is the substance of the change. Diagnosing the outage consumed most of a session; the check exists so the next occurrence costs one read.

### 3. Invariant — `CLAUDE.md`

Record the 60-day rule, the misleading `state: active` signal, and the toggle remedy in the Invariants section, with this PR as the reference.

### 4. Out of scope

- The orphaned run `30958256147` is left in place. It cannot be cancelled through the API and is harmless; only GitHub Support could clear it, which is not worth a ticket.
- No alerting during dormancy (explicitly declined — see Decision).
- `nightly.yml` and `audit.yml` are unchanged.

## Error handling

An empty query result — no completed scheduled run has ever been recorded — fails rather than passing vacuously. A check that reads "no data" as "no problem" reproduces the original silent failure in a new place.

The script runs under `set -euo pipefail`, so a failed or malformed `gh api` call fails the job rather than yielding an empty timestamp that would be misread as a stale nightly. The distinction matters for the operator: "the API call broke" and "the cron is dead" warrant different responses.

## Testing

No test framework is configured. Verification is:

- Run the check's script logic locally against a stale timestamp (2026-07-24, the real value) and a fresh one, confirming both branches behave correctly.
- `make lint` stays clean.
- The merge to `main` exercises the job for real.

## Sequencing

**This check fails the moment it merges.** The last completed scheduled run is 2026-07-24, ~18 days stale against a 3-day threshold. That is the check working correctly: the cron has not yet proven itself since the disable/enable toggle applied during diagnosis.

The merge gate and the outstanding verification are therefore the same event. Hold the PR until a run with `event=schedule` actually appears — expected on or after 2026-08-12 at 08:27 UTC, historically landing 10:00–11:30 UTC due to GitHub's shared-runner delay — then merge onto a green signal.

If that run does not appear, the toggle did not work, the root cause is not yet understood, and this PR must not merge; it would sit red indefinitely and train everyone to ignore a red `main`.
