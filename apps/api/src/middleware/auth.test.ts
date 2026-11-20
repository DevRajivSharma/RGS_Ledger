import { describe, it } from 'node:test';
import assert from 'node:assert';
import { requireAuth } from './auth.js';

describe('Auth Middleware', () => {
  it('rejects request with missing Authorization header (401)', async () => {
    let statusCode = 0;
    let responseData: any = null;

    const req: any = { headers: {} };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await requireAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseData?.error?.code, 'UNAUTHORIZED');
    assert.strictEqual(nextCalled, false);
  });

  it('rejects request with non-Bearer Authorization header format (401)', async () => {
    let statusCode = 0;
    let responseData: any = null;

    const req: any = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await requireAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseData?.error?.code, 'UNAUTHORIZED');
    assert.strictEqual(nextCalled, false);
  });

  it('rejects request with invalid or tampered token (401)', async () => {
    let statusCode = 0;
    let responseData: any = null;

    const req: any = { headers: { authorization: 'Bearer invalid.tampered.token' } };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await requireAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseData?.error?.code, 'INVALID_TOKEN');
    assert.strictEqual(nextCalled, false);
  });
});
