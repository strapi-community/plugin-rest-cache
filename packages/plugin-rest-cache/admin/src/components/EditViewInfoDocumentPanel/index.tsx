import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Flex, Typography } from '@strapi/design-system';

import { getTranslation } from '../../utils/getTranslation';
import { formatDuration } from '../../utils/formatDuration';
import { useCachedDocument } from '../../hooks/useCachedDocument';
import type { EditViewContext } from '../../types/contentManager';

/**
 * The content-manager hands every edit-view contribution the same context, so
 * the props are `EditViewContext` verbatim rather than a narrower shape - the
 * component is registered against that contract, not against its own.
 */
export type EditViewInfoDocumentPanelProps = EditViewContext;

/**
 * What an edit-view side panel returns.
 *
 * Mirrors the content-manager's `PanelDescription`. Declared here rather than
 * imported for the same reason as `EditViewContext`: `@strapi/content-manager`
 * is present at runtime but is not a dependency of this package.
 */
export interface EditViewInfoDocumentPanelDescription {
  title: string;
  content: ReactNode;
}

/**
 * Tells the editor that responses for this entry are cached, and for how long.
 *
 * Returns a description object rather than an element - that is the
 * content-manager's side panel contract. Returning null withdraws the panel.
 *
 * The "for how long" is the point. Someone who has just published a change and
 * is looking at stale output needs to know whether to wait or to purge, and
 * the max age is what answers that. The panel previously rendered an empty
 * body under a hardcoded English title, which answered neither.
 */
const EditViewInfoDocumentPanel = ({
  model,
}: EditViewInfoDocumentPanelProps): EditViewInfoDocumentPanelDescription | null => {
  const { formatMessage } = useIntl();
  const { isEligible, config } = useCachedDocument(model);

  if (!isEligible) {
    return null;
  }

  return {
    title: formatMessage({
      id: getTranslation('panel.cached.title'),
      defaultMessage: 'REST Cache',
    }),
    content: (
      <Flex direction="column" alignItems="flex-start" gap={2}>
        <Typography variant="omega" textColor="neutral600">
          {formatMessage(
            {
              id: getTranslation('panel.cached.body'),
              defaultMessage:
                'Responses for this entry are cached for up to {maxAge} after they are first requested.',
            },
            { maxAge: formatDuration(config?.maxAge) }
          )}
        </Typography>
        {config?.keys?.useAuth ? (
          <Typography variant="pi" textColor="neutral500">
            {formatMessage({
              id: getTranslation('contentTypes.authKeyed.hint'),
              defaultMessage:
                'Responses are cached separately for each authenticated caller.',
            })}
          </Typography>
        ) : null}
      </Flex>
    ),
  };
};

export default EditViewInfoDocumentPanel;
