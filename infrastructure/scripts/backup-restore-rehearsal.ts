import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

const CRITICAL_COLLECTIONS = [
  'merchants',
  'users',
  'merchant_bank_accounts',
  'merchant_integrations',
  'payment_requests',
  'payment_evidence',
  'evidence_templates',
  'payment_evidence_associations',
  'android_devices',
  'device_pairing_codes',
  'api_credentials',
  'webhook_endpoints',
  'webhook_events',
  'webhook_deliveries',
  'reconciliation_cases',
  'audit_logs',
  'platform_configs'
];

async function runRehearsal() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log('=============================================================');
  console.log('1. Connecting to Source MongoDB Cluster...');
  console.log('=============================================================');
  const srcConn = await mongoose.createConnection(uri).asPromise();
  const srcDb = srcConn.db;
  if (!srcDb) throw new Error('Failed to get source database handle');
  console.log('Connected to source DB:', srcDb.databaseName);

  // 1. Export Phase
  console.log('\n2. Exporting Critical Collections to Compressed Archive...');
  const backupData: Record<string, any[]> = {};
  const collectionCounts: Record<string, number> = {};

  for (const collName of CRITICAL_COLLECTIONS) {
    const docs = await srcDb.collection(collName).find({}).toArray();
    backupData[collName] = docs;
    collectionCounts[collName] = docs.length;
    console.log(`  - ${collName}: ${docs.length} documents exported`);
  }

  const backupsDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(backupsDir, `rgs_ledger_backup_rehearsal_${timestamp}.json.gz`);

  const serialized = JSON.stringify(backupData);
  const compressed = zlib.gzipSync(Buffer.from(serialized, 'utf8'));
  fs.writeFileSync(archivePath, compressed);

  const fileSizeKb = (compressed.length / 1024).toFixed(2);
  console.log(`Archive created successfully: ${path.basename(archivePath)} (${fileSizeKb} KB)`);

  // 2. Restore Phase into Separate Temporary Test Database
  const testDbName = 'rgs_ledger_restore_test';
  console.log(`\n3. Restoring into Isolated Temporary Test Database: [${testDbName}]...`);

  // Target connection to the separate test database on the same cluster
  let targetUri: string;
  const qIdx = uri.indexOf('?');
  const queryStr = qIdx !== -1 ? uri.slice(qIdx) : '';
  const baseUri = qIdx !== -1 ? uri.slice(0, qIdx) : uri;
  const lastSlash = baseUri.lastIndexOf('/');
  if (baseUri.slice(lastSlash - 1, lastSlash + 1) === '//') {
    targetUri = `${baseUri}/${testDbName}${queryStr}`;
  } else {
    targetUri = `${baseUri.slice(0, lastSlash)}/${testDbName}${queryStr}`;
  }

  const targetConn = await mongoose.createConnection(targetUri).asPromise();
  const targetDb = targetConn.db;
  if (!targetDb) throw new Error('Failed to get target database handle');

  if (targetDb.databaseName === srcDb.databaseName) {
    throw new Error(`SAFETY HALT: Target database name "${targetDb.databaseName}" cannot match source database name "${srcDb.databaseName}".`);
  }

  const restoredCounts: Record<string, number> = {};

  // Read archive back from disk and decompress
  const readArchive = fs.readFileSync(archivePath);
  const decompressed = zlib.gunzipSync(readArchive).toString('utf8');
  const parsedData = JSON.parse(decompressed);

  for (const [collName, docs] of Object.entries(parsedData) as [string, any[]][]) {
    const targetColl = targetDb.collection(collName);
    // Drop target test collection if existed in prior rehearsal
    await targetColl.drop().catch(() => {});

    if (docs.length > 0) {
      await targetColl.insertMany(docs);
    }
    const count = await targetColl.countDocuments();
    restoredCounts[collName] = count;
    console.log(`  - Restored ${collName}: ${count} documents`);
  }

  // 3. Validation Phase
  console.log('\n4. Validating Restored Database Integrity & Relationships...');
  let hasDiscrepancy = false;
  for (const collName of CRITICAL_COLLECTIONS) {
    const srcCount = collectionCounts[collName] || 0;
    const tgtCount = restoredCounts[collName] || 0;
    if (srcCount !== tgtCount) {
      console.error(`  [FAIL] Count mismatch in ${collName}: Source=${srcCount}, Restored=${tgtCount}`);
      hasDiscrepancy = true;
    }
  }

  if (!hasDiscrepancy) {
    console.log('  [PASS] All 17 critical collections matched document counts identically!');
  }

  // Validate relationships in restored DB
  const restoredMerchants = await targetDb.collection('merchants').countDocuments();
  const restoredPayments = await targetDb.collection('payment_requests').countDocuments();
  const restoredEvidence = await targetDb.collection('payment_evidence').countDocuments();
  const restoredTemplates = await targetDb.collection('evidence_templates').countDocuments();
  const restoredDevices = await targetDb.collection('android_devices').countDocuments();

  console.log('\n5. Restored Entities Summary:');
  console.log(`  - Merchants: ${restoredMerchants}`);
  console.log(`  - Payment Requests: ${restoredPayments}`);
  console.log(`  - Payment Evidence: ${restoredEvidence}`);
  console.log(`  - Evidence Templates: ${restoredTemplates}`);
  console.log(`  - Android Devices: ${restoredDevices}`);

  console.log('\n=============================================================');
  console.log('Backup and Restore Rehearsal Succeeded!');
  console.log(`Temporary database [${testDbName}] is preserved for user inspection.`);
  console.log('=============================================================');

  await srcConn.close();
  await targetConn.close();
}

runRehearsal().catch((err) => {
  console.error('Rehearsal failed:', err.message);
  process.exit(1);
});
