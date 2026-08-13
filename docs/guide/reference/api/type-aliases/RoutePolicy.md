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

Defined in: [routes.ts:4](https://github.com/strapi-community/plugin-rest-cache/blob/5f9e4bf09e910e0b7ea821bf7a983bd8d0067ca2/packages/plugin-rest-cache/server/src/types/routes.ts#L4)

A policy entry as Strapi accepts it on a route's config.
