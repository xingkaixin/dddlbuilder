import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import { h } from 'vue';
import ChangelogHeadingEnhancer from './components/ChangelogHeadingEnhancer.vue';
import './fonts/roboto-mono/fonts.css';
import './custom.css';

const { Layout } = DefaultTheme;

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(Layout, null, {
      'doc-after': () => h(ChangelogHeadingEnhancer),
    }),
};

export default theme;
