import React, { useState, useEffect } from 'react';

export interface AndroidDownloadPageProps {
  onNavigate: (path: string) => void;
}

interface ReleaseMetadata {
  versionName: string;
  versionCode: number;
  releaseDate: string;
  minimumAndroidVersion: string;
  targetAndroidVersion: string;
  packageName: string;
  apkDownloadUrl: string;
  apkVersionedUrl: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  sha256: string;
  certificateFingerprintSha256: string;
  releaseNotes: string[];
}

const FALLBACK_METADATA: ReleaseMetadata = {
  versionName: '0.1.0',
  versionCode: 1,
  releaseDate: '2026-11-20',
  minimumAndroidVersion: 'Android 8.0 (API 26)',
  targetAndroidVersion: 'Android 14 (API 34)',
  packageName: 'com.rgsledger.companion',
  apkDownloadUrl: '/downloads/android/rgs-companion-release.apk',
  apkVersionedUrl: '/downloads/android/rgs-companion-v0.1.0.apk',
  fileSizeBytes: 3298054,
  fileSizeFormatted: '3.15 MB',
  sha256: '75164e31f37b471d14977026d248fee5919bd4dd9c0ae4e0e4712f7981d97478',
  certificateFingerprintSha256: 'c9240b7b9ce4a79dcc62ce821477f56026c74f136138b7581e16e219e47a34b2',
  releaseNotes: [
    'Initial public release of the RGS Ledger Android Companion.',
    'Native Kotlin NotificationListenerService integration for bank credit notification capture.',
    'Offline encrypted SQLite persistence with WorkManager automated background synchronization.',
    'Secure 8-character rotating device pairing mechanism.',
    'Integrated support for multi-bank credit notification extraction.'
  ]
};

