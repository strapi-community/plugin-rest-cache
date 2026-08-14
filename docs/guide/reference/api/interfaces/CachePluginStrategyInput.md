# Interface: CachePluginStrategyInput

Defined in: [inputs.ts:60](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L60)

## Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="cachecontrol"></a> `cacheControl?` | \| [`CacheControlConfig`](../classes/CacheControlConfig.md) \| [`CacheControlConfigInput`](CacheControlConfigInput.md) | Whether to tell the caller about the caching, by emitting a Cache-Control header on responses this plugin cached. Off unless asked for. **See** https://github.com/strapi-community/plugin-rest-cache/issues/175 | [inputs.ts:79](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L79) |
| <a id="clearrelatedcache"></a> `clearRelatedCache?` | `boolean` | - | [inputs.ts:68](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L68) |
| <a id="contenttypes"></a> `contentTypes?` | \| ( \| `string` \| [`CacheContentTypeConfigInput`](CacheContentTypeConfigInput.md))[] \| [`CacheContentTypeConfig`](../classes/CacheContentTypeConfig.md)[] | - | [inputs.ts:71](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L71) |
| <a id="debug"></a> `debug?` | `boolean` | - | [inputs.ts:61](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L61) |
| <a id="enableadminctbmiddleware"></a> `enableAdminCTBMiddleware?` | `boolean` | - | [inputs.ts:64](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L64) |
| <a id="enablecontentapipurge"></a> `enableContentApiPurge?` | `boolean` | - | [inputs.ts:66](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L66) |
| <a id="enabledocumentservicemiddleware"></a> `enableDocumentServiceMiddleware?` | `boolean` | - | [inputs.ts:65](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L65) |
| <a id="enableetag"></a> `enableEtag?` | `boolean` | - | [inputs.ts:62](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L62) |
| <a id="enablexcacheheaders"></a> `enableXCacheHeaders?` | `boolean` | - | [inputs.ts:63](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L63) |
| <a id="hitpass"></a> `hitpass?` | `boolean` \| [`CachePluginHitpass`](../type-aliases/CachePluginHitpass.md) | The default hitpass for every content type and route that does not set its own. The plugin ships one that bypasses the cache for any request carrying an authorization or cookie header. Note this is consumed during resolution and deliberately not carried on the resolved CachePluginStrategy: by the time resolution finishes, every route holds its own effective hitpass, so a copy on the strategy could only disagree with them. | [inputs.ts:90](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L90) |
| <a id="keys"></a> `keys?` | \| [`CacheKeysConfig`](../classes/CacheKeysConfig.md) \| [`CacheKeysConfigInput`](CacheKeysConfigInput.md) | - | [inputs.ts:72](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L72) |
| <a id="keysprefix"></a> `keysPrefix?` | `string` | - | [inputs.ts:70](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L70) |
| <a id="maxage"></a> `maxAge?` | `number` \| [`Milliseconds`](../type-aliases/Milliseconds.md) | - | [inputs.ts:69](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L69) |
| <a id="resetonstartup"></a> `resetOnStartup?` | `boolean` | - | [inputs.ts:67](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L67) |
