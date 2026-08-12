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

# `${1-...}` not `${1:-...}`: the former substitutes only when the argument is
# *omitted*, so an explicitly-passed empty string reaches the guard below instead
# of silently falling through to a live API query. That distinction is what makes
# the no-runs-recorded branch reachable from a test.
last="${1-$(last_run)}"

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
