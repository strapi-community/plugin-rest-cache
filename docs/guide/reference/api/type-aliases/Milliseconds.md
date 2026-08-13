# Type Alias: Milliseconds

```ts
type Milliseconds = Brand<number, "Milliseconds">;
```

Defined in: [common.ts:26](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/common.ts#L26)

A duration in milliseconds.

`maxAge` is milliseconds everywhere in this plugin, but the providers once
multiplied it by 1000 again before handing it to cache-manager - whose ttl is
also milliseconds - so a configured hour became 41.7 days and nothing ever
expired.

## See

https://github.com/strapi-community/plugin-rest-cache/issues/126
