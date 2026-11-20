import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createApp } from './app.js';

describe('API App Initialization', () => {
  it('creates express app instance successfully', () => {
    const app = createApp();
    assert.ok(app);
    assert.strictEqual(typeof app.listen, 'function');
  });
});
