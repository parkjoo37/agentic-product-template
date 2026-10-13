#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harnessScript = path.join(root, 'scripts', 'harness.mjs');
const hookScript = path.join(root, 'core', 'cursor-hooks', 'hooks', 'guard-shell.sh');
const AGENT_KEYS = new Set(['name', 'description', 'model', 'readonly', 'is_background']);

const failures = [];
const skipped = [];
const temps = [];
let count = 0;

function check(ok, message) {
  count += 1;
  if (!ok) failures.push(message);
  return ok;
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.DS_Store', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function listDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name !== '.DS_Store').map((name) => path.join(dir, name));
}

function frontmatter(file) {
  const match = read(file).match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (field) data[field[1]] = field[2].trim().replace(/^["']|["']$/g, '');
  }
  return data;
}

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function checkManifests(files) {
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      JSON.parse(read(file));
      check(true);
    } catch (error) {
      check(false, `${rel(file)}: JSON 파싱 실패 (${error.message})`);
    }
  }

  const version = read(path.join(root, 'VERSION')).trim();
  check(/^\d+\.\d+\.\d+$/.test(version), `VERSION ${version} 이 x.y.z 형식이 아니다`);

  const marketplace = JSON.parse(read(path.join(root, '.cursor-plugin', 'marketplace.json')));
  const pluginRoots = [];
  for (const entry of marketplace.plugins) {
    const pluginRoot = path.join(root, entry.source);
    const manifestFile = path.join(pluginRoot, '.cursor-plugin', 'plugin.json');
    if (!check(fs.existsSync(manifestFile), `marketplace: ${entry.source}/.cursor-plugin/plugin.json 이 없다`)) continue;
    const manifest = JSON.parse(read(manifestFile));
    check(manifest.name === entry.name, `marketplace: ${entry.name} 과 plugin.json name ${manifest.name} 이 다르다`);
    check(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(manifest.name ?? ''), `${rel(manifestFile)}: name 이 kebab-case 가 아니다`);
    pluginRoots.push(pluginRoot);
  }
  for (const file of files.filter((f) => f.endsWith(`${path.sep}.cursor-plugin${path.sep}plugin.json`))) {
    const manifest = JSON.parse(read(file));
    check(pluginRoots.includes(path.dirname(path.dirname(file))), `${rel(file)}: marketplace.json 에 없는 플러그인이다`);
    check(manifest.version === version, `${rel(file)}: version ${manifest.version} 이 VERSION ${version} 과 다르다`);
  }
  return { version, pluginRoots };
}

function checkComponents(pluginRoots) {
  const known = new Set(pluginRoots.map((dir) => JSON.parse(read(path.join(dir, '.cursor-plugin', 'plugin.json'))).name));
  const componentRoots = [path.join(root, 'core'), ...listDir(path.join(root, 'profiles'))];

  const ruleFiles = [...componentRoots.map((dir) => path.join(dir, 'rules')), path.join(root, '.cursor', 'rules')]
    .flatMap(listDir);
  for (const file of ruleFiles) {
    check(file.endsWith('.mdc'), `${rel(file)}: 규칙 파일은 .mdc 여야 한다`);
    const fm = frontmatter(file);
    if (!check(fm !== null, `${rel(file)}: frontmatter 가 없다`)) continue;
    check(Boolean(fm.description), `${rel(file)}: description 이 없다`);
    check(['true', 'false'].includes(fm.alwaysApply), `${rel(file)}: alwaysApply 는 true 또는 false 여야 한다`);
    check(!/\{[^}]*,[^}]*\}/.test(fm.globs ?? ''), `${rel(file)}: globs 에 중괄호 확장을 쓰지 않는다. 쉼표로 나눈다`);
    const lines = read(file).trimEnd().split('\n').length;
    check(lines <= 50, `${rel(file)}: ${lines}줄로 50줄을 넘는다`);
    known.add(path.basename(file, '.mdc'));
  }

  for (const dir of componentRoots.flatMap((r) => listDir(path.join(r, 'skills')))) {
    const file = path.join(dir, 'SKILL.md');
    if (!check(fs.existsSync(file), `${rel(dir)}: SKILL.md 가 없다`)) continue;
    const fm = frontmatter(file) ?? {};
    const name = path.basename(dir);
    check(fm.name === name, `${rel(file)}: name ${fm.name} 이 폴더 이름 ${name} 과 다르다`);
    check(/^[a-z0-9-]{1,64}$/.test(fm.name ?? ''), `${rel(file)}: name 은 소문자, 숫자, 하이픈 64자 이내다`);
    check(Boolean(fm.description) && fm.description.length <= 1024, `${rel(file)}: description 이 비었거나 1024자를 넘는다`);
    known.add(name);
  }

  for (const kind of ['agents', 'commands']) {
    for (const file of componentRoots.flatMap((r) => listDir(path.join(r, kind)))) {
      const fm = frontmatter(file) ?? {};
      const name = path.basename(file, '.md');
      check(fm.name === name, `${rel(file)}: name ${fm.name} 이 파일 이름 ${name} 과 다르다`);
      check(Boolean(fm.description), `${rel(file)}: description 이 없다`);
      if (kind === 'agents') {
        const extra = Object.keys(fm).filter((key) => !AGENT_KEYS.has(key));
        check(extra.length === 0, `${rel(file)}: Cursor 에이전트가 지원하지 않는 키 ${extra.join(', ')}`);
      }
      known.add(name);
    }
  }
  return known;
}

