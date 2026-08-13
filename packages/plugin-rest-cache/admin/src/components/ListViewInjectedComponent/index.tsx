import { useRBAC } from '@strapi/strapi/admin';
import { useMatch } from 'react-router-dom';

import pluginPermissions from '../../permissions';
import PurgeCacheButton from '../PurgeCacheButton';

/**
 * The content-manager list view. `slug` is the content type's uid.
 */
const LIST_VIEW_PATH = '/content-manager/:kind/:slug?';

/**
 * The purge control injected into the content-manager list view's action bar.
 *
 * Purges with `wildcard`, because the list view is not scoped to one entry:
 * from here the only meaningful purge is every cached key for the content type.
 */
const ListViewInjectedComponent = () => {
  const match = useMatch(LIST_VIEW_PATH);
  const { allowedActions } = useRBAC(pluginPermissions);

  // Optional route segment, so the router types it as possibly absent. The
  // injection zone only exists inside this route, but nothing in the type
  // system says so.
  const slug = match?.params.slug;

  if (!slug) {
    return null;
  }

  // Presentation only: the purge route carries an `admin::hasPermissions`
  // policy for the same action.
  if (!allowedActions.canReadStrategy || !allowedActions.canPurge) {
    return null;
  }

  return <PurgeCacheButton contentType={slug} wildcard />;
};

export default ListViewInjectedComponent;
