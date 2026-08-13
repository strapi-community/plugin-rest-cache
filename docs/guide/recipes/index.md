---
title: Recipes
---

# {{ $frontmatter.title }}

Each recipe is a shape of application, a configuration that fits it, and an
honest account of what that configuration costs you. They are meant to be
copied and then adjusted, not read end to end.

The rest of this guide explains how the plugin works —
[the read path](../caching/index.md), [cache keys](../caching/keys.md),
[invalidation](../invalidation/index.md), and
[every option](../reference/config.md). These pages assume that and only cover
the decisions.

## Which one am I?

| If this describes you | Read | The decision it turns on |
| --- | --- | --- |
| A public site or app. Anonymous readers, content edited in the admin panel, no per-user responses. | [Public content API](./public-content.md) | A long `maxAge`, because invalidation makes it safe. |
| Logged-in users hitting the API with a JWT or an API token, and you want those responses cached too. | [Authenticated responses](./authenticated.md) | `hitpass: false` **and** `keys.useAuth: true`, together. |
| More than one Strapi process behind a load balancer, or a container that restarts often. | [Several instances, one cache](./multi-instance.md) | Redis. The memory provider cannot do this. |
| Most of the API is fine, but two or three endpoints are slow enough to hurt. | [A few expensive routes](./expensive-routes.md) | `injectDefaultRoutes: false` and an explicit route list. |
| Many locales, or clients that send long `filters`/`populate`/`pagination` query strings. | [Locales and query-heavy APIs](./i18n-and-query.md) | Whether `useQueryParams` is `true` or an allow-list. |
| A preview or draft workflow that must always show the current editorial state. | [Previews and drafts](./previews-drafts.md) | A `hitpass` that recognises preview traffic. |

More than one of these usually applies at once. They compose: the multi-instance
recipe is a provider choice, the query recipe is a key choice, and neither
conflicts with the others.

## Before you start

- Every duration in this plugin is **milliseconds**. `3600000` is one hour.
- Turn on `enableXCacheHeaders` while you are configuring. Every recipe below
  verifies itself with it, and you can turn it off again afterwards.
- Nothing is cached until you list content types in `strategy.contentTypes`.
  If you have not installed the plugin yet, start with
  [Getting started](../getting-started.md).
