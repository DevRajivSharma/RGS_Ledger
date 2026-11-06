import dotenv from 'dotenv';
import path from 'path';
import { validateEnvironment } from '../apps/api/src/config/validator';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

function runValidation() {
  console.log('\n============================================================');
  console.log('   RGS LEDGER — ENVIRONMENT CONFIGURATION & SECURITY AUDITOR');
  console.log('============================================================\n');

  const envMode = (process.env.PAYMENT_ENVIRONMENT || 'SANDBOX').toUpperCase();
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();

  console.log(`Node Environment:    [${nodeEnv}]`);
  console.log(`Payment Processing:  [${envMode}]`);
  console.log('------------------------------------------------------------\n');

  const summary = validateEnvironment(process.env);

  console.log('| Status  | Variable                     | Category       | Details');
  console.log('|:--------|:-----------------------------|:---------------|:-------------------------------------------------------');

  for (const issue of summary.issues) {
    const symbol = issue.status === 'ERROR' ? '❌ FAIL' : '⚠️ WARN';
    console.log(`| ${symbol.padEnd(7)} | ${issue.variable.padEnd(28)} | ${issue.category.padEnd(14)} | ${issue.message}`);
  }

  // Also print good news for critical variables that passed
  const checkedVars = summary.issues.map(i => i.variable);
  const criticalVars = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'COOKIE_SECRET', 'WEBHOOK_SIGNING_SECRET'];
  for (const v of criticalVars) {
    if (!checkedVars.includes(v)) {
      console.log(`| ✅ PASS | ${v.padEnd(28)} | Security       | Verified cryptographically secure format.`);
    }
  }

  console.log('\n------------------------------------------------------------');
  console.log(`Audit Summary: ${summary.errors.length} Errors, ${summary.warnings.length} Warnings.`);

  if (summary.errors.length > 0) {
    console.error('\n❌ FATAL CONFIGURATION ERRORS:');
    for (const err of summary.errors) {
      console.error(`  - ${err}`);
    }
    console.error('\nServer cannot safely boot in production mode with these settings.\n');
    process.exit(1);
  } else {
    console.log('\n✅ Configuration is valid for current mode (' + envMode + ').\n');
  }
}

runValidation();
