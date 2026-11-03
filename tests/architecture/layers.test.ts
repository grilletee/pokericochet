import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findViolations } from './rules';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(): string[] {
  return readdirSync(`${ROOT}src`, { recursive: true, encoding: 'utf8' })
    .map((name) => `src/${name.replaceAll('\\', '/')}`)
    .filter((name) => name.endsWith('.ts'));
}

describe('architecture rules on the real source tree', () => {
  it('finds source files to check', () => {
    expect(sourceFiles().length).toBeGreaterThan(0);
  });

  it('has no layer or determinism violations under src/', () => {
    const violations = sourceFiles().flatMap((file) =>
      findViolations(file, readFileSync(`${ROOT}${file}`, 'utf8')),
    );
    expect(violations).toEqual([]);
  });
});

describe('the checker catches violations (self-test)', () => {
  const domainFile = 'src/domain/example.ts';

  const forbidden: Array<[name: string, file: string, code: string]> = [
    ['domain imports render', domainFile, "import { x } from '../render/x';"],
    ['domain imports data', domainFile, "import type { x } from '../data/x';"],
    ['domain re-exports from ui', domainFile, "export { x } from '../ui/x';"],
    ['domain imports a package', domainFile, "import { Application } from 'pixi.js';"],
    ['domain dynamic import', domainFile, "const m = await import('../render/x');"],
    ['domain imports outside src', domainFile, "import { x } from '../../tests/x';"],
    ['render imports ui', 'src/render/a.ts', "import { x } from '../ui/x';"],
    ['render imports data', 'src/render/a.ts', "import { x } from '../data/x';"],
    ['data imports render', 'src/data/a.ts', "import { x } from '../render/x';"],
    ['ui imports an unlisted package', 'src/ui/a.ts', "import { x } from 'lodash';"],
    ['Math.hypot', domainFile, 'const d = Math.hypot(a, b);'],
    ['Math.pow', domainFile, 'const d = Math.pow(a, 2);'],
    ['Math.sin', domainFile, 'const d = Math.sin(a);'],
    ['Math.cos', domainFile, 'const d = Math.cos(a);'],
    ['Math.random', domainFile, 'const d = Math.random();'],
    ['Math.atan2', domainFile, 'const d = Math.atan2(a, b);'],
    ['Math computed access', domainFile, "const d = Math['sin'](a);"],
    ['Math aliased', domainFile, 'const m = Math;'],
    ['Math destructured', domainFile, 'const { sin } = Math;'],
    ['** with fractional exponent', domainFile, 'const d = a ** 0.5;'],
    ['** with variable exponent', domainFile, 'const d = a ** b;'],
    ['**= with fractional exponent', domainFile, 'a **= 1.5;'],
    ['Date', domainFile, 'const t = Date.now();'],
    ['performance', domainFile, 'const t = performance.now();'],
    ['document', domainFile, 'const el = document.body;'],
    ['setTimeout', domainFile, 'setTimeout(() => {}, 1);'],
  ];

  it.each(forbidden)('rejects: %s', (_name, file, code) => {
    expect(findViolations(file, code).length).toBeGreaterThan(0);
  });

  const allowed: Array<[name: string, file: string, code: string]> = [
    ['relative import inside the domain', domainFile, "import { x } from './other';"],
    ['Math.sqrt', domainFile, 'const d = Math.sqrt(a * a + b * b);'],
    ['Math.min/max/abs/floor', domainFile, 'const d = Math.min(Math.abs(a), Math.floor(b));'],
    ['** with an integer literal', domainFile, 'const d = a ** 2;'],
    ['property named like a banned global', domainFile, 'const o = { Date: 1 }; o.Date = 2;'],
    [
      'render imports domain and pixi',
      'src/render/a.ts',
      "import { x } from '../domain/x'; import 'pixi.js';",
    ],
    ['render may use trigonometry', 'src/render/a.ts', 'const d = Math.sin(a);'],
    [
      'app imports every layer',
      'src/main.ts',
      "import { x } from './render/x'; import { y } from './domain/y';",
    ],
  ];

  it.each(allowed)('accepts: %s', (_name, file, code) => {
    expect(findViolations(file, code)).toEqual([]);
  });
});
