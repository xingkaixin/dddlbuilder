import path from 'node:path';
import { defineRule, eslintCompatPlugin } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const PACKAGE_OR_APP_PATH = /^(packages|apps)\/([^/]+)\//;
const TEST_FILE_PATH = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const EMPTY_INTERNAL_PACKAGES: ReadonlySet<string> = new Set();

const ALLOWED_INTERNAL_PACKAGES = new Map<string, ReadonlySet<string>>([
  ['apps/web', new Set(['ddl-core', 'workspace-core', 'shared-types', 'design'])],
  ['apps/worker', new Set(['ddl-core', 'workspace-core', 'user-db', 'shared-types'])],
  ['apps/docs', new Set(['design'])],
  ['packages/ddl-core', new Set(['shared-types'])],
  ['packages/workspace-core', new Set(['shared-types'])],
  ['packages/db', EMPTY_INTERNAL_PACKAGES],
  ['packages/design', EMPTY_INTERNAL_PACKAGES],
  ['packages/shared-types', EMPTY_INTERNAL_PACKAGES],
]);

type FileOwner = {
  absFilename: string;
  ownerKey: string;
  ownerRoot: string;
  isSharedPackageNonTest: boolean;
  allowedInternalPackages: ReadonlySet<string>;
};

const resolveFileOwner = (filename: string): FileOwner | null => {
  const absFilename = path.resolve(filename);
  const relToRepo = path.relative(repoRoot, absFilename).split(path.sep).join('/');
  const match = PACKAGE_OR_APP_PATH.exec(relToRepo);

  if (!match) return null;

  const [, scope, name] = match;
  const ownerKey = `${scope}/${name}`;
  const ownerRoot = path.join(repoRoot, scope, name);

  const isSharedPackageNonTest =
    scope === 'packages' && !relToRepo.includes('/__tests__/') && !TEST_FILE_PATH.test(relToRepo);

  return {
    absFilename,
    ownerKey,
    ownerRoot,
    isSharedPackageNonTest,
    allowedInternalPackages: ALLOWED_INTERNAL_PACKAGES.get(ownerKey) ?? EMPTY_INTERNAL_PACKAGES,
  };
};

const isStringLiteral = (node: ESTree.Node | undefined): node is ESTree.StringLiteral =>
  node?.type === 'Literal' && typeof node.value === 'string';

const noReExportRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow re-exports outside package entry points.',
    },
    messages: {
      reExport:
        'Do not re-export. Import from the module that defines the symbol; only package entry points may re-export.',
    },
  },
  createOnce(context) {
    return {
      ExportAllDeclaration(node) {
        context.report({ node, messageId: 'reExport' });
      },
      ExportNamedDeclaration(node) {
        if (node.source) context.report({ node, messageId: 'reExport' });
      },
    };
  },
});

const packageBoundariesRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce package dependency directions and shared-package runtime boundaries.',
    },
    messages: {
      crossBoundaryRelativeImport:
        'Do not import "{{specifier}}" across package or app boundaries from "{{owner}}". Import from an allowed "@ddlbuilder/*" package entry point.',
      forbiddenInternalImport:
        '"{{owner}}" must not depend on "{{specifier}}". Check docs/architecture.md for allowed package dependencies.',
      forbiddenCloudflareImport:
        'Shared package "{{owner}}" must not import Cloudflare runtime module "{{specifier}}" in non-test source.',
    },
  },
  createOnce(context) {
    let owner: FileOwner | null = null;

    const checkSpecifier = (node: ESTree.Node, specifier: string) => {
      if (!owner) return;

      if (specifier.startsWith('.')) {
        const resolvedTarget = path.resolve(path.dirname(owner.absFilename), specifier);
        const relToOwner = path.relative(owner.ownerRoot, resolvedTarget);

        if (
          relToOwner === '..' ||
          relToOwner.startsWith(`..${path.sep}`) ||
          relToOwner.startsWith('../') ||
          path.isAbsolute(relToOwner)
        ) {
          context.report({
            node,
            messageId: 'crossBoundaryRelativeImport',
            data: { owner: owner.ownerKey, specifier },
          });
        }

        return;
      }

      if (specifier.startsWith('@ddlbuilder/')) {
        const withoutScope = specifier.slice('@ddlbuilder/'.length);
        const slashIndex = withoutScope.indexOf('/');
        const packageName = slashIndex === -1 ? withoutScope : withoutScope.slice(0, slashIndex);

        if (!owner.allowedInternalPackages.has(packageName)) {
          context.report({
            node,
            messageId: 'forbiddenInternalImport',
            data: { owner: owner.ownerKey, specifier },
          });
        }

        return;
      }

      if (
        owner.isSharedPackageNonTest &&
        (specifier === 'cloudflare' ||
          specifier.startsWith('cloudflare:') ||
          specifier.startsWith('@cloudflare/'))
      ) {
        context.report({
          node,
          messageId: 'forbiddenCloudflareImport',
          data: { owner: owner.ownerKey, specifier },
        });
      }
    };

    return {
      Program() {
        owner = resolveFileOwner(context.filename);
      },
      'Program:exit'() {
        owner = null;
      },
      ImportDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSpecifier(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ImportExpression(node) {
        if (isStringLiteral(node.source)) {
          checkSpecifier(node, node.source.value);
        }
      },
      TSImportType(node) {
        if (isStringLiteral(node.source)) {
          checkSpecifier(node, node.source.value);
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;

        const firstArg = node.arguments[0];

        if (isStringLiteral(firstArg)) {
          checkSpecifier(node, firstArg.value);
        }
      },
    };
  },
});

const projectPlugin = eslintCompatPlugin({
  meta: { name: 'project' },
  rules: {
    'no-re-export': noReExportRule,
    'package-boundaries': packageBoundariesRule,
  },
});

export default projectPlugin;
