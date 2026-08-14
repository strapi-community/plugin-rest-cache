# Class: CacheControlConfig

Defined in: CacheControlConfig.ts:29

What `Cache-Control` to put on a response this plugin cached.

Design and original implementation by `@pinkasey` in
https://github.com/strapi-community/plugin-rest-cache/pull/96, which targeted
Strapi 4 and can no longer be rebased. Carried forward by
https://github.com/strapi-community/plugin-rest-cache/issues/175.

Simplified from #96's two nested types - a `CacheControlHeaderConfig`
wrapping a `CacheControlResponseHeaderConfig` - into the one flat block
below, because only the response direction is implemented here. Honouring an
incoming request `Cache-Control` is still open, and a wrapper whose only
member today is `response` buys nothing while making every user write
`cacheControl.response.maxAge`. Should the request direction land, it can add
a `cacheControl.request` block without changing any of these names.

#96's `CacheControlResponseMaxAge` enum - NONE / CONFIG / a number - is kept,
as the union on `maxAge`. That is the part carrying the meaning: "say
nothing", "say what the route is actually cached for", or "say this instead".

Off by default and meant to stay opt-in: the header moves caching to browsers
and CDNs, where a purge cannot reach it, so every emitted `max-age` is a
window of guaranteed staleness that an operator has to choose knowingly.

## Constructors

### Constructor

```ts
new CacheControlConfig(options?): CacheControlConfig;
```

Defined in: CacheControlConfig.ts:65

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`CacheControlConfigInput`](../interfaces/CacheControlConfigInput.md) |

#### Returns

`CacheControlConfig`

## Properties

| Property | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="enabled"></a> `enabled` | `boolean` | `false` | Emit the header at all. | CacheControlConfig.ts:31 |
| <a id="maxage"></a> `maxAge` | `"none"` \| [`Milliseconds`](../type-aliases/Milliseconds.md) \| `"config"` | `'config'` | `none` omits the `max-age` directive, `config` takes the route's resolved `maxAge`, and a number overrides it. That number is MILLISECONDS, like every other duration in this plugin, even though the directive it ends up in is seconds. A single field that meant seconds while `maxAge`, `ttl` and `staleWhileRevalidate` meant milliseconds is precisely the ambiguity behind https://github.com/strapi-community/plugin-rest-cache/issues/126. The one conversion lives in buildCacheControl. | CacheControlConfig.ts:44 |
| <a id="scope"></a> `scope` | `"public"` \| `"private"` | `'private'` | `private` means only the end client may store the response; `public` also allows shared caches such as a CDN. Defaults to `private`, the answer that cannot leak: a wrongly-public response is served to the wrong person by a cache the server does not own. `public` is downgraded to `private` on any route whose keys identify the caller - see buildCacheControl. | CacheControlConfig.ts:55 |
| <a id="stalewhilerevalidate"></a> `staleWhileRevalidate` | [`Milliseconds`](../type-aliases/Milliseconds.md) | `null` | How long a cache may keep serving the stale response while it refreshes, or null to omit the directive. Milliseconds, for the same reason as `maxAge` above. | CacheControlConfig.ts:63 |
