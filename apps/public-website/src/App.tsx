import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { Footer } from './components/Footer.js';
import { HomePage } from './pages/HomePage.js';
import { ProductPage } from './pages/ProductPage.js';
import { HowItWorksPage } from './pages/HowItWorksPage.js';
import { FeaturesPage } from './pages/FeaturesPage.js';
import { PricingPage } from './pages/PricingPage.js';
import { FAQPage } from './pages/FAQPage.js';
import { ContactPage } from './pages/ContactPage.js';
import { LegalPage } from './pages/LegalPages.js';
import { AndroidDownloadPage } from './pages/AndroidDownloadPage.js';
import { APP_URLS, getMerchantLoginUrl, getMerchantSignupUrl } from './config/urls.js';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  // Client-side authentication redirect enforcement
  // Public website must never host login or signup flows.
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/login') {
      window.location.replace(getMerchantLoginUrl(window.location.search));
    } else if (path === '/signup' || path === '/register') {
      window.location.replace(getMerchantSignupUrl(window.location.search));
    } else if (path.startsWith('/onboarding')) {
      window.location.replace(APP_URLS.merchantDashboard);
    }
  }, []);

  // Keep state synchronized with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname || '/';
      if (path === '/login') {
        window.location.replace(getMerchantLoginUrl(window.location.search));
        return;
      }
      if (path === '/signup' || path === '/register') {
        window.location.replace(getMerchantSignupUrl(window.location.search));
        return;
      }
      if (path.startsWith('/onboarding')) {
        window.location.replace(APP_URLS.merchantDashboard);
        return;
      }
      setCurrentPath(path);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (path === '/login' || path.startsWith('/login?')) {
      const search = path.includes('?') ? path.slice(path.indexOf('?')) : undefined;
      window.location.href = getMerchantLoginUrl(search);
      return;
    }
    if (path === '/signup' || path.startsWith('/signup?') || path === '/register' || path.startsWith('/register?')) {
      const search = path.includes('?') ? path.slice(path.indexOf('?')) : undefined;
      window.location.href = getMerchantSignupUrl(search);
      return;
    }
    if (path.startsWith('/onboarding')) {
      window.location.href = APP_URLS.merchantDashboard;
      return;
    }

    setCurrentPath(path);
    window.history.pushState({}, '', path);
    window.scrollTo(0, 0);
  };

  const renderContent = () => {
    switch (currentPath) {
      case '/product':
        return <ProductPage onNavigate={navigateTo} />;
      case '/how-it-works':
        return <HowItWorksPage onNavigate={navigateTo} />;
      case '/features':
        return <FeaturesPage onNavigate={navigateTo} />;
      case '/pricing':
        return <PricingPage onNavigate={navigateTo} />;
      case '/faq':
        return <FAQPage onNavigate={navigateTo} />;
      case '/downloads/android':
      case '/download':
      case '/downloads':
        return <AndroidDownloadPage onNavigate={navigateTo} />;
      case '/contact':
        return <ContactPage />;
      case '/terms':
        return <LegalPage type="terms" onNavigate={navigateTo} />;
      case '/privacy':
        return <LegalPage type="privacy" onNavigate={navigateTo} />;
      case '/security':
        return <LegalPage type="security" onNavigate={navigateTo} />;
      case '/data-retention':
        return <LegalPage type="data-retention" onNavigate={navigateTo} />;
      case '/acceptable-use':
        return <LegalPage type="acceptable-use" onNavigate={navigateTo} />;
      case '/login':
        return (
          <div style={{ textAlign: 'center', padding: '100px 20px', minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '20px', color: '#111827', marginBottom: '8px' }}>Redirecting to Merchant Portal...</h2>
            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '16px' }}>
              Authentication is managed securely at the merchant application.
            </p>
            <a href={getMerchantLoginUrl()} style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'underline' }}>
              Click here if you are not redirected automatically →
            </a>
          </div>
        );
      case '/signup':
      case '/register':
        return (
          <div style={{ textAlign: 'center', padding: '100px 20px', minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '20px', color: '#111827', marginBottom: '8px' }}>Redirecting to Merchant Registration...</h2>
            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '16px' }}>
              Merchant registration is handled directly on the merchant platform.
            </p>
            <a href={getMerchantSignupUrl()} style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'underline' }}>
              Click here if you are not redirected automatically →
            </a>
          </div>
        );
      case '/onboarding':
      case '/onboarding/business':
      case '/onboarding/upi':
      case '/onboarding/email':
      case '/onboarding/android':
      case '/onboarding/templates':
      case '/onboarding/review':
        return (
          <div style={{ textAlign: 'center', padding: '100px 20px', minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '20px', color: '#111827', marginBottom: '8px' }}>Redirecting to Merchant Onboarding...</h2>
            <a href={APP_URLS.merchantDashboard} style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'underline' }}>
              Click here if you are not redirected automatically →
            </a>
          </div>
        );
      case '/':
      default:
        return <HomePage onNavigate={navigateTo} />;
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F9FAFB' }}>
      <Navbar currentPath={currentPath} onNavigate={navigateTo} isAuthenticated={false} />
      <main style={{ flex: 1 }}>{renderContent()}</main>
      <Footer onNavigate={navigateTo} />
    </div>
  );
}
