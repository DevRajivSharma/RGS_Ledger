import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const websiteRoot = path.resolve(__dirname, '..');

describe('Google OAuth Branding & Legal Pages Verification', () => {
  const privacyHtmlPath = path.join(websiteRoot, 'public', 'privacy', 'index.html');
  const termsHtmlPath = path.join(websiteRoot, 'public', 'terms', 'index.html');
  const indexHtmlPath = path.join(websiteRoot, 'index.html');
  const robotsTxtPath = path.join(websiteRoot, 'public', 'robots.txt');
  const sitemapXmlPath = path.join(websiteRoot, 'public', 'sitemap.xml');
  const vercelJsonPath = path.join(websiteRoot, 'vercel.json');
  const redirectsPath = path.join(websiteRoot, 'public', '_redirects');
  const legalPagesTsxPath = path.join(websiteRoot, 'src', 'pages', 'LegalPages.tsx');
  const footerTsxPath = path.join(websiteRoot, 'src', 'components', 'Footer.tsx');
  const navbarTsxPath = path.join(websiteRoot, 'src', 'components', 'Navbar.tsx');

  it('verifies public/privacy/index.html exists and is valid standalone zero-JS HTML', () => {
    assert.ok(fs.existsSync(privacyHtmlPath), 'privacy/index.html must exist');
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

  it('verifies public/terms/index.html exists and reflects non-custodial UPI platform', () => {
    assert.ok(fs.existsSync(termsHtmlPath), 'terms/index.html must exist');
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

  it('verifies vercel.json and _redirects route /privacy and /terms directly to static pages', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    assert.ok(Array.isArray(vercelConfig.rewrites), 'vercel.json must define rewrites');
    const privacyRewrite = vercelConfig.rewrites.find((r: { source: string }) => r.source === '/privacy');
    assert.ok(privacyRewrite, 'Must have /privacy rewrite');
    assert.equal(privacyRewrite.destination, '/privacy/index.html');

    const termsRewrite = vercelConfig.rewrites.find((r: { source: string }) => r.source === '/terms');
    assert.ok(termsRewrite, 'Must have /terms rewrite');
    assert.equal(termsRewrite.destination, '/terms/index.html');

    const redirects = fs.readFileSync(redirectsPath, 'utf-8');
    assert.match(redirects, /\/privacy\s+\/privacy\/index\.html\s+200/);
    assert.match(redirects, /\/terms\s+\/terms\/index\.html\s+200/);
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

  it('verifies Footer and Navbar use semantic visible <a> links for privacy and terms', () => {
    const footerContent = fs.readFileSync(footerTsxPath, 'utf-8');
    assert.ok(footerContent.includes('href="/privacy"'), 'Footer must have semantic <a href="/privacy">');
    assert.ok(footerContent.includes('href="/terms"'), 'Footer must have semantic <a href="/terms">');

    const navbarContent = fs.readFileSync(navbarTsxPath, 'utf-8');
    assert.ok(navbarContent.includes('href={item.path}'), 'Navbar must use semantic <a href={item.path}> links');
  });

  it('verifies production build dist directory contains static privacy and terms pages', () => {
    const distPrivacyPath = path.join(websiteRoot, 'dist', 'privacy', 'index.html');
    const distTermsPath = path.join(websiteRoot, 'dist', 'terms', 'index.html');
    assert.ok(fs.existsSync(distPrivacyPath), 'dist/privacy/index.html must exist after build');
    assert.ok(fs.existsSync(distTermsPath), 'dist/terms/index.html must exist after build');

    const distPrivacyContent = fs.readFileSync(distPrivacyPath, 'utf-8');
    assert.match(
      distPrivacyContent,
      /adhere to the.*Google API Services User Data Policy.*including the Limited Use requirements/is
    );
  });
});
