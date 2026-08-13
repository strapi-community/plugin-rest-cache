import type { PluginRoute } from '../../types/routes';

const purgeRoutes: PluginRoute[] = [
  {
    method: 'POST',
    path: '/purge',
    handler: 'purge.contentApi',
    config: {
      // Deliberately no `auth: false`. This inherits Strapi's content-api
      // authentication, so the caller must present an API token or a
      // users-permissions JWT, and the route must additionally be granted in
      // the Users & Permissions settings (or the token's scope) before it can
      // be reached. Purging is destructive and cheap to trigger, so it is not
      // something to expose anonymously.
      policies: [],
    },
  },
];

export default purgeRoutes;
