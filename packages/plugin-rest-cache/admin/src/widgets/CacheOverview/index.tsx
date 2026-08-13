import { useIntl } from 'react-intl';
import { Flex, Typography } from '@strapi/design-system';
import { Widget } from '@strapi/strapi/admin';

import { getTranslation } from '../../utils/getTranslation';
import { useGetCacheStatsQuery } from '../../services/restCache';

/**
 * Homepage widget: how much is cached, and by what.
 *
 * Shares the RTK Query cache with the settings page, so opening the dashboard
 * after the homepage does not refetch, and a purge from either updates both.
 */
const CacheOverviewWidget = () => {
  const { formatMessage } = useIntl();
  const { data, isLoading, error } = useGetCacheStatsQuery();

  if (isLoading) {
    return <Widget.Loading />;
  }

  if (error || !data) {
    return <Widget.Error />;
  }

  if (data.totals.entries === 0) {
    return (
      <Widget.NoData>
        {formatMessage({
          id: getTranslation('empty.noEntries'),
          defaultMessage:
            'The cache is empty. Entries appear here once cached routes are requested.',
        })}
      </Widget.NoData>
    );
  }

  return (
    <Flex direction="column" alignItems="center" justifyContent="center" height="100%" gap={2}>
      <Typography variant="alpha" textColor="neutral800">
        {data.totals.entries}
      </Typography>
      <Typography variant="omega" textColor="neutral600">
        {formatMessage(
          {
            id: getTranslation('widget.entries'),
            defaultMessage: '{count, plural, one {# entry} other {# entries}} cached',
          },
          { count: data.totals.entries }
        )}
      </Typography>
      {data.provider.name ? (
        <Typography variant="pi" textColor="neutral500">
          {formatMessage(
            { id: getTranslation('widget.provider'), defaultMessage: 'via {provider}' },
            { provider: data.provider.name }
          )}
        </Typography>
      ) : null}
    </Flex>
  );
};

export default CacheOverviewWidget;
