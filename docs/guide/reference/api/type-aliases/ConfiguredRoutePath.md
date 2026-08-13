# Type Alias: ConfiguredRoutePath

```ts
type ConfiguredRoutePath = Brand<string, "ConfiguredRoutePath">;
```

Defined in: [common.ts:38](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/common.ts#L38)

A route path as written in the plugin configuration, e.g.
"/api/categories/slug/:slug+".

Distinct from RegisteredRoutePath because the two are compared directly, and
comparing them without normalising the trailing "+" left such routes silently
uncached.
