import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AuthService, IAuthRepository } from './index.js';
import { security } from '../../utils/security.js';

class MockAuthRepository implements IAuthRepository {
  users: Map<string, any> = new Map();
  merchants: Map<string, any> = new Map();

  async findUserByEmail(email: string) {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return { ...u };
    }
    return null;
  }

  async findUserById(userId: string) {
    const u = this.users.get(userId);
    return u ? { ...u } : null;
  }

  async findUserByRefreshTokenHash(hash: string) {
    for (const u of this.users.values()) {
      if (u.refreshTokenHash === hash) return { ...u };
    }
    return null;
  }

  async createMerchant(data: any) {
    const id = `mer_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const record = { _id: id, id, ...data };
    this.merchants.set(id, record);
    return record;
  }

  async createUser(data: any) {
    const id = `usr_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const record = { _id: id, id, ...data };
    this.users.set(id, record);
    return record;
  }

  async updateUserRefreshToken(userId: string, tokenHash: string | null) {
    const u = this.users.get(userId);
    if (u) {
      u.refreshTokenHash = tokenHash;
      this.users.set(userId, u);
    }
  }

  async findMerchantById(merchantId: string) {
    const m = this.merchants.get(merchantId);
    return m ? { ...m } : null;
  }
}

describe('AuthService — Merchant Registration & Authentication', () => {
  it('registers a new merchant and associated admin user successfully', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    const result = await authService.register({
      email: 'owner@retail.com',
      password: 'password123',
      merchantName: 'Retail Corp',
      upiVpa: 'retail@okhdfcbank'
    });

    assert.ok(result.tokens.accessToken);
    assert.ok(result.tokens.refreshToken);
    assert.strictEqual(result.user.email, 'owner@retail.com');
    assert.strictEqual(result.user.role, 'MERCHANT_ADMIN');
    assert.ok(result.user.merchantId);

    // Verify merchant record was saved with proper UPI config
    const merchant = await repo.findMerchantById(result.user.merchantId);
    assert.ok(merchant);
    assert.strictEqual(merchant.name, 'Retail Corp');
    assert.strictEqual(merchant.upiConfig.vpa, 'retail@okhdfcbank');
    assert.strictEqual(merchant.upiConfig.isAcceptingPayments, true);

    // Verify password was securely hashed (not stored in plaintext)
    const savedUser = await repo.findUserById(result.user.id);
    assert.ok(savedUser);
    assert.notStrictEqual(savedUser.passwordHash, 'password123');
    assert.strictEqual(await security.verifyPassword('password123', savedUser.passwordHash), true);
  });

  it('rejects duplicate email registration with 409 conflict', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    await authService.register({
      email: 'duplicate@test.com',
      password: 'password123',
      merchantName: 'Store One',
      upiVpa: 'store1@okhdfcbank'
    });

    await assert.rejects(
      async () => {
        await authService.register({
          email: 'duplicate@test.com',
          password: 'anotherPassword123',
          merchantName: 'Store Two',
          upiVpa: 'store2@okhdfcbank'
        });
      },
      (err: any) => err.code === 'EMAIL_ALREADY_EXISTS' && err.statusCode === 409
    );
  });

  it('rejects invalid UPI ID formats on registration with 400', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    await assert.rejects(
      async () => {
        await authService.register({
          email: 'badupi@test.com',
          password: 'password123',
          merchantName: 'Bad UPI Store',
          upiVpa: 'no-at-sign'
        });
      }
    );
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    await assert.rejects(
      async () => {
        await authService.register({
          email: 'shortpass@test.com',
          password: '123',
          merchantName: 'Store Short',
          upiVpa: 'short@upi'
        });
      }
    );
  });

  it('authenticates valid credentials and generates tokens', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    await authService.register({
      email: 'login@test.com',
      password: 'correctPassword123',
      merchantName: 'Login Store',
      upiVpa: 'login@upi'
    });

    const loginRes = await authService.login({
      email: 'login@test.com',
      password: 'correctPassword123'
    });

    assert.ok(loginRes.tokens.accessToken);
    assert.ok(loginRes.tokens.refreshToken);
    assert.strictEqual(loginRes.user.email, 'login@test.com');
  });

  it('rejects login with wrong password (401)', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    await authService.register({
      email: 'wrongpass@test.com',
      password: 'correctPassword123',
      merchantName: 'Store',
      upiVpa: 'store@upi'
    });

    await assert.rejects(
      async () => {
        await authService.login({
          email: 'wrongpass@test.com',
          password: 'WRONG_PASSWORD'
        });
      },
      (err: any) => err.code === 'INVALID_CREDENTIALS' && err.statusCode === 401
    );
  });

  it('rotates refresh token and issues new access token', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    const initial = await authService.register({
      email: 'refresh@test.com',
      password: 'password123',
      merchantName: 'Refresh Store',
      upiVpa: 'refresh@upi'
    });

    const refreshed = await authService.refreshTokens(initial.tokens.refreshToken);

    assert.ok(refreshed.accessToken);
    assert.ok(refreshed.refreshToken);
    assert.notStrictEqual(refreshed.refreshToken, initial.tokens.refreshToken);

    // Old refresh token must be invalidated (single-use rotation)
    await assert.rejects(
      async () => {
        await authService.refreshTokens(initial.tokens.refreshToken);
      },
      (err: any) => err.code === 'INVALID_REFRESH_TOKEN' && err.statusCode === 401
    );
  });

  it('logout revokes the refresh token', async () => {
    const repo = new MockAuthRepository();
    const authService = new AuthService(repo);

    const initial = await authService.register({
      email: 'logout@test.com',
      password: 'password123',
      merchantName: 'Logout Store',
      upiVpa: 'logout@upi'
    });

    await authService.logout(initial.user.id);

    // Reusing the logged-out refresh token must fail
    await assert.rejects(
      async () => {
        await authService.refreshTokens(initial.tokens.refreshToken);
      },
      (err: any) => err.code === 'INVALID_REFRESH_TOKEN'
    );
  });
});
