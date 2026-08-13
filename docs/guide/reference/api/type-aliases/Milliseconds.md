# Type Alias: Milliseconds

```ts
type Milliseconds = Brand<number, "Milliseconds">;
```

Defined in: [common.ts:26](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/common.ts#L26)

A duration in milliseconds.

`maxAge` is milliseconds everywhere in this plugin, but the providers once
multiplied it by 1000 again before handing it to cache-manager - whose ttl is
also milliseconds - so a configured hour became 41.7 days and nothing ever
expired.

## See

https://github.com/strapi-community/plugin-rest-cache/issues/126
