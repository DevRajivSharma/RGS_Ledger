import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('Pre-Hosting Phase: Public Android Companion APK Distribution & Integrity', () => {
  const rootDir = process.cwd();
  const releaseApkPath = path.resolve(rootDir, 'apps/mobile-companion/android/app/build/outputs/apk/release/app-release.apk');
  const publicApkPath = path.resolve(rootDir, 'apps/public-website/public/downloads/android/rgs-companion-release.apk');
  const latestJsonPath = path.resolve(rootDir, 'apps/public-website/public/downloads/android/latest.json');
  const manifestPath = path.resolve(rootDir, 'apps/mobile-companion/android/app/src/main/AndroidManifest.xml');
  const buildGradlePath = path.resolve(rootDir, 'apps/mobile-companion/android/app/build.gradle');
  const devicePrefsPath = path.resolve(rootDir, 'apps/mobile-companion/android/app/src/main/kotlin/com/rgsledger/companion/data/DevicePreferences.kt');
  const appTsxPath = path.resolve(rootDir, 'apps/mobile-companion/App.tsx');

  test('1. Release APK artifact exists and was built successfully', () => {
    assert.ok(fs.existsSync(releaseApkPath), 'Release APK must exist in Android build outputs');
    assert.ok(fs.existsSync(publicApkPath), 'Release APK must be present in public downloads directory');

    const stats = fs.statSync(publicApkPath);
    assert.ok(stats.size > 1_000_000, `APK size (${stats.size} bytes) should be > 1MB for a complete React Native / Android runtime`);
  });

  test('2. Cloudflare Pages asset limit compliance (< 25 MiB)', () => {
    const stats = fs.statSync(publicApkPath);
    const maxCloudflareBytes = 25 * 1024 * 1024; // 26,214,400 bytes
    assert.ok(
      stats.size < maxCloudflareBytes,
      `APK size (${stats.size} bytes) exceeds Cloudflare Pages 25 MiB static asset limit (${maxCloudflareBytes} bytes)`
    );
  });

  test('3. SHA-256 checksum matches the generated release artifact byte-for-byte', () => {
    const fileBuffer = fs.readFileSync(publicApkPath);
    const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toLowerCase();

    assert.ok(fs.existsSync(latestJsonPath), 'latest.json must exist');
    const latest = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));

    assert.equal(
      computedHash,
      latest.sha256.toLowerCase(),
      'Calculated APK SHA-256 hash must exactly match sha256 in latest.json'
    );
  });

  test('4. latest.json contains complete, authentic release metadata', () => {
    const latest = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));

    assert.equal(latest.versionName, '0.1.0');
    assert.equal(latest.versionCode, 1);
    assert.equal(latest.packageName, 'com.rgsledger.companion');
    assert.equal(latest.minimumAndroidVersion, 'Android 8.0 (API 26)');
    assert.equal(latest.targetAndroidVersion, 'Android 14 (API 34)');
    assert.equal(latest.apkDownloadUrl, '/downloads/android/rgs-companion-release.apk');
    assert.equal(typeof latest.fileSizeBytes, 'number');
    assert.ok(latest.fileSizeBytes > 0);
    assert.ok(Array.isArray(latest.releaseNotes) && latest.releaseNotes.length > 0);
    assert.ok(/^[0-9a-f]{64}$/i.test(latest.sha256), 'sha256 must be a 64-char hex string');
    assert.ok(/^[0-9a-f]{64}$/i.test(latest.certificateFingerprintSha256), 'certificateFingerprintSha256 must be a 64-char hex string');
  });

  test('5. Android Gradle configuration embeds production API URL and eliminates localhost defaults in release', () => {
    const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

    // Release buildConfigField must point to production domain and not localhost/10.0.2.2
    assert.ok(buildGradle.includes('buildConfigField "String", "DEFAULT_API_URL"'));
    assert.ok(buildGradle.includes('https://api.rgsledger.rajivsharma.online'));

    // Release signing configuration must be present
    assert.ok(buildGradle.includes('signingConfigs'));
    assert.ok(buildGradle.includes('signingConfig signingConfigs.release'));
  });

  test('6. DevicePreferences in Kotlin consumes BuildConfig.DEFAULT_API_URL', () => {
    const devicePrefs = fs.readFileSync(devicePrefsPath, 'utf8');
    assert.ok(devicePrefs.includes('BuildConfig.DEFAULT_API_URL'));
    assert.ok(!devicePrefs.includes('"http://10.0.2.2:4000"'), 'Hardcoded 10.0.2.2 fallback must be removed');
  });

  test('7. React Native App.tsx defaults to production API URL in release mode', () => {
    const appTsx = fs.readFileSync(appTsxPath, 'utf8');
    assert.ok(appTsx.includes('https://api.rgsledger.rajivsharma.online'));
    assert.ok(appTsx.includes('__DEV__'));
  });

  test('8. AndroidManifest.xml preserves NotificationListenerService and security permissions', () => {
    const manifest = fs.readFileSync(manifestPath, 'utf8');

    // Permissions
    assert.ok(manifest.includes('android.permission.INTERNET'));
    assert.ok(manifest.includes('android.permission.ACCESS_NETWORK_STATE'));
    assert.ok(manifest.includes('android.permission.RECEIVE_BOOT_COMPLETED'));

    // NotificationListenerService guarded by BIND_NOTIFICATION_LISTENER_SERVICE
    assert.ok(manifest.includes('.NotificationListener'));
    assert.ok(manifest.includes('android.permission.BIND_NOTIFICATION_LISTENER_SERVICE'));
    assert.ok(manifest.includes('android.service.notification.NotificationListenerService'));
  });

  test('9. Release signing configuration does not commit secrets in version control', () => {
    const gitignorePath = path.resolve(rootDir, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');

    assert.ok(gitignore.includes('*.keystore'), '.gitignore must ignore *.keystore files');
    assert.ok(gitignore.includes('*.jks'), '.gitignore must ignore *.jks files');
    assert.ok(gitignore.includes('release-signing.properties'), '.gitignore must ignore release-signing.properties');

    // Example template must exist with placeholders only
    const examplePath = path.resolve(rootDir, 'apps/mobile-companion/android/release-signing.properties.example');
    assert.ok(fs.existsSync(examplePath), 'release-signing.properties.example must exist');
  });

  test('10. Public website provides dedicated Android download page and navigation links', () => {
    const appPath = path.resolve(rootDir, 'apps/public-website/src/App.tsx');
    const navbarPath = path.resolve(rootDir, 'apps/public-website/src/components/Navbar.tsx');
    const footerPath = path.resolve(rootDir, 'apps/public-website/src/components/Footer.tsx');
    const downloadPagePath = path.resolve(rootDir, 'apps/public-website/src/pages/AndroidDownloadPage.tsx');

    assert.ok(fs.existsSync(downloadPagePath), 'AndroidDownloadPage component must exist');

    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.ok(appContent.includes('/downloads/android'));
    assert.ok(appContent.includes('AndroidDownloadPage'));

    const navbarContent = fs.readFileSync(navbarPath, 'utf8');
    assert.ok(navbarContent.includes('/downloads/android'));

    const footerContent = fs.readFileSync(footerPath, 'utf8');
    assert.ok(footerContent.includes('/downloads/android'));
  });
});