function checkReferences(files, known) {
  for (const file of files.filter((f) => /\.(md|mdc)$/.test(f))) {
    const text = read(file);
    for (const [, token] of text.matchAll(/`(apt-[a-z0-9-]+)`/g)) {
      check(known.has(token), `${rel(file)}: \`${token}\` 에 해당하는 규칙, 스킬, 에이전트, 플러그인이 없다`);
    }
    for (const [, token] of text.matchAll(/`((?:docs\/harness|lessons)(?:\/[^`\s]*)?)`/g)) {
      if (/[<*]|YYYY/.test(token)) continue;
      check(fs.existsSync(path.join(root, 'core', 'templates', token)), `${rel(file)}: \`${token}\` 이 core/templates 에 없다`);
    }
  }
}

function runHook(payload, env = process.env) {
  const result = spawnSync(hookScript, [], { input: JSON.stringify(payload), encoding: 'utf8', env });
  try {
    return JSON.parse(result.stdout).permission;
  } catch {
    return `invalid(${result.status}: ${(result.stdout ?? '').trim() || (result.stderr ?? '').trim()})`;
  }
}

function checkHook() {
  check((fs.statSync(hookScript).mode & 0o111) !== 0, 'guard-shell.sh 에 실행 권한이 없다');
  const hooksFile = path.join(root, 'core', 'cursor-hooks', 'hooks.json');
  for (const definitions of Object.values(JSON.parse(read(hooksFile)).hooks)) {
    for (const { command } of definitions) {
      const script = path.join(root, 'core', 'cursor-hooks', command.replace(/^\.cursor\//, ''));
      check(fs.existsSync(script), `hooks.json: ${command} 가 core/cursor-hooks 에 없다`);
    }
  }

  const outside = tempDir('apt-hook-');
  const cases = [
    ['deny', 'rm -rf /'],
    ['deny', 'rm -rf /*'],
    ['deny', 'rm -rf ~'],
    ['deny', 'rm -rf $HOME'],
    ['deny', 'rm -rf ~/Documents'],
    ['deny', 'rm -rf .'],
    ['deny', 'rm -rf ..'],
    ['deny', 'rm -rf *'],
    ['deny', 'rm -rf src'],
    ['deny', 'rm -rf ./app/'],
    ['deny', 'rm -r -f lib'],
    ['deny', 'rm --recursive --force test'],
    ['deny', 'rm -r src'],
    ['deny', 'rm -rf "src"'],
    ['deny', 'npm run build && rm -rf .git'],
    ['deny', 'echo $(rm -rf src)'],
    ['deny', 'sudo rm -f /etc/hosts'],
    ['deny', 'git push --force origin feature'],
    ['deny', 'git push -f'],
    ['deny', 'git push origin +feature'],
    ['ask', 'git push --force-with-lease origin feature'],
    ['ask', 'git push origin main'],
    ['ask', 'git push origin HEAD:master'],
    ['ask', 'git push --all origin'],
    ['ask', 'git push'],
    ['ask', 'git reset --hard HEAD~1'],
    ['ask', 'git clean -fd'],
    ['ask', 'gh pr merge 12 --squash'],
    ['allow', 'git push -u origin feature/parking-report'],
    ['allow', 'git status'],
    ['allow', 'npm test'],
    ['allow', 'rm -rf node_modules .next'],
    ['allow', 'rm -rf src/components/legacy'],
    ['allow', 'rm -f src/app/page.test.tsx'],
    ['allow', 'git clean -n'],
    ['allow', 'git commit -m "add report"'],
  ];
  for (const [expected, command] of cases) {
    const actual = runHook({ command, cwd: outside });
    check(actual === expected, `훅: "${command}" 는 ${expected} 여야 하는데 ${actual}`);
  }

  const parse = spawnSync(hookScript, [], { input: 'not json', encoding: 'utf8' });
  check(/"permission":\s*"ask"/.test(parse.stdout ?? ''), '훅: 읽을 수 없는 입력은 ask 여야 한다');

  const noParser = tempDir('apt-path-');
  const blind = runHook({ command: 'git status', cwd: outside }, { ...process.env, PATH: noParser });
  check(blind === 'ask', `훅: JSON 파서가 없을 때는 ask 여야 하는데 ${blind}`);

  const nodeOnly = tempDir('apt-node-');
  fs.symlinkSync(process.execPath, path.join(nodeOnly, 'node'));
  const nodeEnv = { ...process.env, PATH: nodeOnly };
  check(runHook({ command: 'git status', cwd: outside }, nodeEnv) === 'allow', '훅: jq 없이 node 로 읽으면 git status 는 allow 여야 한다');
  check(runHook({ command: 'rm -rf src', cwd: outside }, nodeEnv) === 'deny', '훅: jq 없이 node 로 읽어도 rm -rf src 는 deny 여야 한다');

  const fakeBin = tempDir('apt-fakegit-');
  fs.writeFileSync(path.join(fakeBin, 'git'), '#!/bin/sh\n[ -n "$FAKE_GIT_BRANCH" ] || exit 1\nprintf \'%s\\n\' "$FAKE_GIT_BRANCH"\n', { mode: 0o755 });
  const onBranch = (branch) => ({ ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, FAKE_GIT_BRANCH: branch });
  const branchCases = [
    ['main', 'git push', 'ask'],
    ['main', 'git push origin HEAD', 'ask'],
    ['main', 'git commit -m x', 'ask'],
    ['main', 'git push -u origin feature/report', 'allow'],
    ['feature/report', 'git push', 'allow'],
    ['feature/report', 'git commit -m x', 'allow'],
    ['', 'git push', 'ask'],
  ];
  for (const [branch, command, expected] of branchCases) {
    const actual = runHook({ command, cwd: outside }, onBranch(branch));
    check(actual === expected, `훅: 브랜치 "${branch}" 에서 "${command}" 는 ${expected} 여야 하는데 ${actual}`);
  }

  if (spawnSync('git', ['--version']).status !== 0) {
    skipped.push('실제 git 저장소에서의 브랜치 판별. 이 환경에서 git 을 실행할 수 없다');
    return;
  }
  const repo = tempDir('apt-repo-');
  spawnSync('git', ['init', '-q', repo]);
  spawnSync('git', ['-C', repo, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  check(runHook({ command: 'git push', cwd: repo }) === 'ask', '훅: main 에서 refspec 없는 push 는 ask 여야 한다');
  check(runHook({ command: 'git commit -m x', cwd: repo }) === 'ask', '훅: main 에서 commit 은 ask 여야 한다');
  spawnSync('git', ['-C', repo, 'symbolic-ref', 'HEAD', 'refs/heads/feature/report']);
  check(runHook({ command: 'git push', cwd: repo }) === 'allow', '훅: 작업 브랜치에서 push 는 allow 여야 한다');
  check(runHook({ command: 'git commit -m x', cwd: repo }) === 'allow', '훅: 작업 브랜치에서 commit 은 allow 여야 한다');
}

function harness(...args) {
  return spawnSync(process.execPath, [harnessScript, ...args], { encoding: 'utf8' });
}

function checkInstall(version) {
  const work = tempDir('apt-install-');
  const service = path.join(work, 'service');
  fs.mkdirSync(service);
  fs.writeFileSync(path.join(service, '.gitignore'), 'node_modules\n.cursor/\n');
  fs.writeFileSync(path.join(service, 'AGENTS.md'), '# Service\n');

  let result = harness('init', '--profile', 'nextjs-web', '--target', service, '--with-ci');
  if (!check(result.status === 0, `init 실패: ${result.stderr.trim()}`)) return;
  const manifestFile = path.join(service, '.harness.json');
  const manifest = JSON.parse(read(manifestFile));
  check(manifest.version === version, `.harness.json version ${manifest.version} 이 ${version} 과 다르다`);
  check(manifest.withCi === true, '.harness.json 에 withCi 가 기록되지 않았다');
  for (const file of manifest.managedFiles) {
    check(fs.existsSync(path.join(service, file)), `init 후 ${file} 가 없다`);
  }
  check(`${result.stdout}${result.stderr}`.includes('.gitignore'), 'init 이 .cursor/ 를 제외하는 .gitignore 를 경고하지 않았다');
  const agents = read(path.join(service, 'AGENTS.md'));
  check(agents.startsWith('# Service') && agents.includes('apt-harness:start'), 'AGENTS.md 의 기존 내용이나 하네스 블록이 없다');
  const copiedHook = path.join(service, '.cursor', 'hooks', 'guard-shell.sh');
  check(fs.existsSync(copiedHook) && (fs.statSync(copiedHook).mode & 0o111) !== 0, '복사된 훅에 실행 권한이 없다');

  check(harness('init', '--profile', 'nextjs-web', '--target', service).status !== 0, '설치된 저장소에 init 이 다시 성공했다');

  const routing = path.join(service, 'docs', 'harness', 'model-routing.md');
  const ci = path.join(service, '.github', 'workflows', 'ci.yml');
  const rule = path.join(service, '.cursor', 'rules', 'apt-autonomy.mdc');
  const retired = path.join(service, '.cursor', 'rules', 'apt-retired.mdc');
  fs.appendFileSync(routing, '\nfilled-by-service\n');
  fs.appendFileSync(ci, '\n# custom-by-service\n');
  fs.appendFileSync(rule, '\nlocal-edit\n');
  fs.writeFileSync(retired, '---\ndescription: old\nalwaysApply: true\n---\n');
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, managedFiles: [...manifest.managedFiles, '.cursor/rules/apt-retired.mdc'] }));

  result = harness('sync', '--target', service);
  if (!check(result.status === 0, `프로필을 생략한 sync 실패: ${result.stderr.trim()}`)) return;
  check(read(routing).includes('filled-by-service'), 'sync 가 서비스에서 채운 model-routing.md 를 덮어썼다');
  check(read(ci).includes('custom-by-service'), 'sync 가 서비스에서 고친 CI 파일을 덮어썼다');
  check(!read(rule).includes('local-edit'), 'sync 가 관리 규칙을 템플릿 원본으로 갱신하지 않았다');
  check(fs.existsSync(retired) && result.stdout.includes('apt-retired.mdc'), 'sync 가 템플릿에서 빠진 파일을 알리지 않았다');
  check(JSON.parse(read(manifestFile)).withCi === true, 'sync 후 withCi 가 사라졌다');

  const legacySeed = path.join(service, 'docs', 'harness', 'legacy-notes.md');
  fs.writeFileSync(legacySeed, 'filled-by-service\n');
  const synced = JSON.parse(read(manifestFile));
  check(synced.seedFiles?.includes('docs/harness/model-routing.md'), '.harness.json seedFiles 에 model-routing.md 가 없다');
  fs.writeFileSync(manifestFile, JSON.stringify({
    ...synced,
    managedFiles: [...synced.managedFiles, 'docs/harness/legacy-notes.md'],
    seedFiles: [...(synced.seedFiles ?? []), 'docs/harness/legacy-notes.md'],
  }));
  result = harness('sync', '--target', service, '--prune');
  check(result.status === 0 && !fs.existsSync(retired), '--prune 이 템플릿에서 빠진 파일을 지우지 않았다');
  check(fs.existsSync(legacySeed), '--prune 이 서비스가 채운 seed 파일을 지웠다');

  check(harness('sync', '--profile', 'flutter', '--target', service).status !== 0, '설치된 프로필과 다른 sync 가 성공했다');
  check(harness('init', '--profile', 'nextjs-web', '--target', root).status !== 0, '템플릿 저장소 자체에 init 이 성공했다');
  check(harness('init', '--profile', 'nextjs-web', '--target', path.join(work, 'missing')).status !== 0, '없는 경로에 init 이 성공했다');
  const fresh = path.join(work, 'fresh');
  fs.mkdirSync(fresh);
  check(harness('init', '--profile', 'nextjs-web', '--target', fresh, '--with-cii').status !== 0, '알 수 없는 옵션을 무시하고 init 이 성공했다');
}

try {
  const files = walk(root);
  const { version, pluginRoots } = checkManifests(files);
  const known = checkComponents(pluginRoots);
  checkReferences(files, known);
  checkHook();
  checkInstall(version);
} finally {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
}

for (const item of skipped) console.log(`SKIP ${item}`);
if (failures.length > 0) {
  for (const item of failures) console.error(`FAIL ${item}`);
  console.error(`${count}개 중 ${failures.length}개 실패`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${count}개 확인`);
}
