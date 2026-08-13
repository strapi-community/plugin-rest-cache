import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import type { ButtonProps } from '@strapi/design-system';
import { ArrowsCounterClockwise } from '@strapi/icons';
import { useNotification } from '@strapi/strapi/admin';

import { getTranslation } from '../../utils/getTranslation';
import { usePurgeCache } from '../../services/restCache';
import { useCachedDocument } from '../../hooks/useCachedDocument';
import type { EditViewContext } from '../../types/contentManager';

/**
 * The content-manager hands every edit-view contribution the same context, so
 * the props are `EditViewContext` verbatim rather than a narrower shape - the
 * component is registered against that contract, not against its own.
 */
export type PurgeDocumentActionProps = EditViewContext;

/**
 * What a document action returns.
 *
 * Mirrors the fields of the content-manager's `DocumentActionDescription` this
 * action sets. Declared here for the same reason as `EditViewContext`:
 * `@strapi/content-manager` is not a dependency of this package, so its types
 * are not importable even though the package is present at runtime.
 */
export interface PurgeDocumentActionDescription {
  label: string;
  icon: ReactNode;
  variant: ButtonProps['variant'];
  position: 'header';
  dialog: {
    type: 'dialog';
    title: string;
    variant: ButtonProps['variant'];
    content: ReactNode;
    onConfirm: () => Promise<void>;
  };
}

const getErrorMessage = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return undefined;
};

/**
 * The "Purge REST Cache" action in the edit view header.
 *
 * Returns a description object rather than an element - that is the
 * content-manager's document action contract. Returning null withdraws the
 * action, which is what useCachedDocument decides.
 */
const PurgeDocumentAction = (props: PurgeDocumentActionProps): PurgeDocumentActionDescription | null => {
  const { toggleNotification } = useNotification();
  const { formatMessage } = useIntl();
  const purgeCache = usePurgeCache();
  const { isEligible, params, isSingleType } = useCachedDocument(props);

  if (!isEligible) {
    return null;
  }

  return {
    label: formatMessage({
      id: getTranslation('purge.delete-entry'),
      defaultMessage: 'Purge REST Cache',
    }),
    icon: <ArrowsCounterClockwise />,
    variant: 'danger',
    position: 'header',
    dialog: {
      type: 'dialog',
      title: formatMessage({
        id: getTranslation('purge.confirm-modal-title'),
        defaultMessage: 'Confirm purging REST Cache?',
      }),
      variant: 'danger',
      content: (
        <>
          <ArrowsCounterClockwise />{' '}
          {formatMessage({
            id: getTranslation('purge.confirm-modal-body'),
            defaultMessage: 'Are you sure you want to purge the REST Cache for this entry?',
          })}
        </>
      ),
      onConfirm: async () => {
        try {
          // A single type has one entry and no route parameters to narrow by,
          // so its purge is a wildcard over the whole content type.
          await purgeCache({ contentType: props.model, params, wildcard: isSingleType });

          toggleNotification({
            type: 'success',
            message: formatMessage({
              id: getTranslation('purge.success'),
              defaultMessage: 'Cache purged successfully',
            }),
          });
        } catch (error) {
          toggleNotification({
            type: 'warning',
            message:
              getErrorMessage(error) ??
              formatMessage({
                id: getTranslation('purge.error'),
                defaultMessage: 'Could not purge the cache',
              }),
          });
        }
      },
    },
  };
};

export default PurgeDocumentAction;
