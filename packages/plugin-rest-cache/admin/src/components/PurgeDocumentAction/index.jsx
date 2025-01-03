import { useNotification, useRBAC, unstable_useContentManagerContext as useContentManagerContext } from "@strapi/strapi/admin"
import cachePermissions  from "../../permissions"
import { useCacheStrategy } from '../../hooks';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../../pluginId';
import { useIntl } from 'react-intl';
import {ArrowsCounterClockwise } from "@strapi/icons"
function PurgeDocumentAction({ 
    activeTab, 
    collectionType, 
    document, 
    documentId, 
    meta, 
    model 
  }) {
    const {toggleNotification } = useNotification();
    const { formatMessage } = useIntl();
    const { allowedActions } = useRBAC(cachePermissions);
    const { strategy } = useCacheStrategy();
    const {
      isCreatingEntry,
      hasDraftAndPublish,
      form,
      isSingleType,
    } = useContentManagerContext();
    const {post} = useFetchClient()

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
    const params = isSingleType ? {} : initialValues
    return {
      label: "Purge cache",
      variant: "danger",
      position: 'header',
      icon: <ArrowsCounterClockwise />,
      dialog: {
        type: 'dialog',
        title: "Confirm purging REST Cache?",

        variant: "danger",
        content:  <><ArrowsCounterClockwise /> {formatMessage({
            id: 'cache.purge.confirm-modal-body',
            defaultMessage:
              'Are you sure you want to purge REST Cache for this entry?',
          })}</>,
        onConfirm: async () => {
          await post(`/${pluginId}/purge`, {
            contentType: model,
            params,
            wildcard: isSingleType,
          });
          toggleNotification({
            type: 'success',
            message: {
              id: 'cache.purge.success',
              defaultMessage: 'Cache purged successfully',
            },
          });
        }
    }
  }
  }


  export default PurgeDocumentAction;
