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
import { AuthPage } from './pages/AuthPages.js';
import { OnboardingWizard } from './pages/OnboardingWizard.js';
import { AndroidDownloadPage } from './pages/AndroidDownloadPage.js';
import { APP_URLS } from './config/urls.js';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('rgs_access_token');
  });

  // Keep state synchronized with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    window.history.pushState({}, '', path);
    window.scrollTo(0, 0);
  };

  const handleAuthSuccess = (newToken: string, _user: any, _merchant: any) => {
    setToken(newToken);
    navigateTo('/onboarding');
  };

  const handleOnboardingComplete = () => {
    window.location.href = APP_URLS.merchantDashboard;
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
        return <AuthPage mode="login" onNavigate={navigateTo} onAuthSuccess={handleAuthSuccess} />;
      case '/register':
        return <AuthPage mode="register" onNavigate={navigateTo} onAuthSuccess={handleAuthSuccess} />;
      case '/onboarding':
      case '/onboarding/business':
      case '/onboarding/upi':
      case '/onboarding/email':
      case '/onboarding/android':
      case '/onboarding/templates':
      case '/onboarding/review':
        return token ? (
          <OnboardingWizard token={token} onNavigate={navigateTo} onComplete={handleOnboardingComplete} />
        ) : (
          <AuthPage mode="login" onNavigate={navigateTo} onAuthSuccess={handleAuthSuccess} />
        );
      case '/':
      default:
        return <HomePage onNavigate={navigateTo} />;
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F9FAFB' }}>
      <Navbar currentPath={currentPath} onNavigate={navigateTo} isAuthenticated={Boolean(token)} />
      <main style={{ flex: 1 }}>{renderContent()}</main>
      <Footer onNavigate={navigateTo} />
    </div>
  );
}
