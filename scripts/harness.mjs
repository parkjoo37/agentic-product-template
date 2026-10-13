#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOLEAN_FLAGS = new Set(['--force', '--dry-run', '--with-ci', '--prune', '--help']);
const VALUE_FLAGS = new Set(['--profile', '--target']);
// 서비스가 채우는 파일. 없을 때만 복사하고 sync로 덮어쓰지 않는다.
const SEED_FILES = new Set(['docs/harness/model-routing.md']);

function parseArgs(argv) {
  const args = { _: [], unknown: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (VALUE_FLAGS.has(token)) {
      args[token.slice(2)] = argv[i + 1];
      i += 1;
    } else if (BOOLEAN_FLAGS.has(token)) {
      args[token.slice(2)] = true;
    } else if (token.startsWith('-')) {
      args.unknown.push(token);
    } else {
      args._.push(token);
    }
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function profiles() {
  const dir = path.join(templateRoot, 'profiles');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'rules')))
    .map((entry) => entry.name)
    .sort();
}

function help() {
  console.log(`사용법
  node scripts/harness.mjs init --profile <name> [--target <dir>] [--with-ci] [--force] [--dry-run]
  node scripts/harness.mjs sync [--target <dir>] [--prune] [--dry-run]

프로필: ${profiles().join(', ')}

init   서비스 저장소에 공통 워크플로우와 선택한 프로필을 복사한다.
sync   설치된 프로필로 하네스 파일을 템플릿 원본으로 갱신한다.
       model-routing.md 와 CI 파일처럼 서비스가 고치는 파일은 덮어쓰지 않는다.
--with-ci  프로필의 files/ 를 저장소 루트에 복사한다. 설치 기록에 남아 sync 에도 적용된다.
--prune    템플릿에서 빠진 관리 파일을 지운다. 없으면 목록만 출력한다.`);
}

function toRel(target, dest) {
  return path.relative(target, dest).split(path.sep).join('/');
}

function copyTree(srcDir, destDir, state, { seed = false } = {}) {
  for (const file of walk(srcDir)) {
    const dest = path.join(destDir, path.relative(srcDir, file));
    const rel = toRel(state.target, dest);
    const isSeed = seed || SEED_FILES.has(rel);
    state.managed.add(rel);
    if (isSeed) state.seeds.add(rel);
    const exists = fs.existsSync(dest);
    let action = 'add';
    if (exists && isSeed) action = 'keep';
    else if (exists) action = state.overwrite ? 'update' : 'skip';
    console.log(`${state.dryRun ? '(dry-run) ' : ''}${action} ${rel}`);
    if (state.dryRun || action === 'keep' || action === 'skip') continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    if (dest.endsWith('.sh')) fs.chmodSync(dest, 0o755);
  }
}

function upsertAgents(state) {
  const block = fs.readFileSync(path.join(templateRoot, 'core', 'templates', 'AGENTS.section.md'), 'utf8').trim() + '\n';
  const dest = path.join(state.target, 'AGENTS.md');
  state.managed.add('AGENTS.md');
  const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
  const pattern = /<!-- apt-harness:start -->[\s\S]*?<!-- apt-harness:end -->\n?/;
  let next = null;
  if (current === null) next = block;
  else if (!pattern.test(current)) next = `${current.trimEnd()}\n\n${block}`;
  else if (state.overwrite) next = current.replace(pattern, block);
  const action = next === null ? 'skip' : current === null || !pattern.test(current) ? 'add' : 'update';
  console.log(`${state.dryRun ? '(dry-run) ' : ''}${action} AGENTS.md`);
  if (!state.dryRun && next !== null) fs.writeFileSync(dest, next);
}

function handleStale(previous, state, prune) {
  const target = state.target;
  const kept = [];
  for (const rel of previous) {
    if (state.managed.has(rel) || state.seeds.has(rel) || rel === 'AGENTS.md') continue;
    const abs = path.resolve(target, rel);
    if (!abs.startsWith(target + path.sep) || !fs.existsSync(abs)) continue;
    if (prune && !state.dryRun) {
      fs.rmSync(abs);
      console.log(`remove ${rel}`);
    } else {
      console.log(`${state.dryRun ? '(dry-run) ' : ''}stale ${rel}`);
      kept.push(rel);
    }
  }
  if (kept.length > 0 && !prune) {
    console.log(`템플릿에서 빠진 관리 파일 ${kept.length}개가 남아 있습니다. 지우려면 --prune 을 붙여 다시 실행하세요.`);
  }
  return kept;
}

