import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../apps/api/src/database/connection.js';
import { defaultGmailSyncService } from '../../apps/api/src/modules/integrations/gmail-sync.service.js';

async function main() {
  console.log('1. Connecting to database...');
  await connectDatabase();
  console.log('2. Database connected. readyState:', mongoose.connection.readyState);

  const mId = '6af6ee4f910d54b7fab9acff';
  console.log('3. Triggering sync for merchant:', mId);
  try {
    const summary = await defaultGmailSyncService.sync(mId, { lookbackDays: 7, maxMessages: 5 });
    console.log('4. Sync Succeeded:', JSON.stringify(summary, null, 2));
  } catch (err: any) {
    console.log('4. Sync Error:', err.message);
  }

  console.log('5. Disconnecting...');
  await disconnectDatabase();
  console.log('6. Done.');
}

main().catch(console.error);
