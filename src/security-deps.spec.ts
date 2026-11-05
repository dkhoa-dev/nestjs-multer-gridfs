import { readFileSync } from 'fs';
import { join } from 'path';
import * as semver from 'semver';

// Every installed copy of a package must be at or above the first version
// that fixes the advisories this repo has cleared. `line` is a semver range
// for one release line, for packages that ship fixes on more than one line.
// A package with lined floors must cover every copy: a copy on no listed
// line is reported, so a new line has to be checked before it can pass.
type Floor = { pkg: string; min: string; line?: string; advisory: string };
type LockPackages = Record<string, { version?: string }>;

const floors: Floor[] = [
  {
    pkg: 'lodash',
    min: '4.18.1',
    advisory: 'GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh',
  },
  {
    pkg: 'mongoose',
    min: '6.13.6',
    line: '<7.0.0-0',
    advisory: 'GHSA-vg7j-7cwx-8wgw',
  },
  {
    pkg: 'mongoose',
    min: '7.8.4',
    line: '>=7.0.0-0 <8.0.0-0',
    advisory: 'GHSA-vg7j-7cwx-8wgw',
  },
  {
    pkg: 'mongoose',
    min: '8.9.5',
    line: '>=8.0.0-0',
    advisory: 'GHSA-vg7j-7cwx-8wgw',
  },
  { pkg: 'proxy-addr', min: '2.0.8', advisory: 'GHSA-jqcg-44mw-7w3h' },
  {
    pkg: 'body-parser',
    min: '1.20.9',
    line: '<2.0.0-0',
    advisory: 'GHSA-27r3-jxmh-p828',
  },
  {
    pkg: 'body-parser',
    min: '2.4.0',
    line: '>=2.0.0-0',
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
    line: '<0.2.0-0',
    advisory: 'GHSA-37ch-88jc-xwx2, GHSA-rhx6-c78j-4q9w, GHSA-9wv6-86v2-598j',
  },
  {
    pkg: 'path-to-regexp',
    min: '1.9.0',
    line: '>=0.2.0-0 <2.0.0-0',
    advisory: 'GHSA-9wv6-86v2-598j',
  },
  {
    pkg: 'path-to-regexp',
    min: '3.3.0',
    line: '>=2.0.0-0 <4.0.0-0',
    advisory: 'GHSA-9wv6-86v2-598j',
  },
  {
    pkg: 'path-to-regexp',
    min: '6.3.0',
    line: '>=4.0.0-0 <7.0.0-0',
    advisory: 'GHSA-9wv6-86v2-598j',
  },
  {
    pkg: 'path-to-regexp',
    min: '8.4.0',
    line: '>=7.0.0-0',
    advisory: 'GHSA-9wv6-86v2-598j, GHSA-27v5-c462-wpq7, GHSA-j3q9-mxjg-w52f',
  },
  { pkg: 'qs', min: '6.16.1', advisory: 'GHSA-6pq8-jhm2-2vcw' },
  { pkg: '@nestjs/core', min: '11.1.18', advisory: 'GHSA-36xv-jgw5-4q75' },
  {
    pkg: '@nestjs/common',
    min: '10.4.16',
    line: '<11.0.0-0',
    advisory: 'GHSA-cj7v-w2c7-cp7c',
  },
  {
    pkg: '@nestjs/common',
    min: '11.0.16',
    line: '>=11.0.0-0',
    advisory: 'GHSA-cj7v-w2c7-cp7c',
  },
];

const lock = JSON.parse(
  readFileSync(join(__dirname, '..', 'package-lock.json'), 'utf8'),
) as { packages: LockPackages };

function installed(
  packages: LockPackages,
  pkg: string,
): { path: string; version: string }[] {
  return Object.entries(packages)
    .filter(
      ([path]) =>
        path === `node_modules/${pkg}` || path.endsWith(`/node_modules/${pkg}`),
    )
    .map(([path, meta]) => ({ path, version: meta.version ?? '0.0.0' }));
}

