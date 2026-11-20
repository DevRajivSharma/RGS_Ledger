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
import { getMerchantLoginUrl } from './config/urls.js';

const isAuthOrOnboardingPath = (path: string): boolean => {
  const p = path.split('?')[0] || '';
  return p === '/login' || p === '/signup' || p === '/register' || p.startsWith('/onboarding');
};

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  // Client-side authentication redirect enforcement
  // Public website must never host login or signup flows.
  useEffect(() => {
    if (isAuthOrOnboardingPath(window.location.pathname)) {
      window.location.replace(getMerchantLoginUrl(window.location.search));
    }
  }, []);

  // Keep state synchronized with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname || '/';
      if (isAuthOrOnboardingPath(path)) {
        window.location.replace(getMerchantLoginUrl(window.location.search));
        return;
      }
      setCurrentPath(path);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (isAuthOrOnboardingPath(path)) {
      const search = path.includes('?') ? path.slice(path.indexOf('?')) : undefined;
      window.location.href = getMerchantLoginUrl(search);
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
      case '/signup':
      case '/register':
      case '/onboarding':
      case '/onboarding/business':
      case '/onboarding/upi':
      case '/onboarding/email':
      case '/onboarding/android':
      case '/onboarding/templates':
      case '/onboarding/review':
        return (
          <div style={{ textAlign: 'center', padding: '100px 20px', minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '20px', color: '#111827', marginBottom: '8px' }}>Redirecting to Merchant Portal...</h2>
            <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '16px' }}>
              Authentication is managed securely at the merchant application root.
            </p>
            <a href={getMerchantLoginUrl()} style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'underline' }}>
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
