// The Wishes Android app (android-app/) adds "WishesAndroid/<version>" to its user agent.
export const ANDROID_APP_UA = /\bWishesAndroid\/[\d.]+/;

export function isAndroidApp(userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return ANDROID_APP_UA.test(userAgent);
}

// The app's own "connect to your server" screen, bundled inside the app.
export const ANDROID_APP_SWITCH_SERVER_URL = "https://localhost/";
