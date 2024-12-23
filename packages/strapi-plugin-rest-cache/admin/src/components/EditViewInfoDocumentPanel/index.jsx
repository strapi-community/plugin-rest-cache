import { useNotification, useRBAC, unstable_useContentManagerContext as useContentManagerContext } from "@strapi/strapi/admin"
import cachePermissions  from "../../permissions"
import { useCacheStrategy } from '../../hooks';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../../pluginId';
import { useIntl } from 'react-intl';
import {ArrowsCounterClockwise } from "@strapi/icons"
function EditViewInfoDocumentPanel({ 
    activeTab, 
    collectionType, 
    document, 
    documentId, 
    meta, 
    model 
  }) {
    const { allowedActions } = useRBAC(cachePermissions);
    const { strategy } = useCacheStrategy();
    const {
      isCreatingEntry,
      hasDraftAndPublish,
      form,
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
    if (
      !strategy?.contentTypes?.find(
        (config) => config.contentType === model
      )
    ) {
      return null;
    }
    return {
        title: "This entity is cached via REST Cache plugin",
        content: <></>	
    }
  }


  export default EditViewInfoDocumentPanel;
