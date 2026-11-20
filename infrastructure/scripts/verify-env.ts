import dotenv from 'dotenv';
import { EnvironmentSchema } from '@rgs-ledger/validation';

dotenv.config();

console.log('Validating environment configuration...');
const result = EnvironmentSchema.safeParse(process.env);

if (!result.success) {
  console.error('Environment validation FAILED:');
  console.error(result.error.format());
  process.exit(1);
} else {
  console.log('Environment configuration is VALID.');
  console.log('Node Environment:', result.data.NODE_ENV);
  console.log('API Port:', result.data.PORT);
  console.log('Database Host:', result.data.MONGODB_URI.split('@')[1] || 'localhost');
}
