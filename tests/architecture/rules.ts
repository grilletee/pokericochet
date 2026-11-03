import { posix } from 'node:path';
import { parse } from '@babel/parser';

export type Layer = 'domain' | 'data' | 'render' | 'ui' | 'app';

/** Which layers a layer may import from (see Arquitectura-v0 / ADR-006). */
const ALLOWED_LAYERS: Record<Layer, readonly Layer[]> = {
  domain: ['domain'],
  data: ['data', 'domain'],
  render: ['render', 'domain'],
  ui: ['ui', 'domain'],
  app: ['app', 'domain', 'data', 'render', 'ui'],
};

/** Bare package imports allowed per layer. The domain gets none. */
const ALLOWED_PACKAGES: Record<Layer, readonly string[] | 'any'> = {
  domain: [],
  data: [],
  render: ['pixi.js'],
  ui: [],
  app: 'any',
};

/**
 * The only Math members the domain may use. They are exact (correctly rounded or pure
 * comparisons), so results do not depend on the JS engine. Everything else (sin, cos, pow,
 * hypot, random, ...) is banned.
 */
const DOMAIN_MATH_ALLOWLIST: ReadonlySet<string> = new Set([
  'sqrt',
  'abs',
  'min',
  'max',
  'floor',
  'ceil',
  'trunc',
  'sign',
]);

/** Globals that would make the domain non-deterministic or tie it to a platform. */
const DOMAIN_BANNED_GLOBALS: ReadonlySet<string> = new Set([
  'Date',
  'performance',
  'Intl',
  'crypto',
  'globalThis',
  'self',
  'process',
  'Buffer',
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'eval',
]);

type AstNode = { type: string; loc?: { start: { line: number } } | null; [key: string]: unknown };

const SKIPPED_KEYS: ReadonlySet<string> = new Set([
  'loc',
  'start',
  'end',
  'range',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'comments',
]);

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function walk(
  node: AstNode,
  parent: AstNode | null,
  key: string | null,
  visit: (node: AstNode, parent: AstNode | null, key: string | null) => void,
): void {
  visit(node, parent, key);
  for (const [childKey, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(childKey)) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) walk(item, node, childKey, visit);
    } else if (isNode(value)) {
      walk(value, node, childKey, visit);
    }
  }
}

/** Layer a source file belongs to; files directly under src/ (main.ts) belong to `app`. */
export function layerOfFile(file: string): Layer | null {
  if (!file.startsWith('src/')) return null;
  const segment = file.split('/')[1] ?? '';
  return segment in ALLOWED_LAYERS ? (segment as Layer) : 'app';
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function checkImport(file: string, layer: Layer, specifier: string): string | null {
  if (isRelative(specifier)) {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    const targetLayer = layerOfFile(target);
    if (targetLayer === null) return `import "${specifier}" leaves src/`;
    if (!ALLOWED_LAYERS[layer].includes(targetLayer)) {
      return `layer "${layer}" must not import from layer "${targetLayer}" ("${specifier}")`;
    }
    return null;
  }
  const allowed = ALLOWED_PACKAGES[layer];
  if (allowed === 'any' || allowed.includes(packageName(specifier))) return null;
  return `layer "${layer}" must not import package "${specifier}"`;
}

function isExactIntegerLiteral(node: unknown): boolean {
  if (!isNode(node)) return false;
  if (node.type === 'NumericLiteral') return Number.isInteger(node.value);
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    return isExactIntegerLiteral(node.argument);
  }
  return false;
}

function isPropertyNamePosition(parent: AstNode | null, key: string | null): boolean {
  if (parent === null) return false;
  if (key === 'property' && !parent.computed) {
    return parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression';
  }
  return key === 'key' && !parent.computed;
}

/**
 * Returns the architecture violations found in one source file. `file` is a posix path relative
 * to the repo root (e.g. "src/domain/fuse.ts").
 */
export function findViolations(file: string, source: string): string[] {
  const layer = layerOfFile(file);
  if (layer === null) return [`${file}: not under src/`];

  const violations: string[] = [];
  const report = (node: AstNode, message: string): void => {
    violations.push(`${file}:${node.loc?.start.line ?? 0} ${message}`);
  };

  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });

  walk(ast.program as unknown as AstNode, null, null, (node, parent, key) => {
    // Imports and re-exports (type-only ones count too: the dependency still exists).
    const specifierNode = node.source;
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration' ||
        node.type === 'ImportExpression') &&
      specifierNode !== null &&
      specifierNode !== undefined
    ) {
      if (isNode(specifierNode) && typeof specifierNode.value === 'string') {
        const problem = checkImport(file, layer, specifierNode.value);
        if (problem) report(node, problem);
      } else {
        report(node, 'import specifier must be a string literal');
      }
    }
    if (node.type === 'CallExpression' && isNode(node.callee)) {
      const isRequire = node.callee.type === 'Identifier' && node.callee.name === 'require';
      if (isRequire || node.callee.type === 'Import')
        report(node, 'require()/import() not allowed');
    }

    if (layer !== 'domain') return;

    if (
      (node.type === 'BinaryExpression' && node.operator === '**') ||
      (node.type === 'AssignmentExpression' && node.operator === '**=')
    ) {
      if (!isExactIntegerLiteral(node.right)) {
        report(node, 'the ** operator is only allowed with an integer literal exponent');
      }
    }

    if (node.type !== 'Identifier' || typeof node.name !== 'string') return;
    if (isPropertyNamePosition(parent, key)) return;

    if (node.name === 'Math') {
      const member =
        parent !== null &&
        parent.type === 'MemberExpression' &&
        key === 'object' &&
        !parent.computed &&
        isNode(parent.property) &&
        parent.property.type === 'Identifier'
          ? String(parent.property.name)
          : null;
      if (member === null) report(node, 'Math may only be used as Math.<allowed member>');
      else if (!DOMAIN_MATH_ALLOWLIST.has(member)) {
        report(node, `Math.${member} is not allowed in the domain (only +,-,*,/ and Math.sqrt)`);
      }
      return;
    }
    if (DOMAIN_BANNED_GLOBALS.has(node.name)) {
      report(node, `global "${node.name}" is not allowed in the domain`);
    }
  });

  return violations;
}
