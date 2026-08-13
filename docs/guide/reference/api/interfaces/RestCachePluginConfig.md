# Interface: RestCachePluginConfig

Defined in: [config.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/config.ts#L21)

The shape of `strapi.config.get('plugin::rest-cache')` once the plugin has
registered - that is, after resolveUserStrategy has replaced the user's
partial input with a resolved CachePluginStrategy.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="provider"></a> `provider` | [`CacheProviderConfig`](CacheProviderConfig.md) | [config.ts:23](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/config.ts#L23) |
| <a id="strategy"></a> `strategy` | [`CachePluginStrategy`](../classes/CachePluginStrategy.md) | [config.ts:22](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/config.ts#L22) |
