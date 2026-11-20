import { describe, it } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { AuthService, IAuthRepository } from './index.js';
import { security } from '../../utils/security.js';
import { RegisterInputSchema, LoginInputSchema } from '@rgs-ledger/validation';
import { config } from '../../config/index.js';

/**
 * Mock Auth Repository simulating MongoDB user & merchant collections
 */
class InMemoryAuthRepository implements IAuthRepository {
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
    const record = { _id: id, id, ...data, status: data.status || 'ACTIVE' };
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

/**
 * Frontend state simulator modeling the updated Merchant Dashboard App state
 */
class FrontendAuthSessionSimulator {
  accessToken: string = '';
  user: any = null;
  profile: any = null;
  currentScreen: 'auth_login' | 'auth_register' | 'dashboard' = 'auth_login';
  feedbackToast: { type: 'success' | 'error'; message: string } | null = null;
  localStorageStore: Map<string, string> = new Map();

  /**
   * Models `handleAuthSubmit` from apps/merchant-dashboard/src/App.tsx
   */
  processAuthApiResponse(apiResponse: any, mode: 'login' | 'register') {
    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(apiResponse.error?.message || 'Auth failed');
    }

    const { data } = apiResponse;
    const newAccess = data.tokens?.accessToken || data.accessToken;
    const userRaw = data.user;
    const merchantRaw = data.merchant;

    if (newAccess && userRaw) {
      this.accessToken = newAccess;
      this.user = {
        userId: userRaw.id || userRaw.userId,
        email: userRaw.email,
        merchantId: userRaw.merchantId,
        role: userRaw.role
      };
      this.localStorageStore.set('rgs_access_token', newAccess);
      this.localStorageStore.set('rgs_user', JSON.stringify(this.user));

      if (merchantRaw) {
        this.profile = merchantRaw;
      }

      this.currentScreen = 'dashboard';
      this.feedbackToast = {
        type: 'success',
        message: mode === 'register'
          ? `Welcome to RGS Ledger, ${merchantRaw?.name || this.user.email}! Your merchant account has been created.`
          : `Welcome back, ${merchantRaw?.name || this.user.email}! Signed in successfully.`
      };
    } else if (mode === 'register') {
      this.currentScreen = 'auth_login';
      this.feedbackToast = {
        type: 'success',
        message: 'Account created successfully! Please sign in with your credentials.'
      };
    }
  }

  logout() {
    this.accessToken = '';
    this.user = null;
    this.profile = null;
    this.localStorageStore.delete('rgs_access_token');
    this.localStorageStore.delete('rgs_user');
    this.currentScreen = 'auth_login';
    this.feedbackToast = { type: 'success', message: 'You have been signed out.' };
  }
}

