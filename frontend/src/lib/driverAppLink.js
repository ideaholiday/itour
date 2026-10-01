// Play Store page of the Idea Holiday Driver app (ADR 014). The browser trip page links
// to it on Android phones. Off until Google approves the app and it has been tested on
// Xiaomi/Oppo/Vivo battery savers; then set DRIVER_APP_LINK_ON to true and deploy.
// A build-time env file can't switch it: .dockerignore keeps every .env out of the image.
export const DRIVER_APP_PLAY_URL = 'https://play.google.com/store/apps/details?id=in.ideaholiday.driver';
export const DRIVER_APP_LINK_ON = false;

// VITE_DRIVER_APP_URL (local builds only) always wins, so the link can be tried in development.
export function driverAppUrl({ on = DRIVER_APP_LINK_ON, override = '' } = {}) {
  if (override) return override;
  return on ? DRIVER_APP_PLAY_URL : '';
}
