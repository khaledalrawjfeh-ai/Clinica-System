'use strict';

const { initializeApp, cert, getApps, getApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs/promises');
const path = require('path');
const readline = require('readline');

// ════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════
const SERVICE_ACCOUNT_PATH = process.env.ARGON_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
const DATABASE_URL = process.env.ARGON_DATABASE_URL || 'https://clinica-system-e71b9-default-rtdb.firebaseio.com';
const BACKUP_ROOT = path.join(__dirname, 'backups');

function sanitizeForFilesystem(id) {
  // Replace only invalid Windows filesystem characters
  return String(id).replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_');
}

function initializeFirebase() {
  const resolvedPath = path.isAbsolute(SERVICE_ACCOUNT_PATH)
    ? SERVICE_ACCOUNT_PATH
    : path.resolve(process.cwd(), SERVICE_ACCOUNT_PATH);

  let serviceAccount;
  try {
    serviceAccount = require(resolvedPath);
  } catch (err) {
    throw new Error(`Unable to load service account key at "${resolvedPath}".`);
  }

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });

  return getDatabase();
}

async function promptConfirmation(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(message + ' (y/N): ', answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ════════════════════════════════════════════════════════════════
// Main Execution
// ════════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('❌ استخدام خاطئ! الصيغة الصحيحة:');
    console.error('node argon-restore.js "<ClinicID>" "<Date_YYYY-MM-DD>"');
    console.error('مثال: node argon-restore.js "ابتسامة-هولويود" 2026-06-16');
    process.exit(1);
  }

  const clinicId = args[0];
  const dateStr = args[1];

  console.log('══════════════════════════════════════════');
  console.log(' ARGON RESTORE ENGINE — Disaster Recovery');
  console.log('══════════════════════════════════════════');
  console.log(`[INFO] Target Clinic : ${clinicId}`);
  console.log(`[INFO] Target Date   : ${dateStr}`);

  const safeId = sanitizeForFilesystem(clinicId);
  const clinicDir = path.join(BACKUP_ROOT, safeId);

  let files;
  try {
    files = await fs.readdir(clinicDir);
  } catch (e) {
    console.error(`\n[FATAL] ❌ لم يتم العثور على مسار العيادة: ${clinicDir}`);
    process.exit(1);
  }

  // Find all backups for that date, reverse sorted means newest time comes first
  const backups = files.filter(f => f.startsWith(`backup_${dateStr}`) && f.endsWith('.json')).sort().reverse();

  if (backups.length === 0) {
    console.error(`\n[FATAL] ❌ لم يتم العثور على أي نسخة لتاريخ ${dateStr} في مجلد العيادة.`);
    process.exit(1);
  }

  const latestBackup = backups[0]; // Auto-pick the latest timestamp for that day
  const filePath = path.join(clinicDir, latestBackup);

  let fileContent;
  try {
    fileContent = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    console.error(`\n[FATAL] ❌ لم يتم العثور على ملف النسخة الاحتياطية!`);
    console.error(`تأكد من المسار: ${filePath}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fileContent);
  } catch (e) {
    console.error(`\n[FATAL] ❌ ملف النسخة الاحتياطية تالف (Invalid JSON).`);
    process.exit(1);
  }

  const sizeKB = (Buffer.byteLength(fileContent, 'utf8') / 1024).toFixed(1);
  console.log(`[INFO] Backup Loaded : ${latestBackup} (${sizeKB} KB found).`);

  console.log('\n⚠️ تحذير خطير: هذه العملية ستقوم بحذف بيانات العيادة الحالية تماماً (إن وجدت) واستبدالها بهذه النسخة.');
  const confirmed = await promptConfirmation('هل أنت متأكد من الاستمرار؟ اكتب y');
  
  if (!confirmed) {
    console.log('[INFO] تم الإلغاء. لم يتم إجراء أي تغيير على قاعدة البيانات.');
    process.exit(0);
  }

  console.log(`\n[INFO] Connecting to Firebase...`);
  let db;
  try {
    db = initializeFirebase();
  } catch (err) {
    console.error(`[FATAL] Firebase initialization failed: ${err.message}`);
    process.exit(1);
  }

  try {
    const ref = db.ref('clinics/' + clinicId);
    console.log(`[INFO] Uploading data to /clinics/${clinicId} ...`);
    
    await ref.set(data);
    
    console.log(`\n[OK] ✅ تمت استعادة البيانات بنجاح تام! 🎉`);
    console.log('══════════════════════════════════════════');
  } catch (err) {
    console.error(`\n[FATAL] ❌ فشل رفع البيانات: ${err.message}`);
  } finally {
    const apps = getApps();
    if (apps.length) {
      await deleteApp(getApp());
    }
  }
}

main();
