<script setup lang="ts">
import { onMounted } from 'vue';
import { onContentUpdated, useData } from 'vitepress';

const { page } = useData();

const CHANGELOG_PATH_RE = /(?:^|\/)changelog\/changelog\.md$/;
const CHANGELOG_HEADING_RE = /^\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})$/;

function isChangelogPage() {
  return CHANGELOG_PATH_RE.test(page.value.relativePath);
}

function getRawHeadingText(heading: HTMLHeadingElement) {
  if (heading.dataset.changelogRawTitle) {
    return heading.dataset.changelogRawTitle;
  }

  const rawText = Array.from(heading.childNodes)
    .filter(
      (node) =>
        !(node instanceof HTMLElement && node.classList.contains('header-anchor'))
    )
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();

  heading.dataset.changelogRawTitle = rawText;
  return rawText;
}

function styleChangelogHeadings() {
  if (typeof document === 'undefined' || !isChangelogPage()) {
    return;
  }

  const headings = document.querySelectorAll<HTMLHeadingElement>('.vp-doc h2');

  headings.forEach((heading) => {
    if (heading.dataset.changelogStyled === 'true') {
      return;
    }

    const match = getRawHeadingText(heading).match(CHANGELOG_HEADING_RE);
    if (!match) {
      return;
    }

    const [, version, date] = match;
    const anchor = heading.querySelector('.header-anchor');

    Array.from(heading.childNodes).forEach((node) => {
      if (node !== anchor) {
        node.remove();
      }
    });

    const wrapper = document.createElement('span');
    wrapper.className = 'ddl-changelog-heading';

    const versionNode = document.createElement('span');
    versionNode.className = 'ddl-changelog-version';
    versionNode.textContent = version;

    const dateNode = document.createElement('span');
    dateNode.className = 'ddl-changelog-date';
    dateNode.textContent = date;

    wrapper.append(versionNode, dateNode);
    heading.insertBefore(wrapper, anchor);
    heading.dataset.changelogStyled = 'true';
  });
}

onMounted(styleChangelogHeadings);
onContentUpdated(styleChangelogHeadings);
</script>

<template />
