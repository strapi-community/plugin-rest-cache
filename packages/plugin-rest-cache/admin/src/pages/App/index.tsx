import SettingsPage from '../SettingsPage';

/**
 * Route entry for the settings page.
 *
 * Deliberately no `Page.Protect`, and nothing else here that reads the `Auth`
 * context.
 *
 * A plugin settings link is registered by pushing a lazy route into the
 * `settings/*` children (see `createSettingsLink` in @strapi/admin's
 * core/apis/router). From inside that lazily-loaded chunk, in a production
 * admin build, the Auth context is not reachable: `useAuth` returns undefined
 * and `useRBAC` throws "`useRBAC` must be used within `Auth`", which the error
 * boundary turns into "Something went wrong". First-party settings pages are
 * compiled into the host bundle and never hit this.
 *
 * It reproduces only under `strapi build` + `strapi start`, never under
 * `strapi develop` - which is exactly why it survived manual testing and was
 * caught by the browser suite instead.
 *
 * Permissions are therefore derived from the API - see SettingsPage. That is
 * not a downgrade in safety: the UI gate never was the boundary. Every admin
 * route carries an `admin::hasPermissions` policy for the same action, so the
 * server refuses regardless of what the panel chooses to render.
 */
const App = () => <SettingsPage />;

export default App;
