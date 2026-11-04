import mongoose from 'mongoose';
import { config } from '../config';

let isConnected = false;

export async function connectDatabase(): Promise<boolean> {
  if (isConnected) return true;

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    });
    isConnected = true;
    console.log(`[Database] MongoDB connected successfully to ${config.mongoUri}`);
    return true;
  } catch (err: any) {
    console.warn(`[Database] MongoDB connection warning: ${err.message}. Running with mock/fallback database store.`);
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
  }
}
