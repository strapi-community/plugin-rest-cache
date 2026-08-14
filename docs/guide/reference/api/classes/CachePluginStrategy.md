# Class: CachePluginStrategy

Defined in: [CachePluginStrategy.ts:8](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L8)

## Constructors

### Constructor

```ts
new CachePluginStrategy(options?): CachePluginStrategy;
```

Defined in: [CachePluginStrategy.ts:42](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L42)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`CachePluginStrategyInput`](../interfaces/CachePluginStrategyInput.md) |

#### Returns

`CachePluginStrategy`

## Properties

| Property | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="cachecontrol"></a> `cacheControl` | [`CacheControlConfig`](CacheControlConfig.md) | `undefined` | Whether cached responses advertise their caching downstream. **See** https://github.com/strapi-community/plugin-rest-cache/issues/175 | [CachePluginStrategy.ts:40](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L40) |
| <a id="clearrelatedcache"></a> `clearRelatedCache` | `boolean` | `true` | - | [CachePluginStrategy.ts:24](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L24) |
| <a id="contenttypes"></a> `contentTypes` | [`CacheContentTypeConfig`](CacheContentTypeConfig.md)[] | `[]` | - | [CachePluginStrategy.ts:31](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L31) |
| <a id="debug"></a> `debug` | `boolean` | `false` | - | [CachePluginStrategy.ts:9](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L9) |
| <a id="enableadminctbmiddleware"></a> `enableAdminCTBMiddleware` | `boolean` | `true` | - | [CachePluginStrategy.ts:15](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L15) |
| <a id="enablecontentapipurge"></a> `enableContentApiPurge` | `boolean` | `false` | - | [CachePluginStrategy.ts:19](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L19) |
| <a id="enabledocumentservicemiddleware"></a> `enableDocumentServiceMiddleware` | `boolean` | `true` | - | [CachePluginStrategy.ts:17](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L17) |
| <a id="enableetag"></a> `enableEtag` | `boolean` | `false` | - | [CachePluginStrategy.ts:11](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L11) |
| <a id="enablexcacheheaders"></a> `enableXCacheHeaders` | `boolean` | `false` | - | [CachePluginStrategy.ts:13](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L13) |
| <a id="keys"></a> `keys` | [`CacheKeysConfig`](CacheKeysConfig.md) | `undefined` | - | [CachePluginStrategy.ts:33](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L33) |
| <a id="keysprefix"></a> `keysPrefix` | `string` | `''` | - | [CachePluginStrategy.ts:29](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L29) |
| <a id="maxage"></a> `maxAge` | [`Milliseconds`](../type-aliases/Milliseconds.md) | `undefined` | Milliseconds. | [CachePluginStrategy.ts:27](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L27) |
| <a id="resetonstartup"></a> `resetOnStartup` | `boolean` | `false` | - | [CachePluginStrategy.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L21) |
