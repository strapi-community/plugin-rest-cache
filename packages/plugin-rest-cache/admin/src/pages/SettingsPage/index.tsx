import { useIntl } from 'react-intl';
import { Box, Flex, Grid, Typography } from '@strapi/design-system';
import { EmptyDocuments } from '@strapi/icons/symbols';
import { Layouts, Page } from '@strapi/strapi/admin';

import StatCard from '../../components/StatCard';
import ContentTypeTable from '../../components/ContentTypeTable';
import { getTranslation } from '../../utils/getTranslation';
import { formatDuration } from '../../utils/formatDuration';
import { useCacheStats } from '../../services/restCache';

/**
 * useFetchClient rejects with an axios error, which carries the HTTP status on
 * `response.status`. A 403 here means this admin holds no
 * `cache.read-strategy` permission; the server is the authority on that.
 */
const isForbidden = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 403;

const SettingsPage = () => {
  const { formatMessage } = useIntl();

  // One request for the whole page. The stats endpoint already folds in the
  // provider name and the strategy flags, so there is no reason to also fetch
  // /config/strategy and /config/provider here.
  const { data, isLoading, error } = useCacheStats();

  if (isLoading) {
    return <Page.Loading />;
  }

  // The server is the authority on permissions, and it has just answered. A
  // 403 means this admin may not read the strategy; anything else is a real
  // failure. Deriving it from the response rather than from `useRBAC` is not
  // only simpler - the Auth context is not reachable from a lazily-loaded
  // plugin settings route in a production build. See pages/App.
  if (isForbidden(error)) {
    return <Page.NoPermissions />;
  }

  if (error || !data) {
    return (
      <Page.Error
        content={formatMessage({
          id: getTranslation('error.loading'),
          defaultMessage: 'Could not load the cache information',
        })}
      />
    );
  }

  // Purging is a separate action from reading, so an admin who can see this
  // page cannot necessarily clear it. The button is rendered optimistically
  // and the server refuses with a 403 it surfaces as a notification, which is
  // the same contract the content-manager contributions use.
  const canPurge = true;

  const { provider, strategy, totals, contentTypes } = data;

  const flags: Array<{ id: string; defaultMessage: string; enabled: boolean }> = [
    {
      id: 'strategy.enableEtag',
      defaultMessage: 'ETag support',
      enabled: strategy.enableEtag,
    },
    {
      id: 'strategy.enableXCacheHeaders',
      defaultMessage: 'X-Cache headers',
      enabled: strategy.enableXCacheHeaders,
    },
    {
      id: 'strategy.enableDocumentServiceMiddleware',
      defaultMessage: 'Document service invalidation',
      enabled: strategy.enableDocumentServiceMiddleware,
    },
    {
      id: 'strategy.clearRelatedCache',
      defaultMessage: 'Clear related cache',
      enabled: strategy.clearRelatedCache,
    },
  ];

  return (
    <Page.Main>
      <Page.Title>
        {formatMessage({
          id: getTranslation('settings.page.title'),
          defaultMessage: 'REST Cache',
        })}
      </Page.Title>

      <Layouts.Header
        title={formatMessage({
          id: getTranslation('settings.page.title'),
          defaultMessage: 'REST Cache',
        })}
        subtitle={formatMessage({
          id: getTranslation('settings.page.subtitle'),
          defaultMessage: 'What the cache currently holds, and how it is configured.',
        })}
      />

      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>
          <Grid.Root gap={4}>
            <Grid.Item col={3} s={6} xs={12} direction="column" alignItems="stretch">
              <StatCard
                label={formatMessage({
                  id: getTranslation('overview.entries'),
                  defaultMessage: 'Cached entries',
                })}
                value={totals.entries}
              />
            </Grid.Item>
            <Grid.Item col={3} s={6} xs={12} direction="column" alignItems="stretch">
              <StatCard
                label={formatMessage({
                  id: getTranslation('overview.etags'),
                  defaultMessage: 'Stored ETags',
                })}
                value={totals.etags}
              />
            </Grid.Item>
            <Grid.Item col={3} s={6} xs={12} direction="column" alignItems="stretch">
              <StatCard
                label={formatMessage({
                  id: getTranslation('overview.contentTypes'),
                  defaultMessage: 'Cached content types',
                })}
                value={totals.contentTypes}
              />
            </Grid.Item>
            <Grid.Item col={3} s={6} xs={12} direction="column" alignItems="stretch">
              <StatCard
                label={formatMessage({
                  id: getTranslation('overview.provider'),
                  defaultMessage: 'Provider',
                })}
                value={provider.name ?? '-'}
                hint={`${formatMessage({
                  id: getTranslation('strategy.maxAge'),
                  defaultMessage: 'Default max age',
                })}: ${formatDuration(strategy.maxAge)}`}
              />
            </Grid.Item>
          </Grid.Root>

          <Box
            background="neutral0"
            hasRadius
            shadow="tableShadow"
            padding={6}
            borderColor="neutral150"
          >
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Typography variant="delta">
                {formatMessage({
                  id: getTranslation('strategy.title'),
                  defaultMessage: 'Strategy',
                })}
              </Typography>

              <Grid.Root gap={4}>
                {flags.map((flag) => (
                  <Grid.Item
                    key={flag.id}
                    col={3}
                    s={6}
                    xs={12}
                    direction="column"
                    alignItems="flex-start"
                  >
                    <Typography variant="sigma" textColor="neutral600">
                      {formatMessage({
                        id: getTranslation(flag.id),
                        defaultMessage: flag.defaultMessage,
                      })}
                    </Typography>
                    <Typography
                      textColor={flag.enabled ? 'success600' : 'neutral600'}
                      fontWeight="semiBold"
                    >
                      {formatMessage(
                        flag.enabled
                          ? {
                              id: getTranslation('strategy.enabled'),
                              defaultMessage: 'Enabled',
                            }
                          : {
                              id: getTranslation('strategy.disabled'),
                              defaultMessage: 'Disabled',
                            }
                      )}
                    </Typography>
                  </Grid.Item>
                ))}

                <Grid.Item col={3} s={6} xs={12} direction="column" alignItems="flex-start">
                  <Typography variant="sigma" textColor="neutral600">
                    {formatMessage({
                      id: getTranslation('strategy.keysPrefix'),
                      defaultMessage: 'Keys prefix',
                    })}
                  </Typography>
                  <Typography textColor="neutral800" fontWeight="semiBold">
                    {strategy.keysPrefix ||
                      formatMessage({
                        id: getTranslation('strategy.none'),
                        defaultMessage: 'None',
                      })}
                  </Typography>
                </Grid.Item>
              </Grid.Root>
            </Flex>
          </Box>

          <Box
            background="neutral0"
            hasRadius
            shadow="tableShadow"
            padding={6}
            borderColor="neutral150"
          >
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Typography variant="delta">
                {formatMessage({
                  id: getTranslation('contentTypes.title'),
                  defaultMessage: 'Cached content types',
                })}
              </Typography>

              {contentTypes.length === 0 ? (
                <Page.NoData
                  content={formatMessage({
                    id: getTranslation('empty.noContentTypes'),
                    defaultMessage: 'No content types are configured for caching yet.',
                  })}
                  icon={<EmptyDocuments width="16rem" />}
                />
              ) : (
                <ContentTypeTable contentTypes={contentTypes} canPurge={canPurge} />
              )}
            </Flex>
          </Box>
        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
};

export default SettingsPage;
