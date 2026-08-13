# Type Alias: MintingWriteAction

```ts
type MintingWriteAction = "create" | "clone";
```

Defined in: [common.ts:72](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/common.ts#L72)

Document service actions that change content, and so must invalidate.

`create` and `clone` mint a new documentId that only exists on the result;
every other action carries it on the params. Modelling that as a union stops
the two being confused.

## See

https://github.com/strapi-community/plugin-rest-cache/issues/129
