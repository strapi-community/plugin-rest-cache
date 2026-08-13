# Interface: CacheProviderConfig

Defined in: [config.ts:10](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/config.ts#L10)

The provider as it is written in config/plugins - a selection plus its
options, not the instantiated CacheProvider the store runs on.

`options` is where connection details live for non-memory providers, which is
why the stats service exposes only `name` from it.

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="gettimeout"></a> `getTimeout?` | `number` | [config.ts:12](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/config.ts#L12) |
| <a id="name"></a> `name` | `string` | [config.ts:11](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/config.ts#L11) |
| <a id="options"></a> `options?` | `Record`\<`string`, `unknown`\> | [config.ts:13](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/config.ts#L13) |
