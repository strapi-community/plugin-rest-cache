---
title: Types
---

# {{ $frontmatter.title }}

The plugin publishes its public types as a separate entry point:

```ts
import type {
  CacheProvider,
  CachePluginStrategyInput,
  CacheSummary,
} from "@strapi-community/plugin-rest-cache/types";
```

Use them when [writing a custom provider](../providers/custom.md), when typing
your own `config/plugins.ts`, or when consuming the
[admin API](./routes.md) from your own code.

[**Browse the generated API reference →**](./api/)

That reference is generated from the source with TypeDoc, so it cannot drift
from what ships. Regenerate it with `pnpm run docs:api`.

## The types worth knowing

### CacheProvider

The abstract class every provider extends. `get`, `set`, `del`, `keys` and
`ready` are required; `delMany` and `clear` have working defaults and only need
overriding when the backing store has batch operations. See
[Custom provider](../providers/custom.md).

### Branded primitives

Several aliases look like plain `string` or `number` but are branded, so the
compiler refuses to swap them:

| Type | Why it exists |
| --- | --- |
| `Milliseconds` | Durations were once converted twice, so a configured hour lived 41.7 days. ([#126](https://github.com/strapi-community/plugin-rest-cache/issues/126)) |
| `ConfiguredRoutePath` / `RegisteredRoutePath` | A path as written in config and a path as Strapi registered it were compared directly, leaving routes with a trailing `+` silently uncached. |
| `CacheKey` | Redis tracks keys fully qualified (`keyv:/api/foo`); returning that form made purge patterns match nothing while the deletes addressed keys that did not exist. ([#131](https://github.com/strapi-community/plugin-rest-cache/issues/131)) |

Each one records a bug that shipped because two values shared a primitive type
and were therefore interchangeable to a reader. If you are writing against
these types and the compiler objects, it is usually right.

To construct one, use the helper rather than a cast:

```ts
import { ms } from "@strapi-community/plugin-rest-cache/types";

const maxAge = ms(3600000); // Milliseconds
```

### Input versus resolved config

`CachePluginStrategyInput` is what you *write* in `config/plugins`; partial,
with everything optional. `CachePluginStrategy` is what the plugin *runs on*
after defaults are applied and routes are resolved. The two used to be one
declaration, which described neither accurately.

The admin API returns the resolved form — which is why the
[dashboard](../admin/index.md) is the reliable place to check whether a setting
took effect.
