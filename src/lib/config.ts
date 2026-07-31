// Noverlyn App Configuration & Production URL Helper
export const APP_CONFIG = {
  appName: 'Noverlyn',
  version: '1.0.0-beta',
  appUrl:
    (import.meta.env.VITE_APP_URL as string) ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
  supportEmail: 'support@noverlyn.com',
  isProduction: import.meta.env.PROD,
}
