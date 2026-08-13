# Interface: StrategyResponse

Defined in: [api.ts:13](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L13)

Response contracts for the admin API.

These are imported by the admin panel as well as the server, so the two
cannot drift: changing a controller's response shape without changing the
component that reads it is a compile error rather than a blank cell in the
dashboard.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="strategy"></a> `strategy` | [`CachePluginStrategy`](../classes/CachePluginStrategy.md) | [api.ts:14](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/api.ts#L14) |
