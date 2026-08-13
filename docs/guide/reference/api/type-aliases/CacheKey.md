# Type Alias: CacheKey

```ts
type CacheKey = Brand<string, "CacheKey">;
```

Defined in: [common.ts:53](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/common.ts#L53)

A key as the cache store addresses it, without the configured keysPrefix.

Providers must return keys in this form. @keyv/redis tracks keys internally
as fully qualified redis keys ("keyv:/api/foo"), and returning that form
meant purge regexes matched nothing while the deletes addressed keys that did
not exist.

## See

https://github.com/strapi-community/plugin-rest-cache/issues/131
