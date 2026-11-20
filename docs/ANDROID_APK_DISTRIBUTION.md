# Android Companion APK Distribution & Release Operations Guide

This guide documents the production release signing, build automation, checksum verification, and Cloudflare Pages static distribution for the **RGS Ledger Android Companion Application** (`com.rgsledger.companion`).

---

## 1. Architecture & Security Overview

The RGS Ledger Android Companion is an enterprise utility running on merchant Android smartphones or POS terminals to capture incoming bank credit push notifications via Android's native `NotificationListenerService` (guarded by `BIND_NOTIFICATION_LISTENER_SERVICE`).

### Release Invariants:
1. **Cryptographically Signed**: All public builds are signed with the official RGS Ledger Release Keystore (RSA 2048-bit, SHA-256 with RSA, 27-year validity).
2. **Zero Plaintext Credentials in Git**: Keystore binaries (`*.keystore`, `*.jks`) and signing credentials (`release-signing.properties`) are strictly `.gitignore`'d.
3. **No Localhost in Release**: Release builds embed `https://api.rgsledger.rajivsharma.online` as the default API endpoint via Gradle `buildConfigField`.
4. **Cloudflare Pages Compatibility**: The APK file size is **3.15 MB** (3,298,054 bytes), well below Cloudflare Pages' 25 MiB single-file limit. It is served directly via Cloudflare's global edge network.

---

## 2. Release Keystore & Signing Configuration

### Keystore Location
- Path: `apps/mobile-companion/android/keystore/release.keystore` (local, git-ignored)
- Alias: `rgsledger`
- Key Algorithm: `RSA 2048`
- Certificate SHA-256 Fingerprint:
  `c9240b7b9ce4a79dcc62ce821477f56026c74f136138b7581e16e219e47a34b2`

### Generating a New Keystore (Reference)
If regenerating or provisioning for a secure CI build machine:
```bash
keytool -genkeypair -v \
  -keystore "apps/mobile-companion/android/keystore/release.keystore" \
  -alias "rgsledger" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "<secure-password>" \
  -keypass "<secure-password>" \
  -dname "CN=RGS Ledger Companion, OU=Fintech Operations, O=RGS Ledger, L=Bangalore, ST=Karnataka, C=IN"
```

