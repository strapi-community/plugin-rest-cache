# Interface: RestCachePluginConfig

Defined in: [config.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/config.ts#L21)

The shape of `strapi.config.get('plugin::rest-cache')` once the plugin has
registered - that is, after resolveUserStrategy has replaced the user's
partial input with a resolved CachePluginStrategy.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="provider"></a> `provider` | [`CacheProviderConfig`](CacheProviderConfig.md) | [config.ts:23](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/config.ts#L23) |
| <a id="strategy"></a> `strategy` | [`CachePluginStrategy`](../classes/CachePluginStrategy.md) | [config.ts:22](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/config.ts#L22) |
