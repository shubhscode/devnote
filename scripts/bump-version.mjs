// One-command release bump: `pnpm release 0.0.2`.
// Bumps all six version files, commits, tags. Push + changelog stay manual.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim();

const version = process.argv[2] ?? '';
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: pnpm release <version>   (e.g. pnpm release 0.0.2, no leading v)');
  process.exit(1);
}
if (run('git', ['status', '--porcelain']) !== '') {
  console.error('worktree dirty — commit or stash first. No files touched.');
  process.exit(1);
}

const jsonFiles = ['package.json', 'apps/web/package.json', 'apps/desktop/package.json', 'apps/desktop/src-tauri/tauri.conf.json'];
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// All files must agree before bump — catches partial-drift.
const current = new Set(jsonFiles.map((f) => String(readJson(f).version)));
const cargo = readFileSync(join(ROOT, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
const cargoVer = cargo.match(/^version = "([^"]+)"/m)?.[1];
const ts = readFileSync(join(ROOT, 'apps/web/src/lib/version.ts'), 'utf8');
const tsVer = ts.match(/APP_VERSION = '([^']+)'/)?.[1];
if (cargoVer) current.add(cargoVer);
if (tsVer) current.add(tsVer);
if (current.size !== 1) {
  console.error(`version drift detected: ${[...current].join(', ')}. Fix by hand first.`);
  process.exit(1);
}

for (const f of jsonFiles) {
  const p = join(ROOT, f);
  const data = JSON.parse(readFileSync(p, 'utf8'));
  data.version = version;
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}
writeFileSync(
  join(ROOT, 'apps/desktop/src-tauri/Cargo.toml'),
  cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`),
);
writeFileSync(
  join(ROOT, 'apps/web/src/lib/version.ts'),
  ts.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`),
);

const files = [...jsonFiles, 'apps/desktop/src-tauri/Cargo.toml', 'apps/web/src/lib/version.ts', 'pnpm-lock.yaml', 'apps/desktop/src-tauri/Cargo.lock'];
run('git', ['add', ...files]);
run('git', ['commit', '-m', `release: v${version}`]);
run('git', ['tag', `v${version}`]);
console.log(`tagged v${version}. Next: changelog entry, git push --follow-tags, GH release.`);
