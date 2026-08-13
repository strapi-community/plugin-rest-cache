# Class: CacheContentTypeConfig

Defined in: [CacheContentTypeConfig.ts:7](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L7)

## Constructors

### Constructor

```ts
new CacheContentTypeConfig(options?): CacheContentTypeConfig;
```

Defined in: [CacheContentTypeConfig.ts:35](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L35)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`CacheContentTypeConfigInput`](../interfaces/CacheContentTypeConfigInput.md) |

#### Returns

`CacheContentTypeConfig`

## Properties

| Property | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="contenttype"></a> `contentType` | `` `${string}::${string}.${string}` `` | `undefined` | - | [CacheContentTypeConfig.ts:31](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L31) |
| <a id="hitpass"></a> `hitpass` | `boolean` \| [`CachePluginHitpass`](../type-aliases/CachePluginHitpass.md) | `false` | - | [CacheContentTypeConfig.ts:23](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L23) |
| <a id="injectdefaultroutes"></a> `injectDefaultRoutes` | `boolean` | `true` | - | [CacheContentTypeConfig.ts:10](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L10) |
| <a id="keys"></a> `keys` | [`CacheKeysConfig`](CacheKeysConfig.md) | `undefined` | - | [CacheContentTypeConfig.ts:25](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L25) |
| <a id="maxage"></a> `maxAge` | [`Milliseconds`](../type-aliases/Milliseconds.md) | `undefined` | Milliseconds. This defaulted to the boolean `true` here while the class field said 3600000, which through the provider became a one second TTL. The Milliseconds brand exists so that cannot recur. **See** https://github.com/strapi-community/plugin-rest-cache/issues/126 | [CacheContentTypeConfig.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L21) |
| <a id="plugin"></a> `plugin?` | `string` | `undefined` | - | [CacheContentTypeConfig.ts:27](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L27) |
| <a id="relatedcontenttypeuid"></a> `relatedContentTypeUid` | `string`[] | `[]` | - | [CacheContentTypeConfig.ts:33](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L33) |
| <a id="routes"></a> `routes` | [`CacheRouteConfig`](CacheRouteConfig.md)[] | `[]` | - | [CacheContentTypeConfig.ts:29](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L29) |
| <a id="singletype"></a> `singleType` | `boolean` | `false` | - | [CacheContentTypeConfig.ts:8](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheContentTypeConfig.ts#L8) |
