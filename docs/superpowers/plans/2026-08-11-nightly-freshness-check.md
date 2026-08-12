# Nightly Freshness Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fail `main`'s CI loudly when the nightly audit's cron has stopped firing, so a silently-disabled schedule cannot go unnoticed for 18 days again.

**Architecture:** A bash script in `scripts/` queries the GitHub Actions API for the most recent *completed, scheduled* run of `nightly.yml` and exits non-zero when it is more than 3 days old. A new `nightly-freshness` job in `ci.yml` runs it on pushes to `main` only. The script is portable across GNU and BSD `date` so it can be verified locally before it ever reaches CI.

**Tech Stack:** bash, GitHub CLI (`gh`), GitHub Actions, GNU Make.

## Global Constraints

- Threshold is `MAX_AGE_DAYS=3`, compared strictly greater-than: an age of exactly 3 days passes, 4+ fails. It is a script constant, not an env var — see Task 1 for why.
- Only runs with `event=schedule` count. A `workflow_dispatch` run proves the workflow can run, not that the cron fires.
- Only runs with `status=completed` count. A run can sit in `queued` indefinitely.
- The check runs on pushes to `main` only, never on pull requests.
- Runner is `ubuntu-latest` (GNU `date -d`); local verification happens on macOS (BSD `date -jf`). The script must handle both.
- GitHub Actions annotations (`::error::`) are single-line. Multi-line context goes to stderr separately.
- Action versions match the repo's existing pins: `actions/checkout@v6`.
- Shell scripts use `#!/usr/bin/env bash` and `set -euo pipefail`, matching `scripts/prep-images.sh`.
- No Claude attribution in commit messages.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/check-nightly-freshness.sh` (create) | Sole owner of the freshness rule: fetch last scheduled run, compare against threshold, report. Testable standalone. |
| `Makefile` (modify) | Expose the script as `make check-nightly`, matching the existing script→target convention. |
| `.github/workflows/ci.yml` (modify) | Wire the script into CI as a `nightly-freshness` job gated to pushes. |
| `CLAUDE.md` (modify) | Record the 60-day rule as a project Invariant. |

The script owns the logic; the workflow owns only *when* it runs. That split is why the logic is verifiable without pushing a commit.

---

### Task 1: The freshness script

**Files:**
- Create: `scripts/check-nightly-freshness.sh`
- Modify: `Makefile:6` (`.PHONY` line), and a new target after `prep-images` at `Makefile:33-34`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: an executable at `scripts/check-nightly-freshness.sh` accepting an optional RFC3339 timestamp as `$1` (when absent it queries the API) and reading `GITHUB_REPOSITORY` from the environment. Exit `0` = fresh, `1` = stale/unknown. Task 2 invokes it with no arguments.

- [ ] **Step 1: Write the script**

Create `scripts/check-nightly-freshness.sh`:

```bash
#!/usr/bin/env bash
#
# Fail if the nightly audit's cron has stopped firing.
#
# GitHub silently disables scheduled workflows in public repositories after 60
# days without repository activity. The workflow keeps reporting state=active and
# manual dispatch keeps working, so neither is evidence that the schedule is
# alive — only a completed run with event=schedule is.
#
# Usage:
#   make check-nightly                            # query GitHub for the last run
#   ./scripts/check-nightly-freshness.sh <ts>     # check an explicit RFC3339 timestamp
#
# Env:
#   GITHUB_REPOSITORY  owner/repo to query (defaults to the current checkout)

set -euo pipefail

# Deliberately a constant, not an overridable env var. The threshold is a design
# decision (3 tolerates two consecutive GitHub-skipped nightlies without crying
# wolf), not environmental variance — loosening it should require an edit that
# shows up in a diff and gets reviewed, not an env var set somewhere out of sight.
MAX_AGE_DAYS=3
WORKFLOW="nightly.yml"

# GNU date (ubuntu-latest, where this runs in CI) and BSD date (macOS, where it
# gets verified by hand) take different flags to parse a timestamp. Supporting
# both is what makes this script checkable on the machine it was written on
# instead of only after it merges.
to_epoch() {
  date -u -d "$1" +%s 2>/dev/null || date -u -jf '%Y-%m-%dT%H:%M:%SZ' "$1" +%s
}

last_run() {
  local repo="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
  # event=schedule: a workflow_dispatch run proves the workflow *can* run, not
  #   that GitHub is still firing the cron. A check that accepted dispatches
  #   would have read healthy through the whole 18-day outage this exists to catch.
  # status=completed: run 30958256147 sat in `queued` for seven days without ever
  #   creating a job, and could not even be cancelled. Treating "a run exists" as
  #   proof of life would have been fooled by precisely that record.
  gh api \
    "repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=schedule&status=completed&per_page=1" \
    -q '.workflow_runs[0].created_at // empty'
}

last="${1:-$(last_run)}"

if [[ -z "$last" ]]; then
  echo "::error::No completed scheduled run of ${WORKFLOW} has ever been recorded." >&2
  exit 1
fi

age_days=$(( ( $(date -u +%s) - $(to_epoch "$last") ) / 86400 ))
echo "Last completed scheduled nightly: ${last} (${age_days}d ago, threshold ${MAX_AGE_DAYS}d)"

