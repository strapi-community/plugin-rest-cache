# Interface: StrategyResponse

Defined in: [api.ts:13](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/api.ts#L13)

Response contracts for the admin API.

These are imported by the admin panel as well as the server, so the two
cannot drift: changing a controller's response shape without changing the
component that reads it is a compile error rather than a blank cell in the
dashboard.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="strategy"></a> `strategy` | [`CachePluginStrategy`](../classes/CachePluginStrategy.md) | [api.ts:14](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/api.ts#L14) |
