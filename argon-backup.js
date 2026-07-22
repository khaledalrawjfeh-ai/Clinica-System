/**
 * ====================================================================
 *  ARGON MEDICAL OS — Multi-Tenant Backup Engine v5.0
 *  نظام النسخ الاحتياطي متعدد العيادات (المستأجرين)
 * ====================================================================
 *
 *  WHAT'S NEW IN v5.0 (Integrated from v4.1)
 *  --------------------------------------------------------------
 *  - High-Frequency Timestamping: filenames now carry hour+minute
 *    (backup_YYYY-MM-DD_HH-mm.json), supporting multiple runs/day
 *    (e.g. 08:00 / 16:00 / 00:00 via Task Scheduler).
 *  - Rotation raised 30 -> 90 files per tenant (3 runs/day x 30 days)
 *    so the same ~30-day history window is preserved at the new frequency.
 *  - Smart Freeze (Disaster Circuit Breaker): if a tenant's freshly
 *    fetched data collapses in size (or is null) compared to its last
 *    healthy backup, the script REFUSES to save and REFUSES to rotate,
 *    freezing the last known-good backup in place until the database
 *    is restored and sizes look normal again.
 *  - Duplicate-write guard is now hash-based against the *last* backup
 *    file (not the same-named file), since filenames are no longer
 *    stable across runs on the same day. See note below.
 *
 *  WHAT CHANGED FROM v3.0 TO v4.1 (kept)
 *  --------------------------------------------------------------
 *  - Firebase Admin SDK export, per-tenant isolation, batch processing
 *    (CONCURRENCY = 5), resilient per-tenant error handling.
 *
 *  ⚠ COMPATIBILITY NOTE FOR argon-restore.js
 *  --------------------------------------------------------------
 *  Backup filenames are no longer `backup_YYYY-MM-DD.json` — they are
 *  now `backup_YYYY-MM-DD_HH-mm.json`. The restore script's current
 *  CLI contract (`node argon-restore.js "<ClinicID>" "<Date_YYYY-MM-DD>"`)
 *  will no longer find files by date alone. It needs to either accept
 *  an HH-mm argument, or list/pick the latest timestamp for a given
 *  date. This file does not touch argon-restore.js — flag this before
 *  relying on restore in production.
 *
 *  REQUIREMENTS
 *  --------------------------------------------------------------
 *  npm install firebase-admin
 *  Node.js >= 14
 * ====================================================================
 */

'use strict';

const { initializeApp, cert, getApps, getApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════
const SERVICE_ACCOUNT_PATH = process.env.ARGON_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
const DATABASE_URL = process.env.ARGON_DATABASE_URL || 'https://clinica-system-e71b9-default-rtdb.firebaseio.com';

const BACKUP_ROOT = path.join(__dirname, 'backups');
const SYSTEM_CORE_DIR = path.join(BACKUP_ROOT, 'system_core');

const SYSTEM_NODES_TO_EXPORT = ['clinic_auth_map'];
const CONCURRENCY = 5;

// Retention policy — shared by tenant dirs AND system_core, since both now
// accumulate timestamped files at the same run frequency.
// 3 runs/day x 30 days = 90 files keeps the same ~30-day visible history
// that existed at 30 files/1 run-per-day under v4.1.
const MAX_BACKUPS_PER_DIR = 90;

// ── Smart Freeze (Disaster Circuit Breaker) thresholds ──────────────────
// FREEZE_DROP_RATIO: incoming size <= this fraction of the last healthy
// backup's size is treated as probable accidental data loss (not a normal
// cleanup). 0.5 = a 50%+ drop trips the breaker.
const FREEZE_DROP_RATIO = 0.5;
// FREEZE_MIN_REFERENCE_BYTES: only apply the ratio rule if the *previous*
// backup was already this big. Protects small/young clinics from false
// positives when their tiny dataset naturally halves during routine cleanup.
// Does NOT gate the null/empty case below — that always freezes regardless
// of size, because Firebase RTDB returns `null` (never `{}`) for a path
// with no data, so null is an unambiguous "this clinic's data is gone" signal.
const FREEZE_MIN_REFERENCE_BYTES = 100 * 1024; // 100 KB

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

const RUN_STARTED_AT = new Date();
const TIMESTAMP_STR = formatTimestamp(RUN_STARTED_AT); // e.g. 2026-06-16_16-00

// ════════════════════════════════════════════════════════════════
// Firebase Initialization
// ════════════════════════════════════════════════════════════════
function initializeFirebase() {
  const resolvedPath = path.isAbsolute(SERVICE_ACCOUNT_PATH)
    ? SERVICE_ACCOUNT_PATH
    : path.resolve(process.cwd(), SERVICE_ACCOUNT_PATH);

  let serviceAccount;
  try {
    serviceAccount = require(resolvedPath);
  } catch (err) {
    throw new Error(
      `Unable to load service account key at "${resolvedPath}". ` +
        `Download it from Firebase Console -> Project Settings -> Service Accounts. (${err.message})`
    );
  }

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });

  return getDatabase();
}