if (( age_days > MAX_AGE_DAYS )); then
  echo "::error::Nightly cron has not fired in ${age_days} days (last: ${last}, threshold ${MAX_AGE_DAYS}d). Fix: gh workflow disable ${WORKFLOW} && gh workflow enable ${WORKFLOW}" >&2
  cat >&2 <<'CONTEXT'

GitHub silently drops the schedule after 60 days of repository inactivity. The
workflow still reports state=active and manual dispatch still works, so neither
is evidence of a healthy cron. After re-enabling, confirm a run with
event=schedule appears within ~24h — a successful manual dispatch does not count.
CONTEXT
  exit 1
fi

echo "Nightly cron is firing."
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/check-nightly-freshness.sh
```

- [ ] **Step 3: Verify the failing branch against real current state**

The last completed scheduled run is genuinely ~18 days old right now, so the live query must fail. This is the real test, not a simulation.

Run: `./scripts/check-nightly-freshness.sh`

Expected: exit code `1`, output naming the 2026-07-24 timestamp and an age well above 3 days, followed by the fix instructions. Confirm the exit code explicitly:

```bash
./scripts/check-nightly-freshness.sh; echo "exit=$?"
```

Expected: `exit=1`

- [ ] **Step 4: Verify the passing branch**

Pass a timestamp of right now, which must be 0 days old:

```bash
./scripts/check-nightly-freshness.sh "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "exit=$?"
```

Expected: `Last completed scheduled nightly: <now> (0d ago, threshold 3d)`, `Nightly cron is firing.`, `exit=0`

This step also proves the BSD `date` fallback in `to_epoch` works — if it did not, this call would error instead of printing `0d`.

- [ ] **Step 5: Verify the boundary**

Exactly 3 days old must pass; 4 days must fail.

```bash
./scripts/check-nightly-freshness.sh "$(date -u -v-3d +%Y-%m-%dT%H:%M:%SZ)"; echo "exit=$?"
./scripts/check-nightly-freshness.sh "$(date -u -v-4d +%Y-%m-%dT%H:%M:%SZ)"; echo "exit=$?"
```

Expected: first prints `(3d ago...)` and `exit=0`; second prints `(4d ago...)` and `exit=1`.

(`date -v-3d` is BSD/macOS syntax for relative dates. On Linux the equivalent is `date -u -d '3 days ago'`.)

- [ ] **Step 6: Verify the empty-result branch**

An empty timestamp must fail rather than pass vacuously:

```bash
./scripts/check-nightly-freshness.sh ""; echo "exit=$?"
```

Expected: `No completed scheduled run of nightly.yml has ever been recorded.`, `exit=1`

- [ ] **Step 7: Add the Makefile target**

Add to the `.PHONY` list on `Makefile:6` (append `check-nightly` after `prep-images`), then add the target after the `prep-images` target:

```make
check-nightly: ## Verify the nightly audit's cron is still firing
	@./scripts/check-nightly-freshness.sh
```

Target name is kept short deliberately: `make help` formats names with `%-18s`, so a longer name would misalign the help column.

- [ ] **Step 8: Verify the target works**

```bash
make check-nightly; echo "exit=$?"
make help
```

Expected: `make check-nightly` behaves identically to Step 3 (`exit=1`), and `make help` lists `check-nightly` with its description in an aligned column.

- [ ] **Step 9: Commit**

```bash
git add scripts/check-nightly-freshness.sh Makefile
git commit -m "feat: add nightly cron freshness check script

Queries the Actions API for the most recent completed run of nightly.yml
with event=schedule. Dispatches and queued runs are both excluded: a manual
dispatch proves the workflow can run rather than that the cron fires, and a
run can sit in queued indefinitely without creating a job.

Portable across GNU and BSD date so it can be verified locally."
```

---

### Task 2: Wire it into CI

**Files:**
- Modify: `.github/workflows/ci.yml` (append a new job after `audit`)

**Interfaces:**
- Consumes: `scripts/check-nightly-freshness.sh` from Task 1, invoked with no arguments.
- Produces: a `nightly-freshness` job. No later task depends on it.

- [ ] **Step 1: Add the job**

Append to `.github/workflows/ci.yml`:

```yaml
  nightly-freshness:
    name: Nightly freshness
    # Pushes to main only. A stale nightly is repo-wide infrastructure breakage
    # that a contributor's PR neither caused nor can fix; failing their PR on it
    # would repeat the problem #25 solved by moving external-link checks off
    # pull requests. Failing here still reddens main and triggers GitHub's
    # failure email.
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    # Job-level permissions REPLACE the workflow-level block rather than merging
    # with it, so contents: read must be restated or actions/checkout loses access.
    permissions:
      contents: read
      actions: read
    steps:
      - uses: actions/checkout@v6
      - name: Check the nightly cron is still firing
        run: ./scripts/check-nightly-freshness.sh
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] **Step 2: Verify the YAML parses and the gate is correct**

```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); j=d['jobs']['nightly-freshness']; print('gate:', j['if']); print('perms:', j['permissions']); print('jobs:', list(d['jobs']))"
```

