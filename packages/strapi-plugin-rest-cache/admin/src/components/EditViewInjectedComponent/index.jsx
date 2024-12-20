import React from 'react';
import { useRBAC } from '@strapi/strapi/admin';
import { unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';
import cachePermissions from '../../permissions';
import PurgeCacheButton from '../PurgeCacheButton';

function EditViewInjectedComponent() {
  const { allowedActions } = useRBAC(cachePermissions);

  const {
    slug,
    isCreatingEntry,
    hasDraftAndPublish,
    form,
    isSingleType,
  } = useContentManagerContext();
  const { initialValues } = form; 
  if (isCreatingEntry) {
    return null;
  }
  if (hasDraftAndPublish && initialValues.publishedAt === null) {
    return null;
  }

  if (!allowedActions.canReadStrategy || !allowedActions.canPurge) {
    return null;
  }

  return (
    <PurgeCacheButton
      contentType={slug}
      params={isSingleType ? {} : initialValues}
      wildcard={isSingleType}
      size="M" 
      fullWidth={true}
    />
  );
}

export default EditViewInjectedComponent;
