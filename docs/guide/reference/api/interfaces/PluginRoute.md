# Interface: PluginRoute

Defined in: [routes.ts:15](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/routes.ts#L15)

A route this plugin registers.

Exported rather than declared locally in each route file because the route
arrays are default-exported, and TypeScript cannot emit a declaration for an
export whose type is private to its module.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="config"></a> `config` | \{ `policies`: [`RoutePolicy`](../type-aliases/RoutePolicy.md)[]; \} | [routes.ts:19](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/routes.ts#L19) |
| `config.policies` | [`RoutePolicy`](../type-aliases/RoutePolicy.md)[] | [routes.ts:20](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/routes.ts#L20) |
| <a id="handler"></a> `handler` | `string` | [routes.ts:18](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/routes.ts#L18) |
| <a id="method"></a> `method` | [`HttpMethod`](../type-aliases/HttpMethod.md) | [routes.ts:16](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/routes.ts#L16) |
| <a id="path"></a> `path` | `string` | [routes.ts:17](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/routes.ts#L17) |
