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
const isProd = (import.meta as any).env?.PROD || (isBrowser && !isLocalhost);

export const APP_URLS = {
  website: (import.meta as any).env?.VITE_WEBSITE_URL || (isProd ? 'https://rgsledger.rajivsharma.online' : 'http://localhost:3000'),
  merchantDashboard: (import.meta as any).env?.VITE_MERCHANT_DASHBOARD_URL || (isProd ? 'https://app.rgsledger.rajivsharma.online' : 'http://localhost:3001'),
  hostedCheckout: (import.meta as any).env?.VITE_HOSTED_CHECKOUT_URL || (isProd ? 'https://pay.rgsledger.rajivsharma.online' : 'http://localhost:3002'),
  adminDashboard: (import.meta as any).env?.VITE_ADMIN_DASHBOARD_URL || (isProd ? 'https://admin.rgsledger.rajivsharma.online' : 'http://localhost:3003'),
  developerPortal: (import.meta as any).env?.VITE_DEVELOPER_PORTAL_URL || (isProd ? 'https://docs.rgsledger.rajivsharma.online' : 'http://localhost:3004'),
  api: (import.meta as any).env?.VITE_API_URL || (isProd ? 'https://api.rgsledger.rajivsharma.online' : 'http://localhost:4000')
};

/**
 * Returns the destination URL for Merchant Portal Login, preserving query parameters.
 */
export const getMerchantLoginUrl = (searchParams?: string): string => {
  const base = APP_URLS.merchantDashboard.replace(/\/+$/, '');
  const search = searchParams !== undefined
    ? (searchParams.startsWith('?') || searchParams === '' ? searchParams : `?${searchParams}`)
    : (typeof window !== 'undefined' ? window.location.search : '');
  return `${base}/login${search}`;
};

/**
 * Returns the destination URL for Merchant Portal Sign Up / Registration, preserving query parameters.
 */
export const getMerchantSignupUrl = (searchParams?: string): string => {
  const base = APP_URLS.merchantDashboard.replace(/\/+$/, '');
  const search = searchParams !== undefined
    ? (searchParams.startsWith('?') || searchParams === '' ? searchParams : `?${searchParams}`)
    : (typeof window !== 'undefined' ? window.location.search : '');
  return `${base}/signup${search}`;
};
