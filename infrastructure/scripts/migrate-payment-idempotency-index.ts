import mongoose from 'mongoose';
import { config } from '../../apps/api/src/config/index.js';
import { logger } from '../../apps/api/src/utils/logger.js';

/**
 * Migration Script: Migrate Payment Request Idempotency Index
 *
 * Problem:
 * The compound unique index { merchantId: 1, idempotencyKey: 1 } with sparse: true
 * indexed documents where idempotencyKey was explicitly stored as null.
 * When multiple payment requests were created without an idempotency key (storing null),
 * MongoDB raised E11000 duplicate key error on { merchantId: ..., idempotencyKey: null }.
 *
 * Solution:
 * 1. Unset null or empty string idempotencyKey fields on existing payment_requests.
 * 2. Drop the existing index (e.g. merchantId_1_idempotencyKey_1).
 * 3. Recreate the index as a partial unique index with partialFilterExpression:
 *    { idempotencyKey: { $type: "string" } }.
 * 4. Verify existing indexes and document counts.
 */
export async function migratePaymentIdempotencyIndex(): Promise<void> {
  // Validate that MONGODB_URI is provided and not defaulting to localhost unless explicitly set
  if (!config.MONGODB_URI) {
    throw new Error('FATAL: MONGODB_URI is not set in configuration.');
  }

  // Safe startup log: display intended operation without revealing secrets
  logger.info('====================================================');
  logger.info('RGS LEDGER — DATABASE INDEX MIGRATION');
  logger.info('Target Collection : payment_requests');
  logger.info('Index Operation   : merchantId_1_idempotencyKey_1 -> partialFilterExpression');
  logger.info('====================================================');

  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000
  });

  const dbName = mongoose.connection.name;
  const host = mongoose.connection.host;

  logger.info('Connected to MongoDB cluster successfully', {
    targetDatabase: dbName,
    targetClusterHost: host
  });

  const collection = mongoose.connection.collection('payment_requests');

  // Step 1: Clean existing documents that store null or non-string idempotencyKey
  const unsetResult = await collection.updateMany(
    {
      $or: [
        { idempotencyKey: null },
        { idempotencyKey: { $exists: true, $not: { $type: 'string' } } }
      ]
    },
    {
      $unset: { idempotencyKey: '' }
    }
  );
  logger.info(`Cleaned up ${unsetResult.modifiedCount} payment request documents with null/invalid idempotencyKey.`);

  // Step 2: Inspect existing indexes
  const existingIndexes = await collection.indexes();
  logger.info('Current indexes on payment_requests:', {
    indexes: existingIndexes.map((idx) => idx.name)
  });

  const oldIndexName = 'merchantId_1_idempotencyKey_1';
  const hasOldIndex = existingIndexes.some((idx) => idx.name === oldIndexName);

  if (hasOldIndex) {
    logger.info(`Dropping obsolete index: ${oldIndexName}...`);
    await collection.dropIndex(oldIndexName);
    logger.info(`Successfully dropped ${oldIndexName}.`);
  }

  // Also drop standalone idempotencyKey_1 if created by Mongoose schema earlier
  const hasStandaloneIndex = existingIndexes.some((idx) => idx.name === 'idempotencyKey_1');
  if (hasStandaloneIndex) {
    logger.info('Dropping redundant standalone index idempotencyKey_1...');
    await collection.dropIndex('idempotencyKey_1');
    logger.info('Successfully dropped idempotencyKey_1.');
  }

  // Step 3: Recreate with partialFilterExpression
  logger.info('Creating partial unique compound index on { merchantId: 1, idempotencyKey: 1 }...');
  await collection.createIndex(
    { merchantId: 1, idempotencyKey: 1 },
    {
      name: 'merchantId_1_idempotencyKey_1',
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: 'string' } }
    }
  );
  logger.info('Successfully created partial unique compound index.');

  // Step 4: Verification
  const updatedIndexes = await collection.indexes();
  logger.info('Updated indexes on payment_requests:', {
    indexes: updatedIndexes.map((idx) => ({
      name: idx.name,
      unique: idx.unique,
      partialFilterExpression: idx.partialFilterExpression
    }))
  });

  await mongoose.disconnect();
  logger.info('Migration complete and database disconnected.');
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate-payment-idempotency-index.ts')) {
  migratePaymentIdempotencyIndex()
    .then(() => {
      console.log('Migration succeeded');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
