---
title: Redirecting...
---

<script setup>
import { onMounted } from "vue";

onMounted(() => {
  if (typeof window === "undefined") {
    return;
  }

  const { pathname, search, hash } = window.location;
  const isDocsRoot = pathname === "/" || pathname === "/docs" || pathname === "/docs/";

  if (!isDocsRoot) {
    return;
  }

  const base = pathname.startsWith("/docs") ? "/docs" : "";
  const lang = navigator.language?.toLowerCase() ?? "";
  const target = lang.startsWith("zh")
    ? `${base}/zh/`
    : lang.startsWith("ja")
      ? `${base}/ja/`
      : `${base}/en/`;

  window.location.replace(`${target}${search}${hash}`);
});
</script>

# DDLBuilder Docs

Redirecting by browser language...

- [中文文档](/zh/)
- [English](/en/)
- [日本語](/ja/)
