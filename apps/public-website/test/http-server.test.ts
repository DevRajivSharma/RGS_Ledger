import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

describe('HTTP Production Static Server Verification', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    // Basic static web server simulating Vercel cleanUrls, redirects, and static folder resolution
    server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const search = (req.url || '').includes('?') ? (req.url || '').slice((req.url || '').indexOf('?')) : '';

      // 1. Redirects (as configured in vercel.json)
      if (urlPath === '/login') {
        res.writeHead(302, { Location: `https://app.rgsledger.rajivsharma.online/login${search}` });
        res.end();
        return;
      }
      if (urlPath === '/signup' || urlPath === '/register') {
        res.writeHead(302, { Location: `https://app.rgsledger.rajivsharma.online/signup${search}` });
        res.end();
        return;
      }

      // 2. Static file resolution
      let filePath: string;
      if (urlPath === '/' || urlPath === '') {
        filePath = path.join(distDir, 'index.html');
      } else if (urlPath === '/privacy') {
        filePath = path.join(distDir, 'privacy.html');
      } else if (urlPath === '/privacy/') {
        filePath = path.join(distDir, 'privacy', 'index.html');
      } else if (urlPath === '/terms') {
        filePath = path.join(distDir, 'terms.html');
      } else if (urlPath === '/terms/') {
        filePath = path.join(distDir, 'terms', 'index.html');
      } else {
        const potentialPath = path.join(distDir, urlPath);
        if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
          filePath = potentialPath;
        } else {
          filePath = path.join(distDir, 'index.html'); // SPA fallback
        }
      }

      if (fs.existsSync(filePath)) {
        let contentType = 'text/html; charset=utf-8';
        if (filePath.endsWith('.txt')) contentType = 'text/plain; charset=utf-8';
        if (filePath.endsWith('.xml')) contentType = 'application/xml; charset=utf-8';
        if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('serves / with HTTP 200 and valid HTML containing canonical domain and noscript links', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<!DOCTYPE html>'));
    assert.ok(text.includes('https://rgsledger.rajivsharma.online'));
    assert.ok(text.includes('<noscript>'));
    assert.ok(text.includes('href="/privacy"'));
    assert.ok(text.includes('href="/terms"'));
  });

  it('serves /privacy with HTTP 200 and Google Limited Use disclosure without requiring JavaScript', async () => {
    const res = await fetch(`${baseUrl}/privacy`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
    const text = await res.text();
    assert.ok(text.includes('<!DOCTYPE html>'));
    assert.ok(text.includes('Privacy Policy — RGS Ledger'));
    assert.match(text, /adhere to the.*Google API Services User Data Policy.*including the Limited Use requirements/is);
    assert.ok(text.includes('https://www.googleapis.com/auth/gmail.readonly'));
    assert.ok(text.includes('privacy@rajivsharma.online'));
  });

  it('serves /terms with HTTP 200 and non-custodial declaration without requiring JavaScript', async () => {
    const res = await fetch(`${baseUrl}/terms`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
    const text = await res.text();
    assert.ok(text.includes('<!DOCTYPE html>'));
    assert.ok(text.includes('Terms of Service — RGS Ledger'));
    assert.match(text, /non-custodial/i);
  });

  it('redirects /login with HTTP 302 to merchant application preserving query params', async () => {
    const res = await fetch(`${baseUrl}/login?returnTo=/settings&theme=dark`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(
      res.headers.get('location'),
      'https://app.rgsledger.rajivsharma.online/login?returnTo=/settings&theme=dark'
    );
  });

  it('redirects /signup and /register with HTTP 302 to merchant application preserving query params', async () => {
    const res1 = await fetch(`${baseUrl}/signup?plan=pro`, { redirect: 'manual' });
    assert.equal(res1.status, 302);
    assert.equal(res1.headers.get('location'), 'https://app.rgsledger.rajivsharma.online/signup?plan=pro');

    const res2 = await fetch(`${baseUrl}/register?ref=partner1`, { redirect: 'manual' });
    assert.equal(res2.status, 302);
    assert.equal(res2.headers.get('location'), 'https://app.rgsledger.rajivsharma.online/signup?ref=partner1');
  });

  it('serves /robots.txt with HTTP 200 and points to the sitemap', async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Sitemap: https://rgsledger.rajivsharma.online/sitemap.xml'));
  });

  it('serves /sitemap.xml with HTTP 200 and application/xml content type', async () => {
    const res = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(res.status, 200);
    assert.ok(
      res.headers.get('content-type')?.includes('application/xml') ||
      res.headers.get('content-type')?.includes('text/xml')
    );
    const text = await res.text();
    assert.ok(text.includes('https://rgsledger.rajivsharma.online/privacy'));
    assert.ok(text.includes('https://rgsledger.rajivsharma.online/terms'));
  });
});
