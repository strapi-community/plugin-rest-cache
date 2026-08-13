---
title: Introduction
---

# {{ $frontmatter.title }}

REST Cache stores the responses your Strapi API sends, and serves them again
without touching the database. When content changes, it clears what that change
affected.

The second half is the difficult half, and it is what this plugin is really
for. Caching is easy; knowing when to stop is not.

## How it works

A `GET` to a cached route is answered from the store when an entry exists for
its [cache key](./caching/keys.md), and otherwise passed through, with the
response stored on the way back.

Invalidation hooks the **document service**, which every write in Strapi passes
through — REST, GraphQL, the content manager, the deprecated entity service,
scheduled Content Releases, review workflows, and any `strapi.documents()` call
of your own. A change made through any of them clears the entries it affects,
including those of [related content types](./invalidation/index.md).

That matters because the obvious alternative — watching HTTP routes for writes
— cannot see a GraphQL mutation or a scheduled release, and drifts out of step
with Strapi's route list every time that list changes.

## What you get

- **Pluggable storage.** In-memory for a single instance,
  [Redis](./providers/redis.md) (or KeyDB, or Valkey) when several instances
  need to share one cache, or [your own](./providers/custom.md).
- **Per-content-type and per-route control** over lifetime, key composition and
  when to bypass the cache entirely.
- **Cache keys you decide.** Query parameters, request headers, and
  [per-caller keys](./caching/keys.md#per-caller-keys) for authenticated
  traffic.
- **Request coalescing.** Concurrent requests for the same missing key make one
  call to the origin, not one each — which is exactly what you want on a cold
  start or straight after a purge.
- **ETag and `304`** support, and `X-Cache` headers for seeing what happened.
- **An [admin panel](./admin/index.md)** showing what is cached right now, with
  purge controls.

## When not to use it

This plugin caches REST responses. It does not cache GraphQL responses — though
a GraphQL mutation still invalidates what it changes, so the two coexist
safely.

It also will not make a slow query fast for the person who triggers it. A cache
miss costs the original query plus the write to the store. What it changes is
what the next reader pays.

## Start here

- [Getting started](./getting-started.md) — install, configure, verify
- [How caching works](./caching/index.md)
- [How invalidation works](./invalidation/index.md)
- [Configuration reference](./reference/config.md)