// Full semver comparison: a prerelease sorts below its release, so
// 4.18.1-beta.0 is below a 4.18.1 floor.
function below(version: string, min: string): boolean {
  return semver.lt(version, min);
}

function onLine(version: string, line?: string): boolean {
  return !line || semver.satisfies(version, line, { includePrerelease: true });
}

// Copies of `pkg` that are below the floor of their release line, or that
// sit on no release line the floors list.
function violations(
  table: Floor[],
  packages: LockPackages,
  pkg: string,
): string[] {
  const own = table.filter((f) => f.pkg === pkg);
  return installed(packages, pkg)
    .filter((c) => {
      const lines = own.filter((f) => onLine(c.version, f.line));
      return lines.length === 0 || lines.some((f) => below(c.version, f.min));
    })
    .map((c) => `${c.path}@${c.version}`);
}

describe('patched dependency floors (package-lock.json)', () => {
  const pkgs = [...new Set(floors.map((f) => f.pkg))];

  it.each(pkgs)('%s is installed and at or above its floors', (pkg) => {
    expect(installed(lock.packages, pkg).length).toBeGreaterThan(0);
    expect(violations(floors, lock.packages, pkg)).toEqual([]);
  });
});

describe('floor check', () => {
  const at = (path: string, version: string): LockPackages => ({
    [path]: { version },
  });

  it('reports a vulnerable path-to-regexp copy on a non-0.x line', () => {
    const packages = {
      ...at('node_modules/path-to-regexp', '0.1.13'),
      ...at('node_modules/router/node_modules/path-to-regexp', '8.3.0'),
      ...at('node_modules/a/node_modules/path-to-regexp', '1.8.0'),
      ...at('node_modules/b/node_modules/path-to-regexp', '6.2.2'),
      ...at('node_modules/c/node_modules/path-to-regexp', '3.2.0'),
    };
    expect(violations(floors, packages, 'path-to-regexp')).toEqual([
      'node_modules/router/node_modules/path-to-regexp@8.3.0',
      'node_modules/a/node_modules/path-to-regexp@1.8.0',
      'node_modules/b/node_modules/path-to-regexp@6.2.2',
      'node_modules/c/node_modules/path-to-regexp@3.2.0',
    ]);
  });

  it('passes patched path-to-regexp copies on every line', () => {
    const packages = {
      ...at('node_modules/path-to-regexp', '0.1.13'),
      ...at('node_modules/a/node_modules/path-to-regexp', '1.9.0'),
      ...at('node_modules/b/node_modules/path-to-regexp', '3.3.0'),
      ...at('node_modules/c/node_modules/path-to-regexp', '6.3.0'),
      ...at('node_modules/d/node_modules/path-to-regexp', '8.4.2'),
    };
    expect(violations(floors, packages, 'path-to-regexp')).toEqual([]);
  });

  it('passes a prerelease above the floor of its line', () => {
    expect(
      violations(
        floors,
        at('node_modules/path-to-regexp', '8.5.0-beta.0'),
        'path-to-regexp',
      ),
    ).toEqual([]);
  });

  it('reports a copy that sits on no listed release line', () => {
    const table: Floor[] = [
      { pkg: 'x', min: '1.2.0', line: '1.x', advisory: 'test' },
    ];
    expect(violations(table, at('node_modules/x', '2.0.0'), 'x')).toEqual([
      'node_modules/x@2.0.0',
    ]);
  });

  it('reports a prerelease of the floor version', () => {
    expect(
      violations(floors, at('node_modules/lodash', '4.18.1-beta.0'), 'lodash'),
    ).toEqual(['node_modules/lodash@4.18.1-beta.0']);
  });

  it('reports lodash 4.18.0', () => {
    expect(
      violations(floors, at('node_modules/lodash', '4.18.0'), 'lodash'),
    ).toEqual(['node_modules/lodash@4.18.0']);
  });
});
