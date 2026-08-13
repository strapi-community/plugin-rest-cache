# Class: CacheKeysConfig

Defined in: [CacheKeysConfig.ts:3](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheKeysConfig.ts#L3)

## Constructors

### Constructor

```ts
new CacheKeysConfig(options?): CacheKeysConfig;
```

Defined in: [CacheKeysConfig.ts:19](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheKeysConfig.ts#L19)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`CacheKeysConfigInput`](../interfaces/CacheKeysConfigInput.md) |

#### Returns

`CacheKeysConfig`

## Properties

| Property | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="useauth"></a> `useAuth` | `boolean` | `false` | Include the authenticated caller's identity in the cache key. Only relevant when hitpass is disabled, since the default hitpass never caches an authenticated request. Without it, two callers authorised for the same route share one entry. **See** https://github.com/strapi-community/plugin-rest-cache/issues/113 | [CacheKeysConfig.ts:17](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheKeysConfig.ts#L17) |
| <a id="useheaders"></a> `useHeaders` | `string`[] | `[]` | - | [CacheKeysConfig.ts:4](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheKeysConfig.ts#L4) |
| <a id="usequeryparams"></a> `useQueryParams` | `boolean` \| `string`[] | `true` | - | [CacheKeysConfig.ts:6](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/CacheKeysConfig.ts#L6) |
