# Type Alias: CachePluginHitpass

```ts
type CachePluginHitpass = (ctx) => boolean | Promise<boolean>;
```

Defined in: [common.ts:59](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/common.ts#L59)

Decides, per request, whether the cache should be bypassed entirely.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `Context` |

## Returns

`boolean` \| `Promise`\<`boolean`\>
