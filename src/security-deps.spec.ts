import { readFileSync } from 'fs';
import { join } from 'path';

// Every installed copy of a package must be at or above the first version
// that fixes the advisories this repo has cleared. `line` limits a floor to
// one release line, for packages that ship fixes on more than one major.
type Floor = { pkg: string; min: string; line?: string; advisory: string };

const floors: Floor[] = [
  { pkg: 'lodash', min: '4.18.0', advisory: 'GHSA-r5fr-rjxr-66jc' },
  { pkg: 'mongoose', min: '8.9.5', line: '8', advisory: 'GHSA-vg7j-7cwx-8wgw' },
  { pkg: 'proxy-addr', min: '2.0.8', advisory: 'GHSA-jqcg-44mw-7w3h' },
  {
    pkg: 'body-parser',
    min: '1.20.9',
    line: '1',
    advisory: 'GHSA-27r3-jxmh-p828',
  },
  {
    pkg: 'body-parser',
    min: '2.4.0',
    line: '2',
    advisory: 'GHSA-27r3-jxmh-p828',
  },
  {
    pkg: 'multer',
    min: '2.5.0',
    advisory: 'GHSA-44fp-w29j-9vj5, GHSA-q7qp-rjg7-q26m',
  },
  {
    pkg: 'path-to-regexp',
    min: '0.1.13',
    line: '0',
    advisory: 'GHSA-37ch-88jc-xwx2',
  },
  { pkg: 'qs', min: '6.16.1', advisory: 'GHSA-6pq8-jhm2-2vcw' },
  { pkg: '@nestjs/core', min: '11.1.18', advisory: 'GHSA-36xv-jgw5-4q75' },
  {
    pkg: '@nestjs/common',
    min: '10.4.16',
    line: '10',
    advisory: 'GHSA-cj7v-w2c7-cp7c',
  },
  {
    pkg: '@nestjs/common',
    min: '11.0.16',
    line: '11',
    advisory: 'GHSA-cj7v-w2c7-cp7c',
  },
];

const lock = JSON.parse(
  readFileSync(join(__dirname, '..', 'package-lock.json'), 'utf8'),
) as { packages: Record<string, { version?: string }> };

function installed(pkg: string): { path: string; version: string }[] {
  return Object.entries(lock.packages)
    .filter(
      ([path]) =>
        path === `node_modules/${pkg}` || path.endsWith(`/node_modules/${pkg}`),
    )
    .map(([path, meta]) => ({ path, version: meta.version ?? '0.0.0' }));
}

function below(version: string, min: string): boolean {
  const a = version.split('-')[0].split('.').map(Number);
  const b = min.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

describe('patched dependency floors (package-lock.json)', () => {
  it.each(floors)('$pkg >= $min ($advisory)', ({ pkg, min, line }) => {
    const copies = installed(pkg);
    if (!line) expect(copies.length).toBeGreaterThan(0);
    const vulnerable = copies
      .filter((c) => !line || c.version.split('.')[0] === line)
      .filter((c) => below(c.version, min))
      .map((c) => `${c.path}@${c.version}`);
    expect(vulnerable).toEqual([]);
  });
});
