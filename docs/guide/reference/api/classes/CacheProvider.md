# Abstract Class: CacheProvider

Defined in: [CacheProvider.ts:14](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L14)

Contract every cache provider implements.

`delMany` and `clear` are optional in practice: the base class supplies
working defaults that behave exactly as the store did before they existed,
so a third-party provider written against the older contract keeps working
unchanged. Providers backed by a store with batch operations should override
them - a purge is otherwise one round trip per key.

## See

https://github.com/strapi-community/plugin-rest-cache/issues/131

## Constructors

### Constructor

```ts
new CacheProvider(): CacheProvider;
```

Defined in: [CacheProvider.ts:15](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L15)

#### Returns

`CacheProvider`

## Accessors

### ready

#### Get Signature

```ts
get abstract ready(): boolean;
```

Defined in: [CacheProvider.ts:48](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L48)

##### Returns

`boolean`

## Methods

### clear()

```ts
clear(): Promise<void>;
```

Defined in: [CacheProvider.ts:65](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L65)

Remove every entry this provider holds.

#### Returns

`Promise`\<`void`\>

***

### del()

```ts
abstract del(key): Promise<unknown>;
```

Defined in: [CacheProvider.ts:34](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L34)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` \| [`CacheKey`](../type-aliases/CacheKey.md) \| `string`[] |

#### Returns

`Promise`\<`unknown`\>

***

### delMany()

```ts
delMany(keys): Promise<void>;
```

Defined in: [CacheProvider.ts:56](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L56)

Delete many keys at once.

Conservative default: one at a time, with bounded concurrency so a large
purge cannot open thousands of simultaneous operations.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `keys` | (`string` \| [`CacheKey`](../type-aliases/CacheKey.md))[] |

#### Returns

`Promise`\<`void`\>

***

### get()

```ts
abstract get(key): Promise<unknown>;
```

Defined in: [CacheProvider.ts:21](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L21)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` \| [`CacheKey`](../type-aliases/CacheKey.md) |

#### Returns

`Promise`\<`unknown`\>

***

### keys()

```ts
abstract keys(keysPrefix?): Promise<string[]>;
```

Defined in: [CacheProvider.ts:46](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L46)

Every key this provider holds, without the store's configured keysPrefix
and without any adapter-internal qualification.

The store passes its keysPrefix, and neither shipped provider reads it -
the store filters and strips the prefix itself, because a provider that
ignored the argument would otherwise return a superset and silently break
that filtering. It stays in the signature so third-party providers that do
use it to narrow their enumeration keep receiving it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `keysPrefix?` | `string` |

#### Returns

`Promise`\<`string`[]\>

***

### set()

```ts
abstract set(
   key, 
   val, 
maxAge?): Promise<unknown>;
```

Defined in: [CacheProvider.ts:28](https://github.com/strapi-community/plugin-rest-cache/blob/5c0a229485e8bf21c63fff8f88536d0ee05fc966/packages/plugin-rest-cache/server/src/types/CacheProvider.ts#L28)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` \| [`CacheKey`](../type-aliases/CacheKey.md) | - |
| `val` | `unknown` | - |
| `maxAge?` | `number` \| [`Milliseconds`](../type-aliases/Milliseconds.md) | in milliseconds. Do not convert: cache-manager's ttl is also milliseconds, and converting again is what made every entry outlive its configured lifetime by a factor of 1000. |

#### Returns

`Promise`\<`unknown`\>
