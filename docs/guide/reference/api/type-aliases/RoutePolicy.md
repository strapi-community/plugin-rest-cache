# Type Alias: RoutePolicy

```ts
type RoutePolicy = 
  | string
  | {
  config: {
     actions: string[];
  };
  name: string;
};
```

Defined in: [routes.ts:4](https://github.com/strapi-community/plugin-rest-cache/blob/main/packages/plugin-rest-cache/server/src/types/routes.ts#L4)

A policy entry as Strapi accepts it on a route's config.