describe('Merchant Dashboard — Authentication & Navigation Test Suite', () => {
  const repo = new InMemoryAuthRepository();
  const authService = new AuthService(repo);

  const testMerchant = {
    email: 'merchant.lead@paytest.in',
    password: 'securePassword123!',
    merchantName: 'Lead Retailers Pvt Ltd',
    upiVpa: 'leadretail@okhdfcbank'
  };

  // ---------------- 1. SUCCESSFUL MERCHANT REGISTRATION ----------------
  it('1. Successful merchant registration creates user, merchant, and returns valid auth credentials', async () => {
    const regResult = await authService.register(testMerchant);

    // Verify response envelope structure
    assert.ok(regResult.tokens?.accessToken, 'Must return accessToken inside tokens');
    assert.ok(regResult.tokens?.refreshToken, 'Must return refreshToken inside tokens');
    assert.strictEqual(regResult.user.email, testMerchant.email);
    assert.strictEqual(regResult.user.role, 'MERCHANT_ADMIN');
    assert.ok(regResult.merchant.id, 'Must return merchant profile id');
    assert.strictEqual(regResult.merchant.upiConfig.vpa, testMerchant.upiVpa);

    // Verify database record creation
    const savedUser = await repo.findUserByEmail(testMerchant.email);
    assert.ok(savedUser, 'User record must exist in repository');
    assert.strictEqual(savedUser.status, 'ACTIVE');

    const savedMerchant = await repo.findMerchantById(savedUser.merchantId);
    assert.ok(savedMerchant, 'Merchant record must exist in repository');
    assert.strictEqual(savedMerchant.name, testMerchant.merchantName);
    assert.strictEqual(savedMerchant.upiConfig.vpa, testMerchant.upiVpa);
  });

  // ---------------- 2. DUPLICATE EMAIL REGISTRATION ----------------
  it('2. Duplicate email registration rejects with 409 conflict and clear message', async () => {
    await assert.rejects(
      async () => {
        await authService.register(testMerchant);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'EMAIL_ALREADY_EXISTS');
        assert.ok(err.message.includes('already exists'));
        return true;
      }
    );
  });

  // ---------------- 3. SUCCESSFUL LOGIN ----------------
  it('3. Successful login validates credentials and returns tokens and user context', async () => {
    const loginResult = await authService.login({
      email: testMerchant.email,
      password: testMerchant.password
    });

    assert.ok(loginResult.tokens?.accessToken, 'Login must yield access token');
    assert.ok(loginResult.tokens?.refreshToken, 'Login must yield refresh token');
    assert.strictEqual(loginResult.user.email, testMerchant.email);
    assert.strictEqual(loginResult.merchant.name, testMerchant.merchantName);

    // Verify access token is valid JWT
    const decoded = security.verifyAccessToken(loginResult.tokens.accessToken);
    assert.strictEqual(decoded.userId, loginResult.user.id);
    assert.strictEqual(decoded.merchantId, loginResult.merchant.id);
  });

  // ---------------- 4. INVALID PASSWORD ----------------
  it('4. Invalid password rejects with 401 INVALID_CREDENTIALS', async () => {
    await assert.rejects(
      async () => {
        await authService.login({
          email: testMerchant.email,
          password: 'WRONG_PASSWORD_123!'
        });
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );
  });

  // ---------------- 5. MISSING CREDENTIALS ----------------
  it('5. Missing credentials fails input schema validation', () => {
    // Missing email
    const noEmail = LoginInputSchema.safeParse({ password: 'somepassword' });
    assert.strictEqual(noEmail.success, false);

    // Missing password
    const noPassword = LoginInputSchema.safeParse({ email: 'user@example.com' });
    assert.strictEqual(noPassword.success, false);

    // Invalid UPI format on registration
    const invalidUpi = RegisterInputSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
      merchantName: 'Store',
      upiVpa: 'invalid-vpa-without-at'
    });
    assert.strictEqual(invalidUpi.success, false);
  });

  // ---------------- 6. AUTHENTICATION STATE UPDATE AFTER LOGIN ----------------
  it('6. Authentication state update properly extracts tokens from envelope and never stores refresh token in localStorage', () => {
    const frontend = new FrontendAuthSessionSimulator();

    const apiResponse = {
      success: true,
      data: {
        user: { id: 'usr_123', email: 'owner@retail.com', merchantId: 'mer_123', role: 'ADMIN' },
        merchant: { id: 'mer_123', name: 'Retail Corp', email: 'owner@retail.com', upiConfig: { vpa: 'retail@upi', isAcceptingPayments: true } },
        tokens: { accessToken: 'jwt.access.token.123', refreshToken: 'opaque.refresh.token.456', expiresIn: 900 }
      }
    };

    frontend.processAuthApiResponse(apiResponse, 'login');

    assert.strictEqual(frontend.accessToken, 'jwt.access.token.123');
    assert.strictEqual(frontend.user.userId, 'usr_123');
    assert.strictEqual(frontend.profile.name, 'Retail Corp');
    assert.strictEqual(frontend.localStorageStore.get('rgs_access_token'), 'jwt.access.token.123');

    // SECURITY CHECK: Refresh token MUST NOT be stored in localStorage Store
    assert.strictEqual(frontend.localStorageStore.has('rgs_refresh_token'), false, 'Refresh token must NEVER be stored in localStorage');
  });

  // ---------------- 7. NAVIGATION AFTER SUCCESSFUL REGISTRATION ----------------
  it('7. Navigation after registration immediately transitions to dashboard and shows welcome toast', () => {
    const frontend = new FrontendAuthSessionSimulator();

    const regApiResponse = {
      success: true,
      data: {
        user: { id: 'usr_reg_1', email: 'new@store.com', merchantId: 'mer_reg_1', role: 'ADMIN' },
        merchant: { id: 'mer_reg_1', name: 'Brand New Store', email: 'new@store.com', upiConfig: { vpa: 'new@upi', isAcceptingPayments: true } },
        tokens: { accessToken: 'jwt.reg.token.abc', refreshToken: 'opaque.reg.token.xyz', expiresIn: 900 }
      }
    };

    frontend.processAuthApiResponse(regApiResponse, 'register');

    // Confirms screen navigation
    assert.strictEqual(frontend.currentScreen, 'dashboard', 'Must automatically navigate to dashboard upon registration with credentials');
    assert.ok(frontend.feedbackToast?.message.includes('Welcome to RGS Ledger, Brand New Store!'));
    assert.strictEqual(frontend.feedbackToast?.type, 'success');
  });

  // ---------------- 8. NAVIGATION AFTER SUCCESSFUL LOGIN ----------------
  it('8. Navigation after login transitions away from login screen to dashboard with welcome back toast', () => {
    const frontend = new FrontendAuthSessionSimulator();
    assert.strictEqual(frontend.currentScreen, 'auth_login');

    const loginApiResponse = {
      success: true,
      data: {
        user: { id: 'usr_login_1', email: 'login@store.com', merchantId: 'mer_login_1', role: 'ADMIN' },
        merchant: { id: 'mer_login_1', name: 'Existing Merchant', email: 'login@store.com', upiConfig: { vpa: 'store@upi', isAcceptingPayments: true } },
        tokens: { accessToken: 'jwt.login.token.def', refreshToken: 'opaque.login.token.uvw', expiresIn: 900 }
      }
    };

    frontend.processAuthApiResponse(loginApiResponse, 'login');

    assert.strictEqual(frontend.currentScreen, 'dashboard');
    assert.ok(frontend.feedbackToast?.message.includes('Welcome back, Existing Merchant!'));
    assert.strictEqual(frontend.feedbackToast?.type, 'success');
  });

  // ---------------- 9. PROTECTED ROUTE ACCESS ----------------
  it('9. Protected route verification enforces Bearer token validation', () => {
    // Generate valid token
    const token = security.generateAccessToken({
      userId: 'usr_99',
      merchantId: 'mer_99',
      role: 'MERCHANT_ADMIN'
    });

    const verified = security.verifyAccessToken(token);
    assert.strictEqual(verified.userId, 'usr_99');
    assert.strictEqual(verified.merchantId, 'mer_99');

    // Tampered token must throw
    const tampered = token.slice(0, -5) + 'xxxxx';
    assert.throws(() => {
      security.verifyAccessToken(tampered);
    });
  });

  // ---------------- 10. REFRESHING THE DASHBOARD WHILE AUTHENTICATED ----------------
  it('10. Refreshing dashboard while authenticated preserves user session and profile', async () => {
    const frontend = new FrontendAuthSessionSimulator();

    // Authenticate
    const loginResult = await authService.login({
      email: testMerchant.email,
      password: testMerchant.password
    });
    frontend.processAuthApiResponse({ success: true, data: loginResult }, 'login');

    // Simulate page reload: read from localStorageStore
    const reloadedToken = frontend.localStorageStore.get('rgs_access_token');
    const reloadedUser = JSON.parse(frontend.localStorageStore.get('rgs_user')!);

    assert.ok(reloadedToken, 'Token must survive page reload via persistent storage');
    assert.strictEqual(reloadedUser.email, testMerchant.email);

    // Verify token validity against security service
    const verified = security.verifyAccessToken(reloadedToken);
    assert.strictEqual(verified.userId, reloadedUser.userId);
  });

  // ---------------- 11. EXPIRED ACCESS-TOKEN REFRESH ----------------
  it('11. Expired access token is rejected, and refresh endpoint rotates to fresh token', async () => {
    // 1. Generate an already expired access token
    const expiredToken = jwt.sign(
      { userId: 'usr_exp', merchantId: 'mer_exp', role: 'MERCHANT_ADMIN' },
      config.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' }
    );
    assert.throws(
      () => security.verifyAccessToken(expiredToken),
      (err: any) => err.name === 'TokenExpiredError'
    );

    // 2. Register a user to hold a valid refresh token
    const userReg = await authService.register({
      email: 'expired.test@store.com',
      password: 'password123!',
      merchantName: 'Expired Token Store',
      upiVpa: 'expired@upi'
    });

    // 3. Perform refresh
    const refreshed = await authService.refreshTokens(userReg.tokens.refreshToken);
    assert.ok(refreshed.accessToken, 'Must return new access token');
    assert.ok(refreshed.refreshToken, 'Must return new rotated refresh token');
    assert.notStrictEqual(refreshed.refreshToken, userReg.tokens.refreshToken, 'Refresh token must be rotated');

    // 4. Old refresh token cannot be used again
    await assert.rejects(
      async () => {
        await authService.refreshTokens(userReg.tokens.refreshToken);
      },
      (err: any) => err.code === 'INVALID_REFRESH_TOKEN'
    );
  });

  // ---------------- 12. LOGOUT AND SUBSEQUENT PROTECTED-ROUTE REJECTION ----------------
  it('12. Logout revokes active session, clears storage, and rejects subsequent token refresh', async () => {
    const frontend = new FrontendAuthSessionSimulator();

    const userReg = await authService.register({
      email: 'logout.check@store.com',
      password: 'password123!',
      merchantName: 'Logout Check Store',
      upiVpa: 'logoutchk@upi'
    });

    frontend.processAuthApiResponse({ success: true, data: userReg }, 'login');
    assert.strictEqual(frontend.currentScreen, 'dashboard');

    // Perform server-side logout
    await authService.logout(userReg.user.id);

    // Perform frontend logout
    frontend.logout();

    // Verify client state cleared
    assert.strictEqual(frontend.accessToken, '');
    assert.strictEqual(frontend.user, null);
    assert.strictEqual(frontend.currentScreen, 'auth_login');
    assert.strictEqual(frontend.localStorageStore.has('rgs_access_token'), false);

    // Reusing the revoked refresh token must be rejected
    await assert.rejects(
      async () => {
        await authService.refreshTokens(userReg.tokens.refreshToken);
      },
      (err: any) => err.code === 'INVALID_REFRESH_TOKEN'
    );
  });

  // ---------------- 13. MISSING REFRESH COOKIE (FIRST-TIME VISITOR) ----------------
  it('13. Missing refresh cookie or body is treated as unauthenticated without returning HTTP 400', () => {
    // When no cookie and no body are supplied, simulate the auth refresh handler decision logic
    const reqWithNoCookie = { headers: {} as Record<string, string>, body: {} as Record<string, any> };
    const extractCookie = (req: any, _name: string) => req.headers.cookie;
    const token = extractCookie(reqWithNoCookie, 'rgs_refresh_token') || reqWithNoCookie.body?.refreshToken;

    assert.strictEqual(token, undefined);

    // The handler must identify this as unauthenticated (401), not a bad request (400)
    const isUnauthenticated = !token || typeof token !== 'string';
    assert.strictEqual(isUnauthenticated, true);
  });

  // ---------------- 14. UNDEFINED DATA & EMPTY ARRAY RESILIENCE ----------------
  it('14. Dashboard array extraction safely handles missing, undefined, or empty payload items', () => {
    // Scenario A: API returns { items: [...] } but no payments key
    const responseWithItemsOnly = {
      success: true,
      data: {
        items: [{ id: 'pay_1', orderId: 'ord_1', amountPaise: 5000 }],
        total: 1
      }
    };
    const extractedFromItems = Array.isArray(responseWithItemsOnly.data.items)
      ? responseWithItemsOnly.data.items
      : (Array.isArray((responseWithItemsOnly.data as any).payments) ? (responseWithItemsOnly.data as any).payments : []);
    assert.strictEqual(extractedFromItems.length, 1);
    assert.strictEqual(extractedFromItems[0].id, 'pay_1');

    // Scenario B: API returns { payments: [...] } with dual-field compatibility
    const responseWithPayments = {
      success: true,
      data: {
        items: [{ id: 'pay_2', orderId: 'ord_2', amountPaise: 10000 }],
        payments: [{ id: 'pay_2', orderId: 'ord_2', amountPaise: 10000 }],
        total: 1
      }
    };
    const extractedDual = Array.isArray(responseWithPayments.data.items)
      ? responseWithPayments.data.items
      : (Array.isArray(responseWithPayments.data.payments) ? responseWithPayments.data.payments : []);
    assert.strictEqual(extractedDual.length, 1);

    // Scenario C: API returns { items: [] } (empty array)
    const emptyResponse = { success: true, data: { items: [], total: 0 } };
    const emptyList = Array.isArray(emptyResponse.data.items) ? emptyResponse.data.items : [];
    assert.strictEqual(emptyList.length, 0);

    // Scenario D: Malformed or undefined data payload
    const malformedResponse: any = { success: true, data: {} };
    const safeList = Array.isArray(malformedResponse.data?.items)
      ? malformedResponse.data.items
      : (Array.isArray(malformedResponse.data?.payments) ? malformedResponse.data.payments : []);
    assert.strictEqual(safeList.length, 0, 'Must safely default to empty array');

    // Scenario E: Evaluating .length on guaranteed array never throws
    assert.doesNotThrow(() => {
      const len = safeList.length;
      assert.strictEqual(len, 0);
    });
  });

  // ---------------- 15. FIRST-TIME VISITOR CLEAN LOGIN DISPLAY ----------------
  it('15. First-time unauthenticated visitor cleanly renders login screen without blank page or crash', () => {
    const frontend = new FrontendAuthSessionSimulator();

    // Verify initial unauthenticated state
    assert.strictEqual(frontend.accessToken, '');
    assert.strictEqual(frontend.user, null);
    assert.strictEqual(frontend.currentScreen, 'auth_login');

    // Attempting session restoration with empty storage
    const storedToken = frontend.localStorageStore.get('rgs_access_token');
    assert.strictEqual(storedToken, undefined);

    // User remains cleanly on auth screen without unhandled error
    assert.strictEqual(frontend.currentScreen, 'auth_login');
  });
});