Expected: `gate: github.event_name == 'push'`, `perms: {'contents': 'read', 'actions': 'read'}`, and the job list containing `typecheck`, `audit`, `nightly-freshness`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: fail main when the nightly cron stops firing

Runs on pushes to main only, matching the split #25 established: repo-wide
infrastructure breakage should not block a contributor's unrelated PR, but
it should redden main and send the failure email."
```

---

### Task 3: Record the Invariant

**Files:**
- Modify: `CLAUDE.md` (the `## Invariants` section, after the existing `prep-images` bullet)

**Interfaces:**
- Consumes: the script path from Task 1 and the job name from Task 2.
- Produces: documentation only.

- [ ] **Step 1: Add the Invariant bullet**

Append to the `## Invariants` section of `CLAUDE.md`:

```markdown
- **GitHub disables this repo's nightly cron after 60 days of inactivity, silently.** The repo is public, and it is worked on in bursts with long gaps between them (2026-05-24 → 2026-08-04 was 72 days), so it crosses that line routinely rather than exceptionally. When it happens every signal still reads healthy: `gh workflow list` reports `state: active`, `workflow_dispatch` runs succeed, and nothing fails so no failure email is sent. The only symptom is the *absence* of runs with `event=schedule` — which is why neither a green manual dispatch nor an active-looking workflow is evidence of a working cron. Remedy: `gh workflow disable nightly.yml && gh workflow enable nightly.yml`, then confirm a scheduled run appears within ~24h. `scripts/check-nightly-freshness.sh`, wired into `ci.yml` as the `nightly-freshness` job on pushes to `main`, now fails loudly when this recurs. Background: `docs/superpowers/specs/2026-08-11-nightly-freshness-check-design.md`.
```

- [ ] **Step 2: Verify it renders and sits in the right section**

```bash
grep -n -A3 '^## Invariants' CLAUDE.md
```

Expected: the `prep-images` bullet followed by the new bullet, both under `## Invariants`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the 60-day scheduled-workflow disable as an Invariant

Diagnosing this cost most of a session, largely because state=active and a
green manual dispatch both read as evidence of health and neither is."
```

---

### Task 4: Final checks and PR

**Files:** none modified.

**Interfaces:** consumes the commits from Tasks 1–3.

- [ ] **Step 1: Run the project's checks**

```bash
make lint
make format
git status --short
```

Expected: lint clean, formatter produces no changes (it is eslint-only and this branch touches no JS/TS), working tree clean.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin worktree-nightly-freshness-check
```

- [ ] **Step 3: Open the PR**

Run as a separate command from the push — the push-to-main guard false-positives on compound commands containing "main".

The PR body must state the merge gate prominently: this check fails until a run with `event=schedule` lands, which is expected on or after 2026-08-12 08:27 UTC (historically 10:00–11:30 UTC given GitHub's shared-runner delay).

- [ ] **Step 4: Confirm the merge gate before merging**

```bash
gh run list --workflow nightly.yml --limit 5
```

Expected before merge: a row with event `schedule` and a `created_at` newer than 2026-07-24.

**Do not merge until that row exists.** If it never appears, the disable/enable toggle did not fix the cron, the root cause is not yet understood, and merging would leave `main` permanently red — which trains everyone to ignore a red `main` and destroys the value of the check.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `nightly-freshness` job in `ci.yml` | Task 2 |
| `if: github.event_name == 'push'` gate | Task 2, Step 1 |
| Job-level `actions: read` | Task 2, Step 1 (plus `contents: read`, see note) |
| `event=schedule` filter + rationale comment | Task 1, Step 1 |
| `status=completed` filter + rationale comment | Task 1, Step 1 |
| `MAX_AGE_DAYS: 3`, strict `>` | Task 1, Steps 1 and 5 (as a constant, not an env var) |
| Empty result fails, not passes | Task 1, Steps 1 and 6 |
| `set -euo pipefail` | Task 1, Step 1 |
| Failure message carries the remedy | Task 1, Step 1 |
| GNU vs BSD `date` | Task 1, Step 1 (`to_epoch`), verified Step 4 |
| CLAUDE.md Invariant | Task 3 |
| Orphaned run left in place | No task — correctly out of scope |
| Merge held until a scheduled run lands | Task 4, Step 4 |

**Deviation from the spec, deliberate:** the spec described the check as inline in `ci.yml`; the plan extracts it to `scripts/check-nightly-freshness.sh`. This follows the repo's existing script→`make` convention and is what makes the spec's own "verify locally against a stale and a fresh timestamp" testing requirement executable. The spec's Testing section already assumed a runnable script.

**Addition beyond the spec:** the spec's job-level permission note said `actions: read` only. Job-level `permissions` replaces the workflow-level block rather than merging, so `contents: read` must be restated or `actions/checkout` fails. Corrected in Task 2.

**Placeholder scan:** none. The Invariant references the committed spec path rather than an unknown PR number.

**Type consistency:** the script name, `MAX_AGE_DAYS`, the `nightly-freshness` job name, and the `check-nightly` make target are used identically in every task that mentions them.
