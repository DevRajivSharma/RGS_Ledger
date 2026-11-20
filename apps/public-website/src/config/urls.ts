/**
 * Centralized environment-driven frontend URL configuration.
 * Avoids hardcoding localhost or production URLs in components.
 */
export const APP_URLS = {
  website: (import.meta as any).env?.VITE_WEBSITE_URL || 'http://localhost:3000',
  merchantDashboard: (import.meta as any).env?.VITE_MERCHANT_DASHBOARD_URL || 'http://localhost:3001',
  hostedCheckout: (import.meta as any).env?.VITE_HOSTED_CHECKOUT_URL || 'http://localhost:3002',
  adminDashboard: (import.meta as any).env?.VITE_ADMIN_DASHBOARD_URL || 'http://localhost:3003',
  developerPortal: (import.meta as any).env?.VITE_DEVELOPER_PORTAL_URL || 'http://localhost:3004',
  api: (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'
};
