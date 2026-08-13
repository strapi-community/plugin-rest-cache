import { useIntl } from 'react-intl';
import { Box, Flex, Grid, Typography } from '@strapi/design-system';
import { EmptyDocuments } from '@strapi/icons/symbols';
import { Layouts, Page, useRBAC } from '@strapi/strapi/admin';

import StatCard from '../../components/StatCard';
import ContentTypeTable from '../../components/ContentTypeTable';
import { getTranslation } from '../../utils/getTranslation';
import { formatDuration } from '../../utils/formatDuration';
import { useGetCacheStatsQuery } from '../../services/restCache';
import pluginPermissions from '../../permissions';

const SettingsPage = () => {
  const { formatMessage } = useIntl();

  // One request for the whole page. The stats endpoint already folds in the
  // provider name and the strategy flags, so there is no reason to also fetch
  // /config/strategy and /config/provider here.
  const { data, isLoading, error } = useGetCacheStatsQuery();

  const {
    isLoading: isLoadingPermissions,
    allowedActions: { canPurge },
  } = useRBAC({ purge: pluginPermissions.purge });

  if (isLoading || isLoadingPermissions) {
    return <Page.Loading />;
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
