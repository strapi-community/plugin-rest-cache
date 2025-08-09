import { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme'
import './custom.css'
import VersionSwitcher from '../components/VersionSwitcher.vue';
// @ts-expect-error
import Layout from './Layout.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('VersionSwitcher', VersionSwitcher)
  },
  Layout,
} satisfies Theme;
