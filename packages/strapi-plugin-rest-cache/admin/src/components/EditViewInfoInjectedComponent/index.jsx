import React from 'react';
import { useRBAC } from '@strapi/strapi/admin';
import { unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';



import cachePermissions from '../../permissions';
import EntityCacheInformation from '../EntityCacheInformation';

function EditViewInfoInjectedComponent() {
  console.log("hello world")
  const { allowedActions } = useRBAC(cachePermissions);
  const { slug } = useContentManagerContext();
  console.log(allowedActions)
  if (!allowedActions.canReadStrategy) {
    return null;
  }
  console.log("Displaying")
  return <EntityCacheInformation contentType={slug} />;
}

export default EditViewInfoInjectedComponent;
