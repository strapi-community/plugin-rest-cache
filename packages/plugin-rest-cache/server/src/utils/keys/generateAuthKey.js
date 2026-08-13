'use strict';

/**
 * Identity component of a cache key.
 *
 * Cache keys are built from the request path, query and configured headers.
 * None of that distinguishes one authenticated caller from another, so two
 * callers who are both authorised for a route - but who should see different
 * data, because a controller filters on the user or the token's permissions
 * differ - would share an entry.
 *
 * The default hitpass avoids this by never caching an authenticated request at
 * all. This exists for the case where that is deliberately turned off.
 *
 * Nothing derived here may be secret or volatile. `auth.credentials` for a
 * users-permissions caller is the raw user row, including the password hash and
 * reset tokens, so it must never be serialised wholesale. An API token's
 * `lastUsedAt` is rewritten roughly hourly, so including it would silently
 * invalidate the cache on a timer.
 *
 * @see https://github.com/strapi-community/plugin-rest-cache/issues/113
 *
 * @param {import('koa').Context} ctx
 * @return {string}
 */
export const generateAuthKey = function (ctx) {
  const auth = ctx.state?.auth;

  // The route opted out of authentication entirely (config.auth === false), so
  // there is no identity to key on.
  if (!auth) {
    return 'unauthenticated';
  }

  const strategyName = auth.strategy?.name;
  const credentials = auth.credentials;

  switch (strategyName) {
    case 'users-permissions': {
      // An anonymous caller is authenticated as the public role, which has no
      // credentials. Everyone in that state sees the same thing, so they can
      // share one entry.
      if (!credentials) {
        return 'up:public';
      }

      // Keyed per user rather than per role: controllers routinely filter on
      // ctx.state.user.id, so two users sharing a role can still owe different
      // responses.
      return `up:${credentials.id}`;
    }

    // Renamed from 'api-token' to 'content-api-token' during the 5.x line, so
    // both are accepted to keep one build working across the supported range.
    case 'api-token':
    case 'content-api-token': {
      // `type` is part of the key because it is editable on an existing token:
      // downgrading full-access to read-only changes what the same token id is
      // allowed to see.
      return `token:${credentials?.id}:${credentials?.type}`;
    }

    case 'admin':
    case 'admin-token': {
      return `admin:${credentials?.id}`;
    }

    default: {
      // An unrecognised strategy is treated as its own bucket rather than
      // shared, so a custom auth strategy cannot silently leak across callers.
      return strategyName ? `strategy:${strategyName}` : 'unauthenticated';
    }
  }
};