// ════════════════════════════════════════════════════════════════
// Filesystem & Crypto Helpers
// ════════════════════════════════════════════════════════════════
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function sanitizeForFilesystem(id) {
  // Replace only invalid Windows filesystem characters, keeping Arabic and spaces safe!
  const safe = String(id).replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_');
  if (safe !== id) {
    console.warn(`[WARN] Clinic ID "${id}" contained unsafe characters; using "${safe}".`);
  }
  return safe;
}

function computeHash(payload) {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Finds the most recent backup file for a given prefix in a directory and
 * returns its size + content hash. This replaces the v4.1 approach of
 * checking a same-named `.sha256` sidecar — that only worked because
 * filenames were stable per-day. Now that every run gets a unique
 * timestamped filename, "the last backup" must be found by sorting,
 * not by guessing today's filename.
 *
 * This single lookup feeds BOTH the duplicate-write guard (unchanged data)
 * AND the Smart Freeze circuit breaker (collapsed data) — they're really
 * the same question asked in two directions: "is this new payload bigger,
 * equal, or smaller than what we already have?"
 */
async function getLastBackupInfo(dirPath, prefix) {
  try {
    const files = await fs.readdir(dirPath);
    const backups = files.filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort().reverse();
    if (backups.length === 0) return null;

    const fileName = backups[0];
    const filePath = path.join(dirPath, fileName);
    const [stats, hash] = await Promise.all([
      fs.stat(filePath),
      fs.readFile(filePath + '.sha256', 'utf8').then(h => h.trim()).catch(() => null),
    ]);

    return { fileName, filePath, bytes: stats.size, hash };
  } catch (e) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// Rotation Policy (Cleanup Old Backups)
// ════════════════════════════════════════════════════════════════
async function rotateDirectory(dirPath, prefix) {
  try {
    const files = await fs.readdir(dirPath);
    // Find backup json files matching prefix, sort newest first
    const backups = files.filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort().reverse();

    let deleted = 0;
    if (backups.length > MAX_BACKUPS_PER_DIR) {
      const toDelete = backups.slice(MAX_BACKUPS_PER_DIR);
      for (const file of toDelete) {
        const fp = path.join(dirPath, file);
        await fs.unlink(fp).catch(() => null);
        await fs.unlink(fp + '.sha256').catch(() => null);
        deleted++;
      }
    }
    return deleted;
  } catch (e) {
    console.warn(`[WARN] Failed to rotate directory ${dirPath}: ${e.message}`);
    return 0;
  }
}

// ════════════════════════════════════════════════════════════════
// Per-Clinic Export
// ════════════════════════════════════════════════════════════════
async function backupClinic(clinicId, clinicData) {
  try {
    const safeId = sanitizeForFilesystem(clinicId);
    const clinicDir = path.join(BACKUP_ROOT, safeId);
    await ensureDir(clinicDir);

    const isEmptyNow = clinicData === null || clinicData === undefined;
    const newPayload = isEmptyNow ? '' : JSON.stringify(clinicData, null, 2);
    const newBytes = Buffer.byteLength(newPayload, 'utf8');
    const newHash = isEmptyNow ? null : computeHash(newPayload);

    const lastBackup = await getLastBackupInfo(clinicDir, 'backup_');

    // ── Smart Freeze (Disaster Circuit Breaker) ────────────────────────
    // Math: freeze if EITHER
    //   (a) the incoming data is null/undefined (RTDB's "nothing here" signal), OR
    //   (b) newBytes <= lastBackup.bytes * FREEZE_DROP_RATIO  AND
    //       lastBackup.bytes > FREEZE_MIN_REFERENCE_BYTES
    // (b) is the >=50% collapse rule, gated by "the old backup actually
    // mattered" so we don't cry wolf over naturally small/young clinics.
    const lastWasSignificant = !!lastBackup && lastBackup.bytes > FREEZE_MIN_REFERENCE_BYTES;
    const collapsed = lastWasSignificant && newBytes <= lastBackup.bytes * FREEZE_DROP_RATIO;

    if (lastBackup && (isEmptyNow || collapsed)) {
      const lastKB = (lastBackup.bytes / 1024).toFixed(1);
      const newKB = (newBytes / 1024).toFixed(1);
      console.error(
        `🚨 CRITICAL DATA LOSS DETECTED FOR ${clinicId} - SMART FREEZE ACTIVATED ` +
        `(last healthy: ${lastKB} KB @ ${lastBackup.fileName} -> incoming: ${newKB} KB). ` +
        `Save SKIPPED. Rotation SKIPPED. Previous backups remain untouched.`
      );
      return { clinicId, status: 'frozen' };
    }

    if (isEmptyNow) {
      // No prior backup exists either — genuinely nothing to protect or save
      // (e.g. a brand-new tenant entry that hasn't been provisioned yet).
      console.warn(`[SKIP] Clinic "${clinicId}" has no data and no prior backup. Skipping.`);
      return { clinicId, status: 'skipped' };
    }

    // ── Duplicate-write guard ───────────────────────────────────────────
    // If this run's data hashes identically to the last saved backup,
    // skip writing a new (redundant) file entirely.
    if (lastBackup && lastBackup.hash === newHash) {
      console.log(`[OK] Clinic "${clinicId}" -> Unchanged since last backup (${lastBackup.fileName}). Skipped.`);
      return { clinicId, status: 'unchanged' };
    }

    const filePath = path.join(clinicDir, `backup_${TIMESTAMP_STR}.json`);
    await fs.writeFile(filePath, newPayload, 'utf8');
    await fs.writeFile(filePath + '.sha256', newHash, 'utf8');

    const deleted = await rotateDirectory(clinicDir, 'backup_');
    console.log(`[OK] Clinic "${clinicId}" -> Saved ${(newBytes / 1024).toFixed(1)} KB ${deleted > 0 ? `(Rotated: -${deleted})` : ''}`);

    return { clinicId, status: 'success' };
  } catch (err) {
    console.error(`[ERROR] Clinic "${clinicId}" backup failed: ${err.message}`);
    return { clinicId, status: 'failed', error: err.message };
  }
}

async function processInBatches(items, worker, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

// ════════════════════════════════════════════════════════════════
// System-level export
// ════════════════════════════════════════════════════════════════
async function backupSystemCore(db) {
  await ensureDir(SYSTEM_CORE_DIR);

  for (const nodeName of SYSTEM_NODES_TO_EXPORT) {
    try {
      const snapshot = await db.ref(nodeName).once('value');
      if (!snapshot.exists()) {
        console.warn(`[WARN] System node "${nodeName}" not found. Skipping.`);
        continue;
      }

      const prefix = `${nodeName}_`;
      const payload = JSON.stringify(snapshot.val(), null, 2);
      const newHash = computeHash(payload);
      const lastBackup = await getLastBackupInfo(SYSTEM_CORE_DIR, prefix);

      if (lastBackup && lastBackup.hash === newHash) {
        console.log(`[OK] System "${nodeName}" -> Unchanged since last backup. Skipped.`);
        continue;
      }

      const filePath = path.join(SYSTEM_CORE_DIR, `${prefix}${TIMESTAMP_STR}.json`);
      await fs.writeFile(filePath, payload, 'utf8');
      await fs.writeFile(filePath + '.sha256', newHash, 'utf8');

      const deleted = await rotateDirectory(SYSTEM_CORE_DIR, prefix);
      console.log(`[OK] System "${nodeName}" -> Saved ${(Buffer.byteLength(payload, 'utf8') / 1024).toFixed(1)} KB ${deleted > 0 ? `(Rotated: -${deleted})` : ''}`);
    } catch (err) {
      console.error(`[ERROR] System node "${nodeName}" backup failed: ${err.message}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// Run manifest
// ════════════════════════════════════════════════════════════════
async function writeManifest(summary, durationMs) {
  const manifest = {
    runStartedAt: RUN_STARTED_AT.toISOString(),
    runFinishedAt: new Date().toISOString(),
    durationMs,
    clinicsTotal: summary.results.length,
    clinicsSucceeded: summary.success,
    clinicsUnchanged: summary.unchanged,
    clinicsSkipped: summary.skipped,
    clinicsFrozen: summary.frozen, // Smart Freeze events — needs human review
    clinicsFailed: summary.failed,
    failures: summary.results.filter(r => r.status === 'failed'),
    frozenTenants: summary.results.filter(r => r.status === 'frozen').map(r => r.clinicId),
  };

  const manifestPath = path.join(SYSTEM_CORE_DIR, `backup_manifest_${TIMESTAMP_STR}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  await rotateDirectory(SYSTEM_CORE_DIR, 'backup_manifest_');
  console.log(`[INFO] Run manifest written -> ${path.relative(__dirname, manifestPath)}`);
}

// ════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════
async function main() {
  console.log('══════════════════════════════════════════');
  console.log(' ARGON BACKUP ENGINE v5.0 — Multi-Tenant Export + Smart Freeze');
  console.log(` Started: ${RUN_STARTED_AT.toISOString()} (run tag: ${TIMESTAMP_STR})`);
  console.log('══════════════════════════════════════════');

  let db;
  try {
    db = initializeFirebase();
  } catch (err) {
    console.error(`[FATAL] Firebase initialization failed: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const summary = { success: 0, unchanged: 0, skipped: 0, failed: 0, frozen: 0, results: [] };

  try {
    await ensureDir(BACKUP_ROOT);

    console.log('[INFO] Reading /clinics...');
    const clinicsSnapshot = await db.ref('clinics').once('value');
    const clinics = clinicsSnapshot.exists() ? clinicsSnapshot.val() : {};
    const clinicIds = Object.keys(clinics);
    console.log(`[INFO] Found ${clinicIds.length} registered clinic(s).`);

    summary.results = await processInBatches(clinicIds, id => backupClinic(id, clinics[id]), CONCURRENCY);
    for (const result of summary.results) {
      if (summary[result.status] !== undefined) {
        summary[result.status]++;
      }
    }

    console.log('[INFO] Backing up system_core nodes...');
    await backupSystemCore(db);

    const durationMs = Date.now() - RUN_STARTED_AT.getTime();
    await writeManifest(summary, durationMs);

    console.log('══════════════════════════════════════════');
    console.log(
      ` SUMMARY: ${summary.success} saved, ${summary.unchanged} unchanged, ` +
      `${summary.frozen} FROZEN (protected), ${summary.skipped} skipped, ${summary.failed} failed`
    );
    if (summary.frozen > 0) {
      console.log(` ⚠ ${summary.frozen} tenant(s) were frozen — investigate before next run: ` +
        summary.results.filter(r => r.status === 'frozen').map(r => r.clinicId).join(', '));
    }
    console.log(` Duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log('══════════════════════════════════════════');

    // Treat frozen tenants as alert-worthy, same as outright failures —
    // a Smart Freeze means a human needs to look at that clinic ASAP.
    process.exitCode = (summary.failed > 0 || summary.frozen > 0) ? 1 : 0;
  } catch (err) {
    console.error(`[FATAL] Backup run aborted: ${err.message}`);
    process.exitCode = 1;
  } finally {
    try {
      const apps = getApps();
      if (apps.length) {
        await deleteApp(getApp());
        console.log('[INFO] Firebase connection closed.');
      }
    } catch (closeErr) {
      console.error(`[WARN] Error while closing Firebase connection: ${closeErr.message}`);
    }
  }
}

main();
