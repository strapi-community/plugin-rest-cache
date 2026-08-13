# Interface: CacheSummary

Defined in: [api.ts:41](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L41)

## Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="contenttypes"></a> `contentTypes` | [`ContentTypeStats`](ContentTypeStats.md)[] | - | [api.ts:53](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L53) |
| <a id="provider"></a> `provider` | \{ `name?`: `string`; \} | Only the provider's name: `options` holds connection credentials. | [api.ts:43](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L43) |
| `provider.name?` | `string` | - | [api.ts:43](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L43) |
| <a id="strategy"></a> `strategy` | \{ `clearRelatedCache`: `boolean`; `enableDocumentServiceMiddleware`: `boolean`; `enableEtag`: `boolean`; `enableXCacheHeaders`: `boolean`; `keysPrefix`: `string`; `maxAge`: [`Milliseconds`](../type-aliases/Milliseconds.md); \} | - | [api.ts:44](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L44) |
| `strategy.clearRelatedCache` | `boolean` | - | [api.ts:48](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L48) |
| `strategy.enableDocumentServiceMiddleware` | `boolean` | - | [api.ts:47](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L47) |
| `strategy.enableEtag` | `boolean` | - | [api.ts:45](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L45) |
| `strategy.enableXCacheHeaders` | `boolean` | - | [api.ts:46](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L46) |
| `strategy.keysPrefix` | `string` | - | [api.ts:49](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L49) |
| `strategy.maxAge` | [`Milliseconds`](../type-aliases/Milliseconds.md) | - | [api.ts:50](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L50) |
| <a id="totals"></a> `totals` | \{ `contentTypes`: `number`; `entries`: `number`; `etags`: `number`; \} | - | [api.ts:52](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L52) |
| `totals.contentTypes` | `number` | - | [api.ts:52](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L52) |
| `totals.entries` | `number` | - | [api.ts:52](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L52) |
| `totals.etags` | `number` | - | [api.ts:52](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L52) |
