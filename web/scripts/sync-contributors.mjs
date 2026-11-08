// Avatars are inlined so the app makes no runtime call to GitHub, as the privacy copy promises.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg } from './lib/args.mjs';
import { writeDataManifest } from './lib/dataManifest.mjs';

const DATA_DIR = fileURLToPath(new URL('../public/data', import.meta.url));
const OUT = join(DATA_DIR, 'contributors.generated.json');
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function resolveRepo() {
  const repo = arg('repo');
  if (repo) return repo;
  const url = PKG.repository?.url ?? '';
  const m = url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`Cannot derive owner/repo from package.json repository.url ("${url}"); pass --repo`);
  return m[1];
}

const REPO = resolveRepo();
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': `${PKG.name}-sync-contributors`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const hint = res.status === 403 && !TOKEN ? ' (rate limited, set GITHUB_TOKEN)' : '';
    throw new Error(`GET ${path} → HTTP ${res.status}${hint}`);
  }
  return res.json();
}

async function inlineAvatar(url) {
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}s=64`, {
      headers: { 'User-Agent': headers['User-Agent'] },
    });
    if (!res.ok) return undefined;
    const type = res.headers.get('content-type') || 'image/png';
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return `data:${type};base64,${b64}`;
  } catch {
    return undefined;
  }
}

const raw = [];
for (let page = 1; page <= 10; page++) {
  const batch = await api(`/repos/${REPO}/contributors?per_page=100&page=${page}`);
  raw.push(...batch);
  if (batch.length < 100) break;
}

const people = raw
  .filter((c) => c.type !== 'Bot' && !/\[bot\]$/.test(c.login))
  .sort((a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login));

const contributors = [];
for (const c of people) {
  contributors.push({
    login: c.login,
    url: c.html_url,
    contributions: c.contributions,
    avatar: await inlineAvatar(c.avatar_url),
  });
}

// The manifest hashes the whole file, so a new stamp would make every browser re-download it.
let generated = new Date().toISOString();
try {
  const prev = JSON.parse(readFileSync(OUT, 'utf8'));
  if (prev.repo === REPO && JSON.stringify(prev.contributors) === JSON.stringify(contributors)) {
    generated = prev.generated;
  }
} catch {
  // No readable previous list.
}
writeFileSync(OUT, JSON.stringify({ generated, repo: REPO, contributors }) + '\n');
writeDataManifest(DATA_DIR);
console.log(
  `Wrote ${contributors.length} contributors → public/data/contributors.generated.json`,
  contributors.map((c) => c.login).join(', '),
);
