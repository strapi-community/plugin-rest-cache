import { Page } from '@strapi/strapi/admin';

import SettingsPage from '../SettingsPage';
import pluginPermissions from '../../permissions';

/**
 * Route-level wrapper for the settings page.
 *
 * Page.Protect repeats the permission already given to the settings link.
 * That is deliberate rather than redundant: the link only controls what is
 * shown in the menu, and someone can navigate straight to the URL. Neither is
 * the real boundary - every admin route carries an `admin::hasPermissions`
 * policy for the same action - but a blank page beats a page that renders and
 * then fails every request behind it.
 *
 * This is one page, so there is no router here. The previous version declared
 * react-router v5 `Switch`/`component` routes against react-router v6, which
 * would have thrown had anything ever rendered it - nothing did, because no
 * menu link or settings section was ever registered.
 */
const App = () => (
  <Page.Protect permissions={pluginPermissions.readStrategy}>
    <SettingsPage />
  </Page.Protect>
);

export default App;
