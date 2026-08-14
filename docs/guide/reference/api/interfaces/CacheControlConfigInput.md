# Interface: CacheControlConfigInput

Defined in: [inputs.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L21)

The shapes a user may write in config/plugins.

Deliberately separate from the resolved classes: what someone writes is
partial and loosely typed, what the plugin runs on is complete. Conflating
the two is how `maxAge` ended up defaulting to the boolean `true` in one
constructor while being documented as milliseconds everywhere else.

## Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="enabled"></a> `enabled?` | `boolean` | - | [inputs.ts:22](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L22) |
| <a id="maxage"></a> `maxAge?` | \| `number` \| `"none"` \| [`Milliseconds`](../type-aliases/Milliseconds.md) \| `"config"` | 'none' omits max-age, 'config' uses the route's maxAge, a number overrides it. The number is milliseconds - see CacheControlConfig. | [inputs.ts:27](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L27) |
| <a id="scope"></a> `scope?` | `"public"` \| `"private"` | - | [inputs.ts:28](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L28) |
| <a id="stalewhilerevalidate"></a> `staleWhileRevalidate?` | `number` \| [`Milliseconds`](../type-aliases/Milliseconds.md) | Milliseconds, or null/undefined to omit the directive. | [inputs.ts:30](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/inputs.ts#L30) |
