import pluginPkg from '../../package.json';
import pluginId from './pluginId';

import Initializer from './components/Initializer';
import ListViewInjectedComponent from './components/ListViewInjectedComponent';
import PurgeDocumentAction from './components/PurgeDocumentAction';
import EditViewInfoDocumentPanel from './components/EditViewInfoDocumentPanel';
const { name } = pluginPkg.strapi;

const prefixPluginTranslations = (
  trad,
  pluginId
) => {
  if (!pluginId) {
    throw new TypeError("pluginId can't be empty");
  }
  return Object.keys(trad).reduce((acc, current) => {
    acc[`${pluginId}.${current}`] = trad[current];
    return acc;
  }, {});
};

export default {
  register(app) {
    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: true,
      name,
    });
  },
  bootstrap(app) {
    app.getPlugin('content-manager').apis.addDocumentAction([PurgeDocumentAction])
    app.getPlugin('content-manager').apis.addEditViewSidePanel([EditViewInfoDocumentPanel])

    app.getPlugin('content-manager').injectComponent('listView', 'actions', {
      name: 'ListViewInjectedComponent',
      Component: ListViewInjectedComponent,
    });
  },
  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map((locale) =>
        import(`./translations/${locale}.json`)
          .then(({ default: data }) => ({
            data: prefixPluginTranslations(data, pluginId),
            locale,
          }))
          .catch(() => ({
            data: {},
            locale,
          }))
      )
    );

    return Promise.resolve(importedTrads);
  },
};
