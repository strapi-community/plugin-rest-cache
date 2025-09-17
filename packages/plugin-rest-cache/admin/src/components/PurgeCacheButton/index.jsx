import React, { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Button, Dialog } from '@strapi/design-system';
import { ArrowsCounterClockwise } from '@strapi/icons';
import { useNotification, useFetchClient } from '@strapi/strapi/admin';
import PropTypes from 'prop-types';

import pluginId from '../../pluginId';
import { useCacheStrategy } from '../../hooks';

function PurgeCacheButton({ contentType, params, wildcard = undefined, fullWidth = false, size = "S" }) {
  const { strategy } = useCacheStrategy();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isModalConfirmButtonLoading, setIsModalConfirmButtonLoading] =
    useState(false);
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();

  const abortController = new AbortController();
  const { signal } = abortController;

  useEffect(() => {
    return () => {
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleConfirmModal = () =>
    setShowConfirmModal((prevState) => !prevState);

  const { post } = useFetchClient()
  const handleConfirmDelete = async () => {
    try {
      // Show the loading state
      setIsModalConfirmButtonLoading(true);

      await post(`/${pluginId}/purge`, {
        contentType,
        params,
        wildcard,
      });

      toggleNotification({
        type: 'success',
        message: formatMessage({
          id: 'cache.purge.success',
          defaultMessage: 'Cache purged successfully',
        }),
      });

      setIsModalConfirmButtonLoading(false);

      toggleConfirmModal();
    } catch (err) {
      const errorMessage = err?.response?.payload?.error?.message;
      setIsModalConfirmButtonLoading(false);
      toggleConfirmModal();

      if (errorMessage) {
        toggleNotification({
          type: 'warning',
          message: formatMessage({ id: 'cache.purge.error', defaultMessage: errorMessage }),
        });
      } else {
        toggleNotification({
          type: 'warning',
          message: formatMessage({ id: 'notification.error' }),
        });
      }
    }
  };
  if (
    !strategy?.contentTypes?.find(
      (config) => config.contentType === contentType
    )
  ) {
    return null;
  }

  return (
    <Dialog.Root open={showConfirmModal}>
      <Dialog.Trigger>
        <Button
        onClick={toggleConfirmModal}
          size={size}
          fullWidth={fullWidth}
          startIcon={<ArrowsCounterClockwise />}
          variant="danger"
        >
          {formatMessage({
            id: 'cache.purge.delete-entry',
            defaultMessage: 'Purge REST Cache',
          })}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>{formatMessage({
          id: 'cache.purge.confirm-modal-title',
          defaultMessage: 'Confirm purging REST Cache?',
        })}</Dialog.Header>
        <Dialog.Body icon={<ArrowsCounterClockwise />}>{formatMessage({
          id: 'cache.purge.confirm-modal-body',
          defaultMessage:
            'Are you sure you want to purge REST Cache for this entry?',
        })}</Dialog.Body>

        <Dialog.Footer>
          <Dialog.Cancel>
            <Button fullWidth variant="tertiary" onClick={toggleConfirmModal}>
              Cancel
            </Button>
          </Dialog.Cancel>
          <Dialog.Action>
            <Button fullWidth variant="danger-light" onClick={handleConfirmDelete}>
            {formatMessage({
          id: 'cache.purge.confirm-modal-confirm',
          defaultMessage: 'Purge REST Cache',
        })}
            </Button>
          </Dialog.Action>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

PurgeCacheButton.propTypes = {
  contentType: PropTypes.string.isRequired,
  params: PropTypes.object,
  wildcard: PropTypes.bool,
  fullWidth: PropTypes.bool,
  size: PropTypes.string
};

export default PurgeCacheButton;