### Configuring Signing Credentials
Copy the template [release-signing.properties.example](file:///d:/Coding/project/RGS_PAY/apps/mobile-companion/android/release-signing.properties.example) to `apps/mobile-companion/android/release-signing.properties`:
```ini
RGS_RELEASE_STORE_FILE=keystore/release.keystore
RGS_RELEASE_STORE_PASSWORD=your_secure_keystore_password
RGS_RELEASE_KEY_ALIAS=rgsledger
RGS_RELEASE_KEY_PASSWORD=your_secure_key_password
RGS_API_URL=https://api.rgsledger.rajivsharma.online
```
Alternatively, in CI/CD pipelines (e.g. GitHub Actions), set environment variables:
- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `RGS_API_URL`

---

## 3. Step-by-Step Production Release Workflow

### Step 1: Increment Version Numbers
In [apps/mobile-companion/android/app/build.gradle](file:///d:/Coding/project/RGS_PAY/apps/mobile-companion/android/app/build.gradle) and [apps/mobile-companion/app.json](file:///d:/Coding/project/RGS_PAY/apps/mobile-companion/app.json):
- Increment `versionCode` (e.g. `1` &rarr; `2`).
- Increment `versionName` (e.g. `"0.1.0"` &rarr; `"0.1.1"`).

### Step 2: Build the Signed Release APK
From the monorepo root:
```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
cd apps/mobile-companion/android
.\gradlew.bat assembleRelease
```
The output artifact is generated at:
`apps/mobile-companion/android/app/build/outputs/apk/release/app-release.apk`

### Step 3: Verify APK Signature
Verify the v1/v2 signature with Android SDK `apksigner`:
```powershell
& "C:\Users\Rajiv sharma\AppData\Local\Android\Sdk\build-tools\34.0.0\apksigner.bat" verify --verbose --print-certs "apps/mobile-companion/android/app/build/outputs/apk/release/app-release.apk"
```
Ensure output displays `Verifies` and `Verified using v2 scheme (APK Signature Scheme v2): true`.

### Step 4: Calculate SHA-256 Checksum
```powershell
Get-FileHash "apps/mobile-companion/android/app/build/outputs/apk/release/app-release.apk" -Algorithm SHA256
```

### Step 5: Copy to Public Website Static Distribution Directory
Copy the artifact into `apps/public-website/public/downloads/android/`:
```powershell
Copy-Item "apps/mobile-companion/android/app/build/outputs/apk/release/app-release.apk" "apps/public-website/public/downloads/android/rgs-companion-release.apk" -Force
Copy-Item "apps/mobile-companion/android/app/build/outputs/apk/release/app-release.apk" "apps/public-website/public/downloads/android/rgs-companion-v<version>.apk" -Force
```

### Step 6: Update `latest.json` Metadata
Update [apps/public-website/public/downloads/android/latest.json](file:///d:/Coding/project/RGS_PAY/apps/public-website/public/downloads/android/latest.json) with actual generated values:
```json
{
  "versionName": "0.1.0",
  "versionCode": 1,
  "releaseDate": "2026-11-20",
  "minimumAndroidVersion": "Android 8.0 (API 26)",
  "targetAndroidVersion": "Android 14 (API 34)",
  "packageName": "com.rgsledger.companion",
  "apkDownloadUrl": "/downloads/android/rgs-companion-release.apk",
  "apkVersionedUrl": "/downloads/android/rgs-companion-v0.1.0.apk",
  "fileSizeBytes": 3298054,
  "fileSizeFormatted": "3.15 MB",
  "sha256": "75164e31f37b471d14977026d248fee5919bd4dd9c0ae4e0e4712f7981d97478",
  "certificateFingerprintSha256": "c9240b7b9ce4a79dcc62ce821477f56026c74f136138b7581e16e219e47a34b2",
  "releaseNotes": [
    "Initial public release of the RGS Ledger Android Companion.",
    "Native Kotlin NotificationListenerService integration for bank credit notification capture."
  ]
}
```

### Step 7: Build Website & Run Tests
```powershell
npm test
npm run typecheck
npm run build
```

---

## 4. Merchant Installation & Pairing Instructions

When instructing merchants, provide the following 9 steps:

1. **Open Website on Android Phone**: Navigate to `https://rgsledger.rajivsharma.online/downloads/android`.
2. **Download APK**: Tap **Download Android App (APK)**.
3. **Open Downloaded APK**: Pull down the notification shade and tap `rgs-companion-release.apk`.
4. **Allow Installation from Source**: If Android displays a prompt to allow unknown apps from Chrome/browser, tap **Settings**, turn **Allow from this source** ON, and tap Back.
5. **Install App**: Tap **Install** and wait for the package installer to finish.
6. **Launch RGS Companion**: Tap **Open** or launch the app icon.
7. **Grant Notification Access**: Tap **Grant Notification Access** in the app. In Android Settings, turn the toggle ON for **RGS Payment Evidence Listener**.
8. **Pair Terminal**: Open the Merchant Dashboard on a PC or mobile browser &rarr; **Devices** &rarr; **Pair Device** to get an 8-character rotating pairing code. Enter the code in the companion app.
9. **Verify Status**: The companion app will display **Device Paired & Listening** with a green indicator.

---

## 5. Updates & In-Place Upgrades

- **In-Place Updates**: Because all official releases use the identical package name (`com.rgsledger.companion`) and signing key, merchants can download newer APK releases and tap **Update**. Android will update the application in place without requiring an uninstall or re-pairing.
- **No Silent Updates**: In compliance with privacy and security standards, the application never downloads or installs executable binaries silently in the background.

---

## 6. Troubleshooting Common Issues

### Issue 1: "App Not Installed" or Signature Conflict
- **Cause**: An existing debug build signed with Android's default debug key is already installed on the phone.
- **Solution**: Uninstall the development/debug build from the phone once, then install the official signed release APK. Future official release updates will install seamlessly.

### Issue 2: "Play Protect Warning / Blocked by Play Protect"
- **Cause**: The APK is distributed directly from the RGS Ledger website rather than the Google Play Store.
- **Solution**: Tap **More details** &rarr; **Install anyway**. RGS Ledger provides the exact SHA-256 checksum so merchants can verify file integrity.

### Issue 3: Missing Banking Notifications
- **Cause**: Notification Access was disabled, battery optimization killed the background listener, or the banking app has notifications disabled.
- **Solution**:
  1. Go to Android **Settings** &rarr; **Apps & Notifications** &rarr; **Special App Access** &rarr; **Notification Access** &rarr; Ensure **RGS Payment Evidence Listener** is enabled.
  2. In Android Settings &rarr; **Battery** &rarr; **Battery Optimization**, set RGS Companion to **Don't Optimize** (or "Unrestricted") so Android does not sleep the listener service.
