# Interface: ProviderResponse

Defined in: [api.ts:24](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L24)

Note this is not the provider config as written in config/plugins.

`options` is deliberately absent: it is handed straight to the adapter and
for redis holds connection details, so the controller allow-lists these two
fields rather than returning the object it holds.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="provider"></a> `provider` | \{ `getTimeout?`: `number`; `name?`: `string`; \} | [api.ts:25](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L25) |
| `provider.getTimeout?` | `number` | [api.ts:27](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L27) |
| `provider.name?` | `string` | [api.ts:26](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L26) |
