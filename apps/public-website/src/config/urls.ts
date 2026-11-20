/**
 * Centralized environment-driven frontend URL configuration.
 * Avoids hardcoding localhost or production URLs in components.
 */

const isBrowser = typeof window !== 'undefined';
const isLocalhost = isBrowser && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.endsWith('.local')
);
const isLocalDev = isLocalhost || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');
const isProd = (import.meta as any).env?.PROD || !isLocalDev;

export const APP_URLS = {
  website: (import.meta as any).env?.VITE_WEBSITE_URL || (isProd ? 'https://rgsledger.rajivsharma.online' : 'http://localhost:3000'),
  merchantDashboard: (import.meta as any).env?.VITE_MERCHANT_DASHBOARD_URL || (isProd ? 'https://app.rgsledger.rajivsharma.online' : 'http://localhost:3001'),
  hostedCheckout: (import.meta as any).env?.VITE_HOSTED_CHECKOUT_URL || (isProd ? 'https://pay.rgsledger.rajivsharma.online' : 'http://localhost:3002'),
  adminDashboard: (import.meta as any).env?.VITE_ADMIN_DASHBOARD_URL || (isProd ? 'https://admin.rgsledger.rajivsharma.online' : 'http://localhost:3003'),
  developerPortal: (import.meta as any).env?.VITE_DEVELOPER_PORTAL_URL || (isProd ? 'https://docs.rgsledger.rajivsharma.online' : 'http://localhost:3004'),
  api: (import.meta as any).env?.VITE_API_URL || (isProd ? 'https://api.rgsledger.rajivsharma.online' : 'http://localhost:4000')
};

/**
 * Query parameters supported by the merchant dashboard root page (e.g., OAuth callbacks).
 * Unsupported parameters are omitted to avoid introducing unsupported parameters.
 */
const SUPPORTED_MERCHANT_PARAMS = new Set(['status', 'email', 'error']);

function sanitizeMerchantParams(searchParams?: string): string {
  if (!searchParams) return '';
  const queryString = searchParams.startsWith('?') ? searchParams.slice(1) : searchParams;
  if (!queryString) return '';

  try {
    const parsed = new URLSearchParams(queryString);
    const filtered = new URLSearchParams();
    for (const [key, value] of parsed.entries()) {
      if (SUPPORTED_MERCHANT_PARAMS.has(key)) {
        filtered.set(key, value);
      }
    }
    const filteredStr = filtered.toString();
    return filteredStr ? `?${filteredStr}` : '';
  } catch {
    return '';
  }
}

/**
 * Returns the destination URL for Merchant Portal Login/Sign In.
 * Points to the single root route of the merchant application (https://app.rgsledger.rajivsharma.online/).
 */
export const getMerchantLoginUrl = (searchParams?: string): string => {
  const base = APP_URLS.merchantDashboard.replace(/\/+$/, '');
  const search = sanitizeMerchantParams(
    searchParams !== undefined
      ? searchParams
      : (typeof window !== 'undefined' ? window.location.search : '')
  );
  return `${base}/${search}`;
};

/**
 * Returns the destination URL for Merchant Portal Sign Up / Registration.
 * Points to the single root route of the merchant application (https://app.rgsledger.rajivsharma.online/).
 */
export const getMerchantSignupUrl = (searchParams?: string): string => {
  const base = APP_URLS.merchantDashboard.replace(/\/+$/, '');
  const search = sanitizeMerchantParams(
    searchParams !== undefined
      ? searchParams
      : (typeof window !== 'undefined' ? window.location.search : '')
  );
  return `${base}/${search}`;
};
