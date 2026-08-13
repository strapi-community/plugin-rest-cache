# Interface: CacheKeysConfigInput

Defined in: [inputs.ts:20](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/inputs.ts#L20)

The shapes a user may write in config/plugins.

Deliberately separate from the resolved classes: what someone writes is
partial and loosely typed, what the plugin runs on is complete. Conflating
the two is how `maxAge` ended up defaulting to the boolean `true` in one
constructor while being documented as milliseconds everywhere else.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="useauth"></a> `useAuth?` | `boolean` | [inputs.ts:23](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/inputs.ts#L23) |
| <a id="useheaders"></a> `useHeaders?` | `string`[] | [inputs.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/inputs.ts#L21) |
| <a id="usequeryparams"></a> `useQueryParams?` | `boolean` \| `string`[] | [inputs.ts:22](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/inputs.ts#L22) |
