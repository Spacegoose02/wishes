// Talks to the app's native side (WishesAppPlugin.java). window.Capacitor is added by the app.
window.WishesApp = {
  call(method, options) {
    const cap = window.Capacitor;
    if (!cap || !cap.nativePromise) return Promise.reject(new Error("This page only works inside the Wishes app."));
    return cap.nativePromise("WishesApp", method, options || {});
  },
  message(e) {
    return (e && (e.message || e.errorMessage)) || "Something went wrong. Try again.";
  },
};
