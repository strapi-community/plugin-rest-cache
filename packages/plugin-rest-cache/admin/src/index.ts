import { Lightning } from '@strapi/icons';
import type { StrapiApp } from '@strapi/strapi/admin';

import pluginPkg from '../../package.json';
import { pluginId } from './pluginId';
import pluginPermissions from './permissions';
import { getTranslation, prefixPluginTranslations } from './utils/getTranslation';
import Initializer from './components/Initializer';
import ListViewInjectedComponent from './components/ListViewInjectedComponent';
import PurgeDocumentAction from './components/PurgeDocumentAction';
import EditViewInfoDocumentPanel from './components/EditViewInfoDocumentPanel';
import type { ContentManagerApis } from './types/contentManager';

const { name } = pluginPkg.strapi;

export default {
  register(app: StrapiApp) {
    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: true,
      name,
    });

    // `addSettingsLink`, not `createSettingSection`/`addSettingsLinks` - both
    // of those are deprecated as of Strapi 5.52 in favour of this one, which
    // accepts the section object inline.
    //
    // The plugin had no settings entry at all before this: a HomePage existed
    // but nothing ever registered a route to it, so it was unreachable.
    app.createSettingSection(
      {
        id: pluginId,
        intlLabel: {
          id: getTranslation('settings.section.label'),
          defaultMessage: 'REST Cache',
        },
      },
      [
        {
          id: `${pluginId}-overview`,
          intlLabel: {
            id: getTranslation('settings.page.label'),
            defaultMessage: 'Overview',
          },
          to: pluginId,
          Component: () => import('./pages/App'),
          permissions: pluginPermissions.readStrategy,
        },
      ]
    );

    app.widgets.register({
      // Required, despite `WidgetArgs` typing it optional: Widgets.checkWidgets
      // asserts it with `invariant`. Passing undefined throws during register,
      // which does not degrade to "no widget" - it takes down the entire admin
      // panel, leaving an empty #strapi div and no console error.
      icon: Lightning,
      id: 'cache-overview',
      pluginId,
      title: {
        id: getTranslation('widget.title'),
        defaultMessage: 'REST Cache',
      },
      link: {
        label: {
          id: getTranslation('widget.link'),
          defaultMessage: 'Open REST Cache',
        },
        href: `/settings/${pluginId}`,
      },
      component: async () => {
        const { default: Component } = await import('./widgets/CacheOverview');
        return Component;
      },
      permissions: pluginPermissions.readStrategy,
    });
  },

  bootstrap(app: StrapiApp) {
    // Strapi types `Plugin.apis` as Record<string, unknown>, so extending
    // another plugin needs an assertion. See types/contentManager.ts for why
    // this is a local shape rather than an import from @strapi/content-manager.
    const contentManager = app.getPlugin('content-manager');
    const apis = contentManager.apis as unknown as ContentManagerApis;

    apis.addDocumentAction([PurgeDocumentAction]);
    apis.addEditViewSidePanel([EditViewInfoDocumentPanel]);

    contentManager.injectComponent('listView', 'actions', {
      name: 'ListViewInjectedComponent',
      Component: ListViewInjectedComponent,
    });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    // Tolerates a locale with no translation file: the admin panel supports
    // far more locales than this plugin ships, and a missing one must fall
    // back to the defaultMessage rather than fail the whole registration.
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);

          return { data: prefixPluginTranslations(data, pluginId), locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};
