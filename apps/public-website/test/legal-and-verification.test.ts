import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMerchantLoginUrl, getMerchantSignupUrl, APP_URLS } from '../src/config/urls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const websiteRoot = path.resolve(__dirname, '..');

describe('Google OAuth Branding & Legal Pages Verification', () => {
  const privacyHtmlPath = path.join(websiteRoot, 'public', 'privacy', 'index.html');
  const privacyFlatHtmlPath = path.join(websiteRoot, 'public', 'privacy.html');
  const termsHtmlPath = path.join(websiteRoot, 'public', 'terms', 'index.html');
  const termsFlatHtmlPath = path.join(websiteRoot, 'public', 'terms.html');
  const indexHtmlPath = path.join(websiteRoot, 'index.html');
  const robotsTxtPath = path.join(websiteRoot, 'public', 'robots.txt');
  const sitemapXmlPath = path.join(websiteRoot, 'public', 'sitemap.xml');
  const vercelJsonPath = path.join(websiteRoot, 'vercel.json');
  const redirectsPath = path.join(websiteRoot, 'public', '_redirects');
  const legalPagesTsxPath = path.join(websiteRoot, 'src', 'pages', 'LegalPages.tsx');
  const footerTsxPath = path.join(websiteRoot, 'src', 'components', 'Footer.tsx');
  const navbarTsxPath = path.join(websiteRoot, 'src', 'components', 'Navbar.tsx');
  const homePageTsxPath = path.join(websiteRoot, 'src', 'pages', 'HomePage.tsx');
  const productPageTsxPath = path.join(websiteRoot, 'src', 'pages', 'ProductPage.tsx');
  const howItWorksPageTsxPath = path.join(websiteRoot, 'src', 'pages', 'HowItWorksPage.tsx');
  const featuresPageTsxPath = path.join(websiteRoot, 'src', 'pages', 'FeaturesPage.tsx');
  const pricingPageTsxPath = path.join(websiteRoot, 'src', 'pages', 'PricingPage.tsx');
  const appTsxPath = path.join(websiteRoot, 'src', 'App.tsx');

  it('verifies public/privacy/index.html and privacy.html exist as standalone zero-JS HTML', () => {
    assert.ok(fs.existsSync(privacyHtmlPath), 'privacy/index.html must exist');
    assert.ok(fs.existsSync(privacyFlatHtmlPath), 'privacy.html must exist');
    const content = fs.readFileSync(privacyHtmlPath, 'utf-8');

    // HTTP / HTML structure
    assert.match(content, /<!DOCTYPE html>/i);
    assert.match(content, /<html/i);
    assert.match(content, /<title>Privacy Policy/i);

    // Google API Limited Use Requirements (exact wording required by Google OAuth review)
    assert.match(
      content,
      /adhere to the.*Google API Services User Data Policy.*including the Limited Use requirements/is,
      'Must contain Google Limited Use clause verbatim'
    );

    // Scope disclosure
    assert.ok(
      content.includes('https://www.googleapis.com/auth/gmail.readonly'),
      'Must explicitly state the gmail.readonly scope'
    );

    // Non-custodial disclosure
    assert.match(content, /non-custodial/i, 'Must state non-custodial architecture');

    // Contact & domain
    assert.ok(content.includes('privacy@rajivsharma.online'), 'Must list contact email');
    assert.ok(content.includes('https://rgsledger.rajivsharma.online'), 'Must cite verified domain');

    // Data retention and Google Account permissions link
    assert.ok(content.includes('https://myaccount.google.com/permissions'), 'Must link to Google Account security page');
    assert.match(content, /90[- ]day/i, 'Must disclose data retention window');
  });

  it('verifies public/terms/index.html and terms.html exist and reflect non-custodial UPI platform', () => {
    assert.ok(fs.existsSync(termsHtmlPath), 'terms/index.html must exist');
    assert.ok(fs.existsSync(termsFlatHtmlPath), 'terms.html must exist');
    const content = fs.readFileSync(termsHtmlPath, 'utf-8');

    assert.match(content, /<!DOCTYPE html>/i);
    assert.match(content, /<title>Terms of Service/i);
    assert.match(content, /non-custodial/i, 'Must state non-custodial nature');
    assert.ok(content.includes('privacy@rajivsharma.online') || content.includes('support@rajivsharma.online'), 'Must have contact info');
  });

  it('verifies index.html has correct canonical URL and noscript legal fallback', () => {
    const content = fs.readFileSync(indexHtmlPath, 'utf-8');
    assert.ok(!content.includes('https://rgsledger.com'), 'Must not reference outdated rgsledger.com domain');
    assert.ok(content.includes('https://rgsledger.rajivsharma.online'), 'Must reference verified production domain');
    assert.ok(content.includes('<noscript>'), 'Must provide noscript fallback for bots/crawlers');
    assert.ok(content.includes('href="/privacy"'), 'Noscript must contain privacy policy link');
    assert.ok(content.includes('href="/terms"'), 'Noscript must contain terms link');
  });

  it('verifies robots.txt and sitemap.xml point to the verified domain', () => {
    const robots = fs.readFileSync(robotsTxtPath, 'utf-8');
    assert.ok(!robots.includes('rgsledger.com'), 'robots.txt must not contain rgsledger.com');
    assert.ok(robots.includes('https://rgsledger.rajivsharma.online/sitemap.xml'), 'robots.txt must point to verified sitemap');

    const sitemap = fs.readFileSync(sitemapXmlPath, 'utf-8');
    assert.ok(!sitemap.includes('rgsledger.com'), 'sitemap.xml must not contain rgsledger.com');
    assert.ok(sitemap.includes('https://rgsledger.rajivsharma.online/privacy'), 'sitemap.xml must index /privacy');
    assert.ok(sitemap.includes('https://rgsledger.rajivsharma.online/terms'), 'sitemap.xml must index /terms');
  });

  it('verifies vercel.json defines rewrites for /privacy, /terms and has no unintended redirects', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    
    // Unintended redirects targeting nonexistent merchant routes must not exist
    if (vercelConfig.redirects) {
      const badLoginRedirect = vercelConfig.redirects.find((r: { destination: string }) => r.destination.includes('/login'));
      const badSignupRedirect = vercelConfig.redirects.find((r: { destination: string }) => r.destination.includes('/signup'));
      assert.ok(!badLoginRedirect, 'vercel.json must not redirect to nonexistent /login');
      assert.ok(!badSignupRedirect, 'vercel.json must not redirect to nonexistent /signup');
    }

    assert.ok(Array.isArray(vercelConfig.rewrites), 'vercel.json must define rewrites');
    const privacyRewrite = vercelConfig.rewrites.find((r: { source: string }) => r.source === '/privacy');
    assert.ok(privacyRewrite, 'Must have /privacy rewrite');

    const termsRewrite = vercelConfig.rewrites.find((r: { source: string }) => r.source === '/terms');
    assert.ok(termsRewrite, 'Must have /terms rewrite');

    const redirects = fs.readFileSync(redirectsPath, 'utf-8');
    assert.ok(!redirects.includes('/login'), '_redirects must not contain redirects targeting nonexistent /login');
    assert.ok(!redirects.includes('/signup'), '_redirects must not contain redirects targeting nonexistent /signup');
    assert.ok(!redirects.includes('/register'), '_redirects must not contain redirects targeting nonexistent /register');
    assert.match(redirects, /\/privacy\s+\/privacy\.html\s+200/);
    assert.match(redirects, /\/terms\s+\/terms\.html\s+200/);
  });

  it('verifies authentication helper functions point to merchant root and filter unsupported query params', () => {
    // getMerchantLoginUrl and getMerchantSignupUrl must return the merchant dashboard root
    const loginUrl = getMerchantLoginUrl();
    assert.equal(loginUrl, 'https://app.rgsledger.rajivsharma.online/');

    const signupUrl = getMerchantSignupUrl();
    assert.equal(signupUrl, 'https://app.rgsledger.rajivsharma.online/');

    // Unsupported query parameters must be omitted
    const loginWithUnsupported = getMerchantLoginUrl('?returnTo=/settings&theme=dark');
    assert.equal(loginWithUnsupported, 'https://app.rgsledger.rajivsharma.online/');

    const signupWithUnsupported = getMerchantSignupUrl('?plan=pro');
    assert.equal(signupWithUnsupported, 'https://app.rgsledger.rajivsharma.online/');

    // Supported parameters (e.g. OAuth callback) must be preserved
    const oauthUrl = getMerchantLoginUrl('?status=connected&email=merchant@example.com');
    assert.ok(oauthUrl.includes('status=connected'));
    assert.ok(oauthUrl.includes('merchant%40example.com'));

    // Neither helper must point to nonexistent /login or /signup
    assert.ok(!loginUrl.includes('/login'), 'getMerchantLoginUrl must not point to nonexistent /login');
    assert.ok(!signupUrl.includes('/signup'), 'getMerchantSignupUrl must not point to nonexistent /signup');
  });

  it('verifies App.tsx enforces client-side redirects and does not host auth forms', () => {
    const appContent = fs.readFileSync(appTsxPath, 'utf-8');
    assert.ok(!appContent.includes('<AuthPage'), 'Public website App.tsx must not render AuthPage');
    assert.ok(!appContent.includes('<OnboardingWizard'), 'Public website App.tsx must not render OnboardingWizard');
    assert.ok(appContent.includes('getMerchantLoginUrl'), 'App.tsx must use getMerchantLoginUrl');
    assert.ok(!appContent.includes("navigateTo('/login')"), 'App.tsx must not navigate to /login');
    assert.ok(!appContent.includes("navigateTo('/signup')"), 'App.tsx must not navigate to /signup');
  });

  it('verifies every CTA across pages points to merchant application signup or login', () => {
    const navbarContent = fs.readFileSync(navbarTsxPath, 'utf-8');
    assert.ok(navbarContent.includes('getMerchantLoginUrl'), 'Navbar must link Sign In to merchant login');
    assert.ok(navbarContent.includes('getMerchantSignupUrl'), 'Navbar must link Get Started to merchant signup');

    const homeContent = fs.readFileSync(homePageTsxPath, 'utf-8');
    assert.ok(homeContent.includes('getMerchantSignupUrl()'), 'HomePage CTAs must link to merchant signup');

    const productContent = fs.readFileSync(productPageTsxPath, 'utf-8');
    assert.ok(productContent.includes('getMerchantSignupUrl()'), 'ProductPage CTA must link to merchant signup');

    const howItWorksContent = fs.readFileSync(howItWorksPageTsxPath, 'utf-8');
    assert.ok(howItWorksContent.includes('getMerchantSignupUrl()'), 'HowItWorks CTA must link to merchant signup');

    const featuresContent = fs.readFileSync(featuresPageTsxPath, 'utf-8');
    assert.ok(featuresContent.includes('getMerchantSignupUrl()'), 'Features CTA must link to merchant signup');

    const pricingContent = fs.readFileSync(pricingPageTsxPath, 'utf-8');
    assert.ok(pricingContent.includes('getMerchantSignupUrl()'), 'Pricing CTA must link to merchant signup');
  });

  it('verifies React LegalPages component has matching Google Limited Use disclosure', () => {
    const content = fs.readFileSync(legalPagesTsxPath, 'utf-8');
    assert.ok(
      content.includes('adhere to the Google API Services User Data Policy, including the Limited Use requirements'),
      'LegalPages.tsx must include verbatim Google Limited Use disclosure'
    );
    assert.ok(
      content.includes('https://www.googleapis.com/auth/gmail.readonly'),
      'LegalPages.tsx must state gmail.readonly scope'
    );
    assert.ok(
      content.includes('https://myaccount.google.com/permissions'),
      'LegalPages.tsx must link to Google Account security page'
    );
  });

  it('verifies production build dist directory contains static privacy, terms, and sitemap', () => {
    const distPrivacyPath = path.join(websiteRoot, 'dist', 'privacy', 'index.html');
    const distPrivacyFlatPath = path.join(websiteRoot, 'dist', 'privacy.html');
    const distTermsPath = path.join(websiteRoot, 'dist', 'terms', 'index.html');
    const distTermsFlatPath = path.join(websiteRoot, 'dist', 'terms.html');
    const distSitemapPath = path.join(websiteRoot, 'dist', 'sitemap.xml');

    assert.ok(fs.existsSync(distPrivacyPath), 'dist/privacy/index.html must exist after build');
    assert.ok(fs.existsSync(distPrivacyFlatPath), 'dist/privacy.html must exist after build');
    assert.ok(fs.existsSync(distTermsPath), 'dist/terms/index.html must exist after build');
    assert.ok(fs.existsSync(distTermsFlatPath), 'dist/terms.html must exist after build');
    assert.ok(fs.existsSync(distSitemapPath), 'dist/sitemap.xml must exist after build');

    const distPrivacyContent = fs.readFileSync(distPrivacyPath, 'utf-8');
    assert.match(
      distPrivacyContent,
      /adhere to the.*Google API Services User Data Policy.*including the Limited Use requirements/is
    );

    const distSitemapContent = fs.readFileSync(distSitemapPath, 'utf-8');
    assert.ok(distSitemapContent.includes('https://rgsledger.rajivsharma.online/privacy'));
    assert.ok(distSitemapContent.includes('https://rgsledger.rajivsharma.online/terms'));
  });
});
