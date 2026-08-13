# Type Alias: CachePluginHitpass

```ts
type CachePluginHitpass = (ctx) => boolean | Promise<boolean>;
```

Defined in: [common.ts:59](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/common.ts#L59)

Decides, per request, whether the cache should be bypassed entirely.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `Context` |

## Returns

`boolean` \| `Promise`\<`boolean`\>
