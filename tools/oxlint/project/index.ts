import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";

const noReExportRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow re-exports outside package entry points.",
    },
    messages: {
      reExport:
        "Do not re-export. Import from the module that defines the symbol; only package entry points may re-export.",
    },
  },
  createOnce(context) {
    return {
      ExportAllDeclaration(node) {
        context.report({ node, messageId: "reExport" });
      },
      ExportNamedDeclaration(node) {
        if (node.source) context.report({ node, messageId: "reExport" });
      },
    };
  },
});

const projectPlugin = eslintCompatPlugin({
  meta: { name: "project" },
  rules: { "no-re-export": noReExportRule },
});

export default projectPlugin;
