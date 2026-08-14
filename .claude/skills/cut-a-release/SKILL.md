---
name: cut-a-release
description: Publish this plugin to npm - a production release, a pre-release, or an experimental build from a branch. Use when preparing or shipping a release, updating the changelog, or debugging the publish workflow.
---

# Cutting a release

Publishing is **always manual**. There is no trigger that publishes on merge,
and there must never be one. Two humans gates stand in front of npm: pressing
"Publish release" on a draft, and approving the deployment environment.

## The pieces

| | |
| --- | --- |
| `release-please.yml` | Watches `main`, maintains one rolling release PR, and creates **draft** GitHub Releases. Publishes nothing. |
| `publish.yml` | The only thing that talks to npm. Never fires on merge. |
| `release-please-config.json` | Changelog sections, package list, `draft: true`. |
| `.release-please-manifest.json` | Current version per package. release-please owns this; do not hand-edit. |

## Production release

1. Merge work to `main` using conventional commits. release-please keeps a
   `chore: release X.Y.Z` PR up to date, with the changelog grouped by change
   type.
2. Review that PR. The version comes from the commit types since the last
   release — `feat` gives a minor, `fix` a patch, `!` or a `BREAKING CHANGE:`
   footer a major. If the proposed version is wrong, the commit messages are
   wrong; fix them rather than editing the version.
3. Merge it. release-please tags and creates **draft** Releases.
4. Go to Releases, review, press **Publish release**.
5. `publish.yml` starts and waits on the `npm-latest` environment. A maintainer
   approves. It packs and publishes to the `latest` tag.

The draft step is not ceremony: a Release created by `GITHUB_TOKEN` does not
trigger other workflows, so an auto-published one would silently never reach
npm.

## Pre-release

Same flow, but mark the GitHub Release as a pre-release before publishing it.
`publish.yml` reads `github.event.release.prerelease` and switches to the
`next` dist-tag and the `npm-prerelease` environment.

Users install with `npm install @strapi-community/plugin-rest-cache@next`.

## Experimental build from a pull request

The easy path. Add the **`publish-experimental`** label to a pull request. It
publishes `0.0.0-experimental.<pr head sha>` to the `experimental` dist-tag and
comments on the PR with the exact install command.

The workflow then **removes the label again**, including when the publish
failed. The label is a one-shot request, not a mode: to cut another build after
pushing more commits, add it back. It deliberately no longer fires on
`synchronize`, which used to republish silently on every push for as long as
the label happened to still be attached.

Same-repo pull requests only; a fork PR never reaches the publish job.

## Experimental build from a branch

When there is no pull request, or you want a specific branch.

Run the **publish** workflow from the **Actions** tab:

- keep the branch selector on **main** — this matters, see below;
- `mode`: `experimental`;
- `target_branch`: the branch to build.

It publishes `0.0.0-experimental.<sha>` to the `experimental` dist-tag. Install
by exact version, not by tag — the tag is clobbered by the next experimental
build:

```bash
npm install @strapi-community/plugin-rest-cache@0.0.0-experimental.<sha>
```

### Why the branch selector must stay on main, and why the PR trigger is `pull_request_target`

npm trusted publishing is **not branch-scoped**. It checks the repository, the
workflow *filename* and the environment, and discards the ref. Since
`workflow_dispatch` runs the workflow file from the branch you pick, choosing a
feature branch would hand that branch's own YAML a publish-capable token — and
`npm publish` defaults to `--tag latest`.

The label trigger has the same problem in a different shape: plain
`pull_request` would run the PR branch's copy of the workflow, with publish
credentials in scope. That is what Strapi's own experimental workflow does, and
it is a real accepted risk on their side. This one uses
`pull_request_target`, which runs the workflow file as it exists on the default
branch, so neither the environment gate nor the version assertion can be edited
by the branch being published.

The usual `pull_request_target` trap - checking out untrusted code in a job
holding secrets - does not apply here, because the build job holds neither
secrets nor an id-token.

So the workflow takes the branch as an *input* instead. The build job checks it
out but has no `id-token` and no environment; the publish job runs from main's
YAML and asserts the version matches `0.0.0-experimental.<40 hex>` before
publishing. Both halves are needed: without the assertion, a poisoned build
could stamp `5.99.0`, which every `^5.0.0` range would resolve regardless of
dist-tag.

## Things that will break a release

**Everything publishing lives in `publish.yml` and must stay there.** npm
validates the workflow *filename* and allows only one trusted-publisher config
per package, so a second publishing workflow file would fail authentication.

**Never `npm publish` from a package directory.** npm does not understand the
`workspace:` protocol and would publish `workspace:*` literally, producing a
manifest nobody can install. The workflow runs `pnpm pack` first and publishes
the tarball. The plugin depends on the memory provider this way, so this
affects the primary package.

**The build must run before packing, and in order.** The providers typecheck
against the plugin's emitted declarations, so `pnpm run build` builds the
plugin first, then the providers. `files` is `["dist"]` — an unbuilt package
publishes an empty directory.

**Node 24 or newer in the publish job.** Trusted publishing needs npm ≥ 11.5.1
and no Node 22 release ships one.

## If a publish fails

- *Waiting for approval* — expected. Someone with reviewer rights approves the
  deployment.
- *401/403 from npm* — the trusted publisher config on npmjs.com does not match
  this workflow's filename or environment name. Both are exact, case-sensitive
  strings.
- *`ERESOLVE` installing an experimental build* — the internal peer ranges were
  not rewritten. `scripts/stamp-experimental-version.mjs` pins them to the exact
  experimental version because a `^5.x` peer cannot satisfy `0.0.0-*`.
- *Version assertion failed* — the build produced a version that does not match
  the mode. Treat this as a real signal, not a check to relax.

## Never

- Add a trigger that publishes on a push to a branch, or on a merge. The
  labelled-PR trigger is deliberate and only ever produces `0.0.0-experimental`
  builds; nothing may reach the `latest` tag without a human pressing publish.
- Change the PR trigger from `pull_request_target` to `pull_request`.
- Give the build job `id-token: write`, an environment, or any secret.
- Remove the version-shape assertion.
- Add a second workflow file that publishes.
