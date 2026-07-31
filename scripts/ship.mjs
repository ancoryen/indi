// Indizilla Research — one-shot deploy.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-ant-... node scripts/ship.mjs
//
// Does everything that can be automated:
//   1. applies supabase/migration.sql          (Management API)
//   2. sets ANTHROPIC_API_KEY as a project secret
//   3. deploys the research Edge Function      (Supabase CLI)
//   4. verifies all three landed
//
// Secrets are read from the environment and never printed or written to disk.
// Safe to re-run: the migration is idempotent, the secret is upserted, the
// function redeploys in place.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.env.SUPABASE_PROJECT_REF || 'iykuvppjmmatsvrrtwra';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const API = 'https://api.supabase.com/v1';

const ok = (s) => console.log('  ✓ ' + s);
const bad = (s) => console.log('  ✗ ' + s);
const step = (n, s) => console.log('\n[' + n + '/4] ' + s);
let failed = false;

// process.exit() with a pending fetch handle trips a libuv assertion on
// Windows, which reads like a crash to whoever is running this. Set the exit
// code and unwind instead.
function die(msg, hint) {
  console.error('\nSTOPPED: ' + msg);
  if (hint) console.error(hint);
  process.exitCode = 1;
  throw new Error('__halt__');
}

try {

if (!TOKEN) {
  die('SUPABASE_ACCESS_TOKEN is not set.',
      'Create one at https://supabase.com/dashboard/account/tokens then re-run:\n' +
      '  SUPABASE_ACCESS_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-ant-... node scripts/ship.mjs');
}
if (!ANTHROPIC) {
  die('ANTHROPIC_API_KEY is not set.',
      'Create one at https://console.anthropic.com/settings/keys (set a spend limit), then re-run.');
}
if (!/^sbp_/.test(TOKEN)) console.log('note: access token does not start with sbp_ — continuing anyway.');
if (!/^sk-ant-/.test(ANTHROPIC)) console.log('note: Anthropic key does not start with sk-ant- — continuing anyway.');

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === 'object' && body ? (body.message || JSON.stringify(body)) : String(body);
    throw new Error('HTTP ' + res.status + ' ' + path + ' — ' + String(msg).slice(0, 300));
  }
  return body;
}

const sql = (query) => api('/projects/' + REF + '/database/query', {
  method: 'POST', body: JSON.stringify({ query })
});

console.log('Indizilla Research — deploy');
console.log('project: ' + REF);

/* ------------------------------------------------- 0. confirm the token works */
try {
  const project = await api('/projects/' + REF);
  console.log('linked : ' + (project.name || REF) + '  (' + (project.region || '?') + ')');
} catch (e) {
  die('Could not reach the project with that access token.\n  ' + e.message,
      'Most likely the token belongs to a different Supabase account. This project is\n' +
      'under the account that owns ' + REF + ' — see docs/START-HERE.md section 3.');
}

/* --------------------------------------------------------- 1. the migration */
step(1, 'Applying supabase/migration.sql');
try {
  // Read as UTF-8 explicitly: the file has no BOM and contains rupee symbols,
  // and a default-encoding read mangles them.
  const migration = readFileSync(join(REPO, 'supabase/migration.sql'), 'utf8');
  await sql(migration);
  ok('migration applied (' + migration.split('\n').length + ' lines)');
} catch (e) {
  bad('migration failed — ' + e.message);
  failed = true;
}

/* ------------------------------------------------------------ 2. the secret */
step(2, 'Setting ANTHROPIC_API_KEY as a project secret');
try {
  await api('/projects/' + REF + '/secrets', {
    method: 'POST',
    body: JSON.stringify([{ name: 'ANTHROPIC_API_KEY', value: ANTHROPIC }])
  });
  const secrets = await api('/projects/' + REF + '/secrets');
  const present = (secrets || []).some((s) => s.name === 'ANTHROPIC_API_KEY');
  present ? ok('secret set and confirmed present') : bad('secret did not appear after setting');
  if (!present) failed = true;
} catch (e) {
  bad('could not set the secret — ' + e.message);
  failed = true;
}

/* ------------------------------------------------------ 3. the Edge Function */
step(3, 'Deploying the research Edge Function');
try {
  const out = execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', 'supabase', 'functions', 'deploy', 'research',
     '--project-ref', REF, '--no-verify-jwt'],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN } }
  );
  const tail = out.trim().split('\n').slice(-3).join(' | ');
  ok('deployed  ' + tail);
} catch (e) {
  const msg = (e.stderr || e.stdout || e.message || '').toString().trim().split('\n').slice(-6).join('\n    ');
  bad('deploy failed:\n    ' + msg);
  failed = true;
}

/* ---------------------------------------------------------------- 4. verify */
step(4, 'Verifying');
try {
  const fns = await api('/projects/' + REF + '/functions');
  const fn = (fns || []).find((f) => f.slug === 'research');
  fn ? ok('function live: status=' + fn.status + ' version=' + fn.version)
     : bad('function not listed');
  if (!fn) failed = true;
} catch (e) {
  bad('could not list functions — ' + e.message);
  failed = true;
}

try {
  const rows = await sql(
    "select routine_name from information_schema.routines " +
    "where routine_schema = 'public' and routine_name in " +
    "('fail_study','create_study','research_credit_balance','buy_research_credits') " +
    "order by routine_name;");
  const names = (rows || []).map((r) => r.routine_name);
  ['buy_research_credits', 'create_study', 'fail_study', 'research_credit_balance']
    .forEach((n) => names.includes(n) ? ok('rpc ' + n) : (bad('rpc ' + n + ' MISSING'), failed = true));
} catch (e) {
  bad('could not verify RPCs — ' + e.message);
  failed = true;
}

try {
  const tables = await sql(
    "select table_name from information_schema.tables where table_schema='public' " +
    "and table_name like 'research%' order by table_name;");
  ok('research tables: ' + (tables || []).map((t) => t.table_name).join(', '));
} catch (e) {
  bad('could not verify tables — ' + e.message);
}

console.log('\n' + '-'.repeat(60));
if (failed) {
  console.log('FINISHED WITH ERRORS — paste this output back and it can be fixed.');
  process.exitCode = 1;
} else {
  console.log('DONE. The live pipeline is deployed.');
  console.log('Next: sign in at https://indizilla.com/login.html and run one Quick Pulse study.');
}

} catch (e) {
  if (!/__halt__/.test((e && e.message) || '')) {
    console.error('\nUNEXPECTED: ' + ((e && e.message) || e));
    process.exitCode = 1;
  }
}
