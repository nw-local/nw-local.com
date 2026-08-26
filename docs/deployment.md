# Deployment

Two things deploy independently: the public site, and the Sanity Studio editors use.

## The site

Auto-deploys to GitHub Pages on every push to `main`.

```text
git push origin main
        │
        ▼
GitHub Actions: .github/workflows/deploy.yml
        │
        ├── checkout
        ├── withastro/action@v6 (install, build with secrets injected)
        └── actions/deploy-pages@v5 → https://nw-local.com
```

The build fetches all content from Sanity at build time, so a deploy reflects whatever is *published* in Sanity at the moment it runs — not whatever was there when the commit was written.

## The Studio

Hosted separately at <https://nw-local.sanity.studio/> and deployed with `make deploy-studio`. It does **not** deploy with the site.

Anything that changes the editing experience — a new document type, a schema field, the sidebar in `studio/structure.ts` — needs `make deploy-studio` before editors see it, even after the code merges.

## Sanity webhook

When an editor publishes content, Sanity POSTs to the GitHub Actions `workflow_dispatch` endpoint to trigger a rebuild. End to end, publish → live is roughly 1-2 minutes.

| | |
|---|---|
| Webhook URL | `https://api.github.com/repos/nw-local/nw-local.com/actions/workflows/deploy.yml/dispatches` |
| Projection | `{"ref": "main"}` |
| Auth | Fine-grained GitHub PAT with Actions (read/write) on the repo |
| Configured at | sanity.io/manage → project `nyd3p2n0` → API → Webhooks |

If publishes ever stop triggering deploys, check that webhook URL first — a repo rename leaves it pointing at the old path, and POST bodies do not reliably survive GitHub's 301.

Asset creation triggers a rebuild too, not just document publishes. Uploading an image through `make upload-image` fires the same `workflow_dispatch` webhook, so a session that uploads three images and publishes one document queues four deploys. The concurrency group added in #40 cancels the redundant ones, so this is wasteful rather than harmful, but it does mean "publish equals one rebuild" is the wrong mental model when reasoning about deploy counts.

## Deploy concurrency

The webhook fires one dispatch per *published document*, not one per publish action. A batch of 22 documents queues 22 builds, all rebuilding `main` against the same dataset. GitHub Pages permits exactly one deployment at a time, so those builds race each other, and any push to `main` landing in the same window loses:

```text
Deployment request failed for b6962b4... due to in progress deployment.
Please cancel 5618c8f... first or wait for it to complete.
```

`deploy.yml` declares a workflow-level `concurrency` group so they serialize instead:

```yaml
concurrency:
  group: pages-deploy
  cancel-in-progress: false
```

`cancel-in-progress: false` is deliberate and follows GitHub's own Pages guidance. A *queued* run is superseded by a newer one, which is what collapses the dispatch storm, since every queued run would build the same thing anyway. A deployment already *in flight* is allowed to finish rather than being interrupted mid-publish. Setting it to `true` would also stop the collision, but it can cancel a live production deploy in order to replace it with an identical one.

The reason this went unnoticed for so long is that it leaves almost no trace. A later dispatch goes green and supersedes the failed run, so the only evidence is one red entry on a workflow nobody watches. Seen 2026-08-12, when a glossary publish collided with a push to `main` ([run 31576537317](https://github.com/nw-local/nw-local.com/actions/runs/31576537317)).

## Publish/rebuild ordering

The webhook dispatches against `main`. A publish therefore rebuilds using whatever code is on `main` at that moment, **not** the branch you are working on.

So content that depends on new code has to wait for that code to merge. Publishing first produces a build where the new field exists in the data and nothing renders it. The order is always:

1. Merge the code to `main` and let the deploy finish
2. `make deploy-studio` if the schema or Studio changed
3. Create or update the content in Sanity
4. Confirm the publish triggered a deploy

Code must therefore tolerate content that has not been backfilled yet — see the Organization author fallback described in [seo.md](seo.md) for a worked example.

### The exception: slug renames

A rename that adds a `redirects` entry to `astro.config.mjs` inverts the order above. **Publish the Sanity rename first, then merge the code.**

Astro's docs say configured redirects rank below "matching physical page files", which reads as a promise that the entry stays dormant until the content rebuild stops emitting the old slug. It does not. Precedence is decided by route specificity, and a static redirect pattern outranks the rest route in `src/pages/strains/[...slug].astro`, so the entry replaces the real page the moment it lands. Merging first therefore points a working URL at a slug that does not exist yet and breaks both ends instead of one; publishing first costs only the old URL 404ing for the length of the rebuild.

Nothing errors in either direction. The build succeeds and deploys clean, and the only build-time symptom is the page count dropping by one, so read that number on any change touching routing.

Renaming a strain also means patching both copies of its alt text and its image asset metadata. The full checklist is step 7a of [`.claude/skills/update-strain/SKILL.md`](../.claude/skills/update-strain/SKILL.md), and the reasoning is in the Invariants section of [`CLAUDE.md`](../CLAUDE.md).
