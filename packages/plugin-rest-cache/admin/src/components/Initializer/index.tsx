import { useEffect, useRef } from 'react';

import { pluginId } from '../../pluginId';

export interface InitializerProps {
  /**
   * Handed down by the admin panel. Calling it marks the plugin as ready.
   *
   * Matches `Plugin['initializer']` in `@strapi/strapi/admin`, which types the
   * component as `ComponentType<{ setPlugin(_pluginId: string): void }>`.
   */
  setPlugin: (pluginId: string) => void;
}

/**
 * Signals to the admin panel that the plugin has finished loading.
 *
 * Renders nothing. The callback is held in a ref so the effect can stay on an
 * empty dependency array - it must fire exactly once, on mount, and a parent
 * re-render that produces a new `setPlugin` identity must not re-run it.
 */
const Initializer = ({ setPlugin }: InitializerProps) => {
  const ref = useRef(setPlugin);
  ref.current = setPlugin;

  useEffect(() => {
    ref.current(pluginId);
  }, []);

  return null;
};

export default Initializer;
