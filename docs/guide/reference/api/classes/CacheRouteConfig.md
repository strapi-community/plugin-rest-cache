# Class: CacheRouteConfig

Defined in: [CacheRouteConfig.ts:11](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L11)

## Constructors

### Constructor

```ts
new CacheRouteConfig(options?): CacheRouteConfig;
```

Defined in: [CacheRouteConfig.ts:25](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L25)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`CacheRouteConfigInput`](../interfaces/CacheRouteConfigInput.md) |

#### Returns

`CacheRouteConfig`

## Properties

| Property | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="hitpass"></a> `hitpass` | `boolean` \| [`CachePluginHitpass`](../type-aliases/CachePluginHitpass.md) | `false` | - | [CacheRouteConfig.ts:23](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L23) |
| <a id="keys"></a> `keys` | [`CacheKeysConfig`](CacheKeysConfig.md) | `undefined` | - | [CacheRouteConfig.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L21) |
| <a id="maxage"></a> `maxAge` | [`Milliseconds`](../type-aliases/Milliseconds.md) | `undefined` | Milliseconds. See the Milliseconds brand for why this is not a bare number. | [CacheRouteConfig.ts:13](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L13) |
| <a id="method"></a> `method` | [`HttpMethod`](../type-aliases/HttpMethod.md) | `'GET'` | - | [CacheRouteConfig.ts:17](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L17) |
| <a id="paramnames"></a> `paramNames` | `string`[] | `[]` | - | [CacheRouteConfig.ts:19](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L19) |
| <a id="path"></a> `path` | [`ConfiguredRoutePath`](../type-aliases/ConfiguredRoutePath.md) | `undefined` | - | [CacheRouteConfig.ts:15](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheRouteConfig.ts#L15) |
