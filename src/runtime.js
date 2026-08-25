// =============================================================================
// runtime.js — resolves the WORKING DIRECTORY (the "config/state seam").
//
// The skill CODE lives in the synced skill package. The working STATE — vendors,
// settings, the append-only ledger, reports, PDF backups — lives OUTSIDE that,
// under the OneDrive `_AP Automation/` area on the client's Mac. Keeping them
// apart is what lets us ship a frozen engine while state grows per-install, and
// keeps secrets/state out of the synced skill folder.
//
// The ap-setup skill writes the working-dir path in ONE of two ways (checked in
// this order):
//   1. env AP_WORK_DIR=/Users/.../OneDrive/.../_AP Automation
//   2. a file src/runtime-path.json  ->  { "workDir": "/Users/.../_AP Automation" }
//
// For the mock demo neither is set, so we fall back to ./data (repo-local),
// which is fine because the demo writes only throwaway state.
// =============================================================================

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, isAbsolute, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)); // .../src/
const REPO_ROOT = resolvePath(HERE, '..');

function readRuntimePathFile() {
  const p = join(HERE, 'runtime-path.json');
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return j.workDir || null;
  } catch {
    return null;
  }
}

// The resolved working directory. Absolute. Created if missing.
export function workDir() {
  const fromEnv = process.env.AP_WORK_DIR && process.env.AP_WORK_DIR.trim();
  const fromFile = readRuntimePathFile();
  const chosen = fromEnv || fromFile || join(REPO_ROOT, 'data', 'work'); // demo fallback
  const abs = isAbsolute(chosen) ? chosen : resolvePath(REPO_ROOT, chosen);
  mkdirSync(abs, { recursive: true });
  return abs;
}

// Convenience paths under the working dir. Directories are created lazily by
// the writers that use them (ledger.js, report.js), not here.
export function paths() {
  const dir = workDir();
  return {
    workDir: dir,
    ledger: join(dir, 'ledger.jsonl'),
    settings: join(dir, 'settings.json'),
    vendors: join(dir, 'vendors.json'),
    reportsDir: join(dir, 'reports'),
    pdfBackupsDir: join(dir, 'pdf-backups'),
  };
}

// Whether a real working dir was configured (vs. the demo fallback). The
// operational skill uses this to refuse to run "for real" until setup has run.
export function isConfigured() {
  return Boolean(
    (process.env.AP_WORK_DIR && process.env.AP_WORK_DIR.trim()) || readRuntimePathFile()
  );
}
