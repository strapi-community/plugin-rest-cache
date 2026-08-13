import { Box, Flex, Typography } from '@strapi/design-system';

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Optional qualifier shown under the value, e.g. the provider name. */
  hint?: string;
}

/**
 * A single headline figure.
 *
 * Deliberately not a Card: the design system's Card carries hover and focus
 * affordances that imply it is actionable, and these are not.
 */
const StatCard = ({ label, value, hint }: StatCardProps) => (
  // height 100% so a card with a hint does not grow taller than its
  // neighbours. The grid row already stretches; without this the Box sizes to
  // its own content and only the card carrying a hint gets taller.
  <Box
    background="neutral0"
    hasRadius
    shadow="tableShadow"
    padding={4}
    borderColor="neutral150"
    height="100%"
  >
    <Flex direction="column" alignItems="flex-start" gap={1} height="100%">
      <Typography variant="sigma" textColor="neutral600">
        {label}
      </Typography>
      <Typography variant="alpha" textColor="neutral800">
        {value}
      </Typography>
      {/* Pinned to the bottom so the headline figures stay on one baseline
          across all four cards whether or not a hint is present. */}
      {hint ? (
        <Box marginTop="auto">
          <Typography variant="pi" textColor="neutral600">
            {hint}
          </Typography>
        </Box>
      ) : null}
    </Flex>
  </Box>
);

export default StatCard;
