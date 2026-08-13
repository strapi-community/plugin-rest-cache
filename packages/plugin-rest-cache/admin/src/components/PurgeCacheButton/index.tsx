import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button, Dialog, type ButtonProps } from '@strapi/design-system';
import { ArrowsCounterClockwise } from '@strapi/icons';
import { useNotification } from '@strapi/strapi/admin';

import { getTranslation } from '../../utils/getTranslation';
import { useGetCacheStrategyQuery, usePurgeCacheMutation } from '../../services/restCache';
import type { PurgeRequest } from '../../../../server/src/types/api';

export interface PurgeCacheButtonProps {
  /** The uid of the content type to purge, e.g. `api::article.article`. */
  contentType: string;
  /**
   * Route parameters, used to narrow the purge to the keys of a single entry.
   * Omitted together with `wildcard` this purges the content type's own routes
   * only.
   */
  params?: PurgeRequest['params'];
  /** Purge every cached key for the content type rather than one entry's. */
  wildcard?: boolean;
  fullWidth?: boolean;
  size?: ButtonProps['size'];
}

/**
 * Pull a displayable message out of whatever the mutation rejected with.
 *
 * RTK Query rejects with either a `BaseQueryError` (the admin panel's fetch
 * client shape) or a redux-toolkit `SerializedError`. Both carry `message`, but
 * the union is wider than either, so this narrows structurally rather than
 * asserting one branch. Returns undefined when there is nothing worth showing,
 * so the caller can fall back to a translated string.
 */
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
 * A confirmation-guarded button that purges cached responses.
 *
 * Renders nothing when the content type is not in the configured strategy:
 * the purge endpoint would reject it with a 400, so offering the control would
 * be offering a guaranteed failure.
 */
const PurgeCacheButton = ({
  contentType,
  params,
  wildcard,
  fullWidth = false,
  size = 'S',
}: PurgeCacheButtonProps) => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();

  // Shared with every other subscriber to the strategy on the page - RTK Query
  // collapses them onto one request, and unsubscribing cancels it.
  const { data } = useGetCacheStrategyQuery();
  const [purgeCache, { isLoading }] = usePurgeCacheMutation();

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const toggleConfirmModal = () => setShowConfirmModal((prevState) => !prevState);

  const handleConfirmDelete = async () => {
    try {
      // `unwrap` so a failed request rejects rather than resolving with an
      // `{ error }` object that would otherwise be reported as a success.
      await purgeCache({ contentType, params, wildcard }).unwrap();

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
        // The server's message when it sent one - it says which content type
        // was rejected and why. Otherwise a translated fallback.
        message:
          getErrorMessage(error) ??
          formatMessage({
            id: getTranslation('purge.error'),
            defaultMessage: 'Could not purge the cache',
          }),
      });
    } finally {
      setShowConfirmModal(false);
    }
  };

  const isCached = data?.strategy?.contentTypes?.some(
    (config) => config.contentType === contentType
  );

  if (!isCached) {
    return null;
  }

  return (
    // onOpenChange is what lets Escape and an outside click close the dialog.
    // Without it the only way out is the two footer buttons, which traps
    // anyone who opened it by mistake.
    <Dialog.Root open={showConfirmModal} onOpenChange={setShowConfirmModal}>
      <Dialog.Trigger>
        <Button
          onClick={toggleConfirmModal}
          size={size}
          fullWidth={fullWidth}
          startIcon={<ArrowsCounterClockwise />}
          variant="danger"
        >
          {formatMessage({
            id: getTranslation('purge.delete-entry'),
            defaultMessage: 'Purge REST Cache',
          })}
        </Button>
      </Dialog.Trigger>

      <Dialog.Content>
        <Dialog.Header>
          {formatMessage({
            id: getTranslation('purge.confirm-modal-title'),
            defaultMessage: 'Confirm purging REST Cache?',
          })}
        </Dialog.Header>

        <Dialog.Body icon={<ArrowsCounterClockwise />}>
          {formatMessage({
            id: getTranslation('purge.confirm-modal-body'),
            defaultMessage: 'Are you sure you want to purge the REST Cache for this entry?',
          })}
        </Dialog.Body>

        <Dialog.Footer>
          <Dialog.Cancel>
            <Button fullWidth variant="tertiary" onClick={toggleConfirmModal}>
              {formatMessage({
                id: getTranslation('purge.confirm-modal-cancel'),
                defaultMessage: 'Cancel',
              })}
            </Button>
          </Dialog.Cancel>

          <Dialog.Action>
            <Button
              fullWidth
              variant="danger-light"
              loading={isLoading}
              onClick={handleConfirmDelete}
            >
              {formatMessage({
                id: getTranslation('purge.confirm-modal-confirm'),
                defaultMessage: 'Purge REST Cache',
              })}
            </Button>
          </Dialog.Action>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default PurgeCacheButton;
