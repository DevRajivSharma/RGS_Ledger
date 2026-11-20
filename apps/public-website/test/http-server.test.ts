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

      // Static file resolution & rewrites (as configured in vercel.json)
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

  it('serves SPA fallback index.html with HTTP 200 for /login without unintended redirects', async () => {
    const res = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<!DOCTYPE html>'));
    assert.ok(text.includes('RGS Ledger'));
  });

  it('serves SPA fallback index.html with HTTP 200 for /signup and /register without unintended redirects', async () => {
    const res1 = await fetch(`${baseUrl}/signup`, { redirect: 'manual' });
    assert.equal(res1.status, 200);
    const text1 = await res1.text();
    assert.ok(text1.includes('<!DOCTYPE html>'));

    const res2 = await fetch(`${baseUrl}/register`, { redirect: 'manual' });
    assert.equal(res2.status, 200);
    const text2 = await res2.text();
    assert.ok(text2.includes('<!DOCTYPE html>'));
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