export const AndroidDownloadPage: React.FC<AndroidDownloadPageProps> = ({ onNavigate }) => {
  const [metadata, setMetadata] = useState<ReleaseMetadata>(FALLBACK_METADATA);
  const [copiedSha, setCopiedSha] = useState(false);

  useEffect(() => {
    fetch('/downloads/android/latest.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.versionName) {
          setMetadata(data);
        }
      })
      .catch(() => {
        // Safe fallback already set
      });
  }, []);

  const copyChecksum = () => {
    navigator.clipboard.writeText(metadata.sha256);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2500);
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#6B7280', marginBottom: '24px' }}>
        <button
          onClick={() => onNavigate('/')}
          style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          Home
        </button>
        <span>/</span>
        <span>Downloads</span>
        <span>/</span>
        <span style={{ color: '#111827', fontWeight: 600 }}>Android Companion APK</span>
      </div>

      {/* HERO SECTION */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          borderRadius: '16px',
          padding: '48px 36px',
          color: '#FFFFFF',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          marginBottom: '40px'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '32px' }}>
          <div style={{ maxWidth: '640px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '9999px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: '#4ADE80', marginBottom: '16px' }}>
              <span>●</span> Official Release v{metadata.versionName}
            </div>
            <h1 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 16px 0', lineHeight: 1.2 }}>
              RGS Ledger Android Companion
            </h1>
            <p style={{ fontSize: '16px', color: '#CBD5E1', lineHeight: 1.6, margin: '0 0 24px 0' }}>
              The essential companion application for RGS Ledger merchants. Installs directly on your merchant Android phone or counter terminal to capture bank credit push notifications in real time for dual-source payment evidence matching.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
              <a
                href={metadata.apkDownloadUrl}
                download="rgs-companion-release.apk"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#22C55E',
                  color: '#0F172A',
                  fontSize: '16px',
                  fontWeight: 700,
                  padding: '14px 28px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px 0 rgba(34, 197, 94, 0.39)'
                }}
              >
                <span>📥</span> Download Android App (APK)
              </a>

              <a
                href="#installation-guide"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '14px 20px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                📖 Installation Guide
              </a>
            </div>

            <div style={{ display: 'flex', gap: '24px', marginTop: '24px', fontSize: '13px', color: '#94A3B8' }}>
              <span>📦 Size: {metadata.fileSizeFormatted}</span>
              <span>📱 Requires: {metadata.minimumAndroidVersion}</span>
              <span>📅 Released: {metadata.releaseDate}</span>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '280px'
            }}
          >
            <div style={{ fontSize: '12px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 600 }}>
              Architecture Role
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#F1F5F9', marginBottom: '12px' }}>
              Dual-Source Verification
            </div>
            <p style={{ fontSize: '13px', color: '#CBD5E1', lineHeight: 1.5, margin: 0 }}>
              Under RGS Ledger's policy, a UPI payment request reaches <strong style={{ color: '#4ADE80' }}>SUCCESS</strong> only when both Bank Email and Android Companion evidence match the same underlying UTR and transaction.
            </p>
          </div>
        </div>
      </div>

      {/* WHY MERCHANTS NEED THIS APP */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '32px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>
          Why Do Merchants Need the Android Companion?
        </h2>
        <p style={{ fontSize: '15px', color: '#4B5563', lineHeight: 1.6, margin: '0 0 24px 0' }}>
          RGS Ledger is a zero-custody fintech platform. Money sent by customers scanning your UPI QR codes moves directly into your existing bank account without passing through our servers. To confirm payments authoritatively without relying on risky bank scraping, RGS Ledger correlates two independent streams of evidence:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '20px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📧</div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px 0' }}>Channel 1: Bank Credit Email</h3>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
              Captured securely via authorized, read-only Gmail bank credit alerts whenever your bank dispatches an instant payment email notification.
            </p>
          </div>

          <div style={{ background: '#F0FDF4', borderRadius: '8px', padding: '20px', border: '1px solid #DCFCE7' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📱</div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#166534', margin: '0 0 8px 0' }}>Channel 2: Android Companion (This App)</h3>
            <p style={{ fontSize: '14px', color: '#15803D', lineHeight: 1.5, margin: 0 }}>
              Runs quietly on your merchant device, capturing banking push notifications (SMS/Bank App alerts) via Android's native <code>NotificationListenerService</code>.
            </p>
          </div>
        </div>
      </div>

      {/* VERIFIED RELEASE METADATA & INTEGRITY */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '32px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0 }}>
            Official Build Specifications & SHA-256 Checksum
          </h2>
          <span style={{ fontSize: '12px', background: '#EEF2FF', color: '#4F46E5', fontWeight: 600, padding: '4px 10px', borderRadius: '6px' }}>
            Cryptographically Signed
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Package Identifier</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{metadata.packageName}</div>
          </div>
          <div style={{ background: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Version & Build Code</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>v{metadata.versionName} (Build {metadata.versionCode})</div>
          </div>
          <div style={{ background: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Binary File Size</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{metadata.fileSizeFormatted} ({metadata.fileSizeBytes.toLocaleString()} bytes)</div>
          </div>
          <div style={{ background: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Android Compatibility</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{metadata.minimumAndroidVersion} or higher</div>
          </div>
        </div>

        {/* SHA-256 Checksum Display */}
        <div style={{ background: '#0F172A', color: '#F8FAFC', borderRadius: '8px', padding: '18px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
              SHA-256 CHECKSUM (VERIFY BEFORE RUNNING)
            </span>
            <button
              onClick={copyChecksum}
              style={{
                background: copiedSha ? '#16A34A' : '#334155',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {copiedSha ? '✓ Copied' : '📋 Copy Checksum'}
            </button>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all', color: '#38BDF8' }}>
            {metadata.sha256}
          </div>
        </div>

        {/* Certificate Fingerprint */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', fontSize: '12px', color: '#475569' }}>
          <strong>Signing Certificate SHA-256:</strong>{' '}
          <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{metadata.certificateFingerprintSha256}</span>
        </div>
      </div>

      {/* STEP-BY-STEP INSTALLATION GUIDE */}
      <div id="installation-guide" style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '32px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
          Step-by-Step Installation & Pairing Guide
        </h2>
        <p style={{ fontSize: '14px', color: '#6B7280', margin: '0 0 28px 0' }}>
          Follow these 9 simple steps directly on your merchant Android smartphone or counter terminal:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {[
            {
              step: 1,
              title: 'Open Website on Android Phone',
              desc: 'Open Google Chrome or any browser on your Android device and visit the RGS Ledger website.'
            },
            {
              step: 2,
              title: 'Tap Download Android App',
              desc: 'Tap the green Download Android App button above to download the official release APK artifact.'
            },
            {
              step: 3,
              title: 'Open Downloaded APK',
              desc: 'Pull down the Android notification shade or open your browser Downloads folder, then tap rgs-companion-release.apk.'
            },
            {
              step: 4,
              title: 'Allow Installation From This Source (if prompted)',
              desc: 'Android will display a standard security prompt asking to allow unknown apps from your browser. Tap Settings, toggle "Allow from this source", and tap the back arrow.'
            },
            {
              step: 5,
              title: 'Tap Install',
              desc: 'Confirm the package installation dialog and tap "Install". Wait a few seconds for the package installation to finish.'
            },
            {
              step: 6,
              title: 'Open RGS Ledger Companion',
              desc: 'Tap "Open" from the installer or launch the RGS Companion icon on your home screen or app drawer.'
            },
            {
              step: 7,
              title: 'Grant Notification Access (Crucial)',
              desc: 'The app will prompt you that Notification Access is required. Tap "Open Settings", locate "RGS Payment Evidence Listener", and turn the toggle ON.'
            },
            {
              step: 8,
              title: 'Pair With Your Merchant Account',
              desc: 'Log in to your Merchant Dashboard on your PC or mobile, navigate to the Devices tab, click "Pair Device" to generate an 8-character code, and enter it in the app.'
            },
            {
              step: 9,
              title: 'Verify Device Connection',
              desc: 'The companion app dashboard will immediately display a green "Device Paired & Listening" status badge. Your device is now actively protecting payments!'
            }
          ].map((item) => (
            <div key={item.step} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div
                style={{
                  background: '#0F172A',
                  color: '#FFFFFF',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                  flexShrink: 0
                }}
              >
                {item.step}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 4px 0' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: 1.5, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* HOW TO UPDATE IN THE FUTURE */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '32px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>
          How to Update Existing Installations
        </h2>
        <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: 1.6, margin: '0 0 16px 0' }}>
          When newer releases are published, you do <strong>not</strong> need to uninstall the application or pair your terminal again:
        </p>
        <ul style={{ paddingLeft: '20px', fontSize: '14px', color: '#4B5563', lineHeight: 1.6, margin: '0 0 16px 0' }}>
          <li>All official releases use the exact same application identifier (<code>com.rgsledger.companion</code>) and signing certificate.</li>
          <li>Simply visit this page, download the new APK, and tap <strong>Update</strong> when prompted by Android.</li>
          <li>Your existing paired device token, merchant association, and queued notifications are preserved untouched.</li>
        </ul>
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '14px', fontSize: '13px', color: '#92400E' }}>
          ⚠️ <strong>Explicit User Installation:</strong> For security and privacy, RGS Ledger never performs silent or forced background APK updates. All updates require merchant consent.
        </div>
      </div>

      {/* SECURITY NOTICE & FINTECH DISCLOSURES */}
      <div style={{ background: '#FFFBEB', borderRadius: '12px', border: '1px solid #FCD34D', padding: '28px', marginBottom: '32px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#92400E', margin: '0 0 12px 0' }}>
          🛡️ Security Notice & Regulatory Disclosure
        </h3>
        <ul style={{ paddingLeft: '20px', fontSize: '13px', color: '#78350F', lineHeight: 1.6, margin: 0 }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Why Android displays an "Unknown Source" warning:</strong> This application is distributed directly by RGS Ledger as an official enterprise APK for verified merchants, rather than through the Google Play Store. We do not claim Google Play Protect certification.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Strict Scope of Notification Access:</strong> The companion app strictly inspects notifications originating from authorized banking and UPI applications to parse credit alerts. It never reads personal chats, private emails, or unauthorized apps.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>No Banking Control:</strong> The companion cannot initiate debit transactions, check balances, or execute wire transfers. It is purely an incoming notification listener.
          </li>
          <li>
            <strong>Dual-Source Policy:</strong> Installing the companion application alone does not mark a payment <code>SUCCESS</code>. Payment success requires concurrent, matching evidence from both bank email and companion push notification.
          </li>
        </ul>
      </div>

      {/* FAQ & TROUBLESHOOTING */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '0 0 20px 0' }}>
          Frequently Asked Questions & Troubleshooting
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>
              Which banks are supported by the Companion?
            </h4>
            <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: 1.5, margin: 0 }}>
              The companion is tested and compatible with Union Bank of India, HDFC Bank, ICICI Bank, State Bank of India (SBI), Axis Bank, Kotak Mahindra Bank, Canara Bank, Punjab National Bank (PNB), and any merchant bank that dispatches SMS or app notifications containing the UPI UTR (RRN).
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>
              How can I verify the APK checksum manually?
            </h4>
            <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: 1.5, margin: '0 0 8px 0' }}>
              On your computer or terminal, calculate the SHA-256 hash using PowerShell or Linux:
            </p>
            <pre style={{ background: '#1E293B', color: '#E2E8F0', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto', margin: 0 }}>
{`# Windows PowerShell:
Get-FileHash rgs-companion-release.apk -Algorithm SHA256

# Linux / macOS:
sha256sum rgs-companion-release.apk`}
            </pre>
          </div>

          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>
              What happens if the merchant device loses internet connection?
            </h4>
            <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: 1.5, margin: 0 }}>
              Incoming banking notifications are saved immediately to an encrypted offline SQLite database on the device. Android's native <code>WorkManager</code> automatically synchronizes all queued items with the RGS Ledger API as soon as cellular or Wi-Fi connectivity is restored.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>
              Is there an iOS companion app available?
            </h4>
            <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: 1.5, margin: 0 }}>
              No. Apple's iOS sandbox strictly prohibits any third-party app from reading or intercepting notifications generated by other applications. For Apple devices, merchants can utilize the web dashboard to view status, but evidence capture requires an Android terminal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
