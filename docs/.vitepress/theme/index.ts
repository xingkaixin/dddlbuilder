import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import ChangelogHeadingEnhancer from './components/ChangelogHeadingEnhancer.vue';
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
