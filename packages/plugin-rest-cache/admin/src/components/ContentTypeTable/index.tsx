import { useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tooltip,
  Tr,
  Typography,
} from '@strapi/design-system';
import { ArrowsCounterClockwise, WarningCircle } from '@strapi/icons';
import { useNotification } from '@strapi/strapi/admin';

import { getTranslation } from '../../utils/getTranslation';
import { formatDuration } from '../../utils/formatDuration';
import { usePurgeCacheMutation } from '../../services/restCache';
import type { ContentTypeStats } from '../../../../server/src/types/api';

export interface ContentTypeTableProps {
  contentTypes: ContentTypeStats[];
  /** False when the current admin lacks plugin::rest-cache.cache.purge. */
  canPurge: boolean;
}

const ContentTypeTable = ({ contentTypes, canPurge }: ContentTypeTableProps) => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const [purgeCache, { isLoading }] = usePurgeCacheMutation();
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  const handlePurge = async (uid: string) => {
    try {
      // Wildcard: the dashboard purges a whole content type, and its routes
      // carry params we cannot enumerate from here.
      await purgeCache({ contentType: uid, params: {}, wildcard: true }).unwrap();

      toggleNotification({
        type: 'success',
        message: formatMessage({
          id: getTranslation('purge.success'),
          defaultMessage: 'Cache purged successfully',
        }),
      });
    } catch {
      toggleNotification({
        type: 'danger',
        message: formatMessage({
          id: getTranslation('purge.error'),
          defaultMessage: 'Could not purge the cache',
        }),
      });
    } finally {
      setPendingUid(null);
    }
  };

  return (
    <Table colCount={canPurge ? 5 : 4} rowCount={contentTypes.length}>
      <Thead>
        <Tr>
          <Th>
            <Typography variant="sigma">
              {formatMessage({
                id: getTranslation('contentTypes.column.uid'),
                defaultMessage: 'Content type',
              })}
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma">
              {formatMessage({
                id: getTranslation('contentTypes.column.entries'),
                defaultMessage: 'Entries',
              })}
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma">
              {formatMessage({
                id: getTranslation('contentTypes.column.maxAge'),
                defaultMessage: 'Max age',
              })}
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma">
              {formatMessage({
                id: getTranslation('contentTypes.column.routes'),
                defaultMessage: 'Routes',
              })}
            </Typography>
          </Th>
          {canPurge ? (
            <Th>
              <Typography variant="sigma">
                {formatMessage({
                  id: getTranslation('contentTypes.column.actions'),
                  defaultMessage: 'Actions',
                })}
              </Typography>
            </Th>
          ) : null}
        </Tr>
      </Thead>
      <Tbody>
        {contentTypes.map((contentType) => {
          // Caching authenticated responses without keying on the caller means
          // two people authorised for the same route share one entry. The
          // server warns about this at boot; surface it where someone will
          // actually see it.
          const sharesAuthenticatedEntries =
            contentType.hitpass === false && !contentType.keysAuthIdentity;

          return (
            <Tr key={contentType.uid}>
              <Td>
                <Flex direction="column" alignItems="flex-start" gap={1}>
                  <Typography textColor="neutral800" fontWeight="semiBold">
                    {contentType.uid}
                  </Typography>
                  <Flex gap={1}>
                    {contentType.keysAuthIdentity ? (
                      <Tooltip
                        label={formatMessage({
                          id: getTranslation('contentTypes.authKeyed.hint'),
                          defaultMessage:
                            'Responses are cached separately for each authenticated caller.',
                        })}
                      >
                        <Badge>
                          {formatMessage({
                            id: getTranslation('contentTypes.authKeyed'),
                            defaultMessage: 'Keyed per caller',
                          })}
                        </Badge>
                      </Tooltip>
                    ) : null}
                    {sharesAuthenticatedEntries ? (
                      <Tooltip
                        label={formatMessage({
                          id: getTranslation('contentTypes.authRisk.hint'),
                          defaultMessage:
                            "Hitpass is disabled but keys.useAuth is not set, so one caller's response can be served to another.",
                        })}
                      >
                        {/* Themed, not a hardcoded hex: the badge has to stay
                            legible in dark mode and in every locale. */}
                        <Badge
                          backgroundColor="danger100"
                          textColor="danger600"
                          borderColor="danger200"
                        >
                          <Flex gap={1} alignItems="center">
                            <WarningCircle />
                            {formatMessage({
                              id: getTranslation('contentTypes.authRisk'),
                              defaultMessage: 'Shared across callers',
                            })}
                          </Flex>
                        </Badge>
                      </Tooltip>
                    ) : null}
                  </Flex>
                </Flex>
              </Td>
              <Td>
                <Typography textColor="neutral800">{contentType.entries}</Typography>
              </Td>
              <Td>
                <Typography textColor="neutral800">
                  {formatDuration(contentType.maxAge)}
                </Typography>
              </Td>
              <Td>
                <Flex direction="column" alignItems="flex-start">
                  {contentType.routes.map((route) => (
                    <Typography key={route} variant="pi" textColor="neutral600">
                      {route}
                    </Typography>
                  ))}
                  {contentType.relatedContentTypes.length > 0 ? (
                    <Typography variant="pi" textColor="neutral500">
                      {formatMessage(
                        {
                          id: getTranslation('contentTypes.related'),
                          defaultMessage:
                            'Also purges {count, plural, one {# related type} other {# related types}}',
                        },
                        { count: contentType.relatedContentTypes.length }
                      )}
                    </Typography>
                  ) : null}
                </Flex>
              </Td>
              {canPurge ? (
                <Td>
                  <Dialog.Root
                    open={pendingUid === contentType.uid}
                    onOpenChange={(open: boolean) =>
                      setPendingUid(open ? contentType.uid : null)
                    }
                  >
                    <Dialog.Trigger>
                      <Button
                        size="S"
                        variant="danger-light"
                        startIcon={<ArrowsCounterClockwise />}
                        // Nothing to purge, so the control would be a no-op.
                        disabled={contentType.entries === 0}
                      >
                        {formatMessage({
                          id: getTranslation('purge.contentType'),
                          defaultMessage: 'Purge',
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
                      <Dialog.Body icon={<WarningCircle />}>
                        {formatMessage(
                          {
                            id: getTranslation('purge.confirm-modal-body-all'),
                            defaultMessage:
                              'This removes every cached entry for {contentType}. The next request for each will be served from the database.',
                          },
                          { contentType: contentType.uid }
                        )}
                      </Dialog.Body>
                      <Dialog.Footer>
                        <Dialog.Cancel>
                          <Button fullWidth variant="tertiary">
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
                            onClick={() => handlePurge(contentType.uid)}
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
                </Td>
              ) : null}
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default ContentTypeTable;
