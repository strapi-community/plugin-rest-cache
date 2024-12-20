import React from 'react';
// import { useIntl } from 'react-intl';
import { useRBAC } from '@strapi/strapi/admin';
import { useMatch  } from 'react-router-dom';
// import cachePermissions from '../../permissions';
import cachePermissions from '../../permissions';
import PurgeCacheButton from '../PurgeCacheButton';

function ListViewInjectedComponent() {
  const {
    params: { slug },
  } = useMatch ('/content-manager/:kind/:slug?');
  const { allowedActions } = useRBAC(cachePermissions);
  console.log(allowedActions)
  if (!allowedActions.canReadStrategy || !allowedActions.canPurge) {
    return null;
  }
  return <PurgeCacheButton contentType={slug} wildcard />;
}

export default ListViewInjectedComponent;
