# Class: CachePluginStrategy

Defined in: [CachePluginStrategy.ts:7](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L7)

## Constructors

### Constructor

```ts
new CachePluginStrategy(options?): CachePluginStrategy;
```

Defined in: [CachePluginStrategy.ts:34](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L34)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`CachePluginStrategyInput`](../interfaces/CachePluginStrategyInput.md) |

#### Returns

`CachePluginStrategy`

## Properties

| Property | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="clearrelatedcache"></a> `clearRelatedCache` | `boolean` | `true` | - | [CachePluginStrategy.ts:23](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L23) |
| <a id="contenttypes"></a> `contentTypes` | [`CacheContentTypeConfig`](CacheContentTypeConfig.md)[] | `[]` | - | [CachePluginStrategy.ts:30](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L30) |
| <a id="debug"></a> `debug` | `boolean` | `false` | - | [CachePluginStrategy.ts:8](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L8) |
| <a id="enableadminctbmiddleware"></a> `enableAdminCTBMiddleware` | `boolean` | `true` | - | [CachePluginStrategy.ts:14](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L14) |
| <a id="enablecontentapipurge"></a> `enableContentApiPurge` | `boolean` | `false` | - | [CachePluginStrategy.ts:18](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L18) |
| <a id="enabledocumentservicemiddleware"></a> `enableDocumentServiceMiddleware` | `boolean` | `true` | - | [CachePluginStrategy.ts:16](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L16) |
| <a id="enableetag"></a> `enableEtag` | `boolean` | `false` | - | [CachePluginStrategy.ts:10](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L10) |
| <a id="enablexcacheheaders"></a> `enableXCacheHeaders` | `boolean` | `false` | - | [CachePluginStrategy.ts:12](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L12) |
| <a id="keys"></a> `keys` | [`CacheKeysConfig`](CacheKeysConfig.md) | `undefined` | - | [CachePluginStrategy.ts:32](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L32) |
| <a id="keysprefix"></a> `keysPrefix` | `string` | `''` | - | [CachePluginStrategy.ts:28](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L28) |
| <a id="maxage"></a> `maxAge` | [`Milliseconds`](../type-aliases/Milliseconds.md) | `undefined` | Milliseconds. | [CachePluginStrategy.ts:26](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L26) |
| <a id="resetonstartup"></a> `resetOnStartup` | `boolean` | `false` | - | [CachePluginStrategy.ts:20](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CachePluginStrategy.ts#L20) |