function warnIgnoredCursor(target) {
  const file = path.join(target, '.gitignore');
  if (!fs.existsSync(file)) return;
  const ignored = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => /^\/?\.cursor(\/(\*\*?)?)?$/.test(line));
  if (ignored) {
    console.warn('경고: .gitignore 가 .cursor/ 를 제외합니다. Cloud Agent가 규칙과 훅을 보려면 .cursor/ 를 커밋해야 합니다.');
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (args.help || !command) {
    help();
    process.exit(args.help ? 0 : 1);
  }
  if (args.unknown.length > 0) fail(`알 수 없는 옵션: ${args.unknown.join(', ')}`);
  if (command !== 'init' && command !== 'sync') fail(`알 수 없는 명령: ${command}`);

  const target = path.resolve(args.target || process.cwd());
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) fail(`대상 디렉터리가 없습니다: ${target}`);
  if (target === templateRoot || fs.existsSync(path.join(target, '.cursor-plugin', 'marketplace.json'))) {
    fail('대상이 템플릿 저장소입니다. 서비스 저장소 경로를 --target 으로 지정하세요.');
  }

  const harnessFile = path.join(target, '.harness.json');
  const installed = fs.existsSync(harnessFile) ? JSON.parse(fs.readFileSync(harnessFile, 'utf8')) : null;
  if (command === 'init' && installed && !args.force) fail('이미 하네스가 설치되어 있습니다. 갱신하려면 sync 를 실행하세요.');
  if (command === 'sync' && !installed) fail('설치된 하네스가 없습니다. 먼저 init 을 실행하세요.');

  const profile = args.profile ?? (command === 'sync' ? installed.profile : undefined);
  const available = profiles();
  if (!profile || !available.includes(profile)) fail(`--profile 이 필요합니다. 가능한 값: ${available.join(', ')}`);
  if (command === 'sync' && profile !== installed.profile) {
    fail(`설치된 프로필은 ${installed.profile} 입니다. 프로필을 바꾸려면 init --force --profile ${profile} 를 실행하세요.`);
  }

  const withCi = Boolean(args['with-ci']) || Boolean(installed?.withCi);
  const state = {
    target,
    dryRun: Boolean(args['dry-run']),
    overwrite: command === 'sync' || Boolean(args.force),
    managed: new Set(),
    seeds: new Set(installed?.seedFiles ?? []),
  };

  const core = path.join(templateRoot, 'core');
  const profileDir = path.join(templateRoot, 'profiles', profile);
  const copies = [
    [path.join(core, 'rules'), path.join(target, '.cursor', 'rules')],
    [path.join(core, 'skills'), path.join(target, '.cursor', 'skills')],
    [path.join(core, 'agents'), path.join(target, '.cursor', 'agents')],
    [path.join(core, 'commands'), path.join(target, '.cursor', 'commands')],
    [path.join(core, 'cursor-hooks'), path.join(target, '.cursor')],
    [path.join(profileDir, 'rules'), path.join(target, '.cursor', 'rules')],
    [path.join(profileDir, 'skills'), path.join(target, '.cursor', 'skills')],
    [path.join(profileDir, 'agents'), path.join(target, '.cursor', 'agents')],
    [path.join(core, 'templates', 'docs', 'harness'), path.join(target, 'docs', 'harness')],
    [path.join(core, 'templates', 'lessons'), path.join(target, 'lessons')],
  ];
  for (const [src, dest] of copies) copyTree(src, dest, state);
  if (withCi) copyTree(path.join(profileDir, 'files'), target, state, { seed: true });
  upsertAgents(state);

  const stale = handleStale(installed?.managedFiles ?? [], state, Boolean(args.prune));
  warnIgnoredCursor(target);

  const version = fs.readFileSync(path.join(templateRoot, 'VERSION'), 'utf8').trim();
  const now = new Date().toISOString();
  const manifest = {
    name: 'agentic-product-template',
    version,
    profile,
    withCi,
    installedAt: installed?.installedAt ?? now,
    updatedAt: now,
    managedFiles: [...new Set([...state.managed, ...stale])].sort(),
    seedFiles: [...state.seeds].sort(),
  };
  if (state.dryRun) {
    console.log(`(dry-run) write .harness.json profile=${profile} version=${version}`);
    return;
  }
  fs.writeFileSync(harnessFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${command === 'sync' ? 'synced' : 'installed'} profile=${profile} version=${version} target=${target}`);
}

main();
