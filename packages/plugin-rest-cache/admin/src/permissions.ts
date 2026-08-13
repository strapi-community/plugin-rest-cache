import type { Permission } from '@strapi/strapi/admin';

type PluginPermission = Pick<Permission, 'action'> & { subject: null };

/**
 * RBAC actions this panel gates on.
 *
 * These must match what `server/src/permissions-actions.ts` registers - they
 * are two halves of one contract that TypeScript cannot check across the
 * server/admin boundary, because the server registers them as plain strings at
 * bootstrap.
 *
 * Hiding a control is presentation, not protection: every admin route also
 * carries an `admin::hasPermissions` policy for the same action, so removing
 * the UI gate would not grant access.
 */
const pluginPermissions = {
  purge: [{ action: 'plugin::rest-cache.cache.purge', subject: null }],
  readStrategy: [{ action: 'plugin::rest-cache.cache.read-strategy', subject: null }],
  readProvider: [{ action: 'plugin::rest-cache.cache.read-provider', subject: null }],
} satisfies Record<string, PluginPermission[]>;

export default pluginPermissions;
