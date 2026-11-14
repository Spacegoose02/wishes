# Wishes for Android

An Android app for **any** Wishes server. On first launch it asks for the server's address
(`wishes.example.com`, `192.168.1.20:3000`, …), checks that Wishes answers there, and then
shows that server full screen, like the installed web app but as a real app.

It's a small [Capacitor](https://capacitorjs.com) shell: the screens all come from your
server, so updating the server updates the app. The app itself only adds:

- **Connect / switch server** screen (`www/index.html`). Switch later from Settings → Me & look → **Switch server**.
- **Share to Wishes**: share a product page from the Amazon app, Chrome or any store app, pick a list, done.
- **Shortcuts**: long-press the icon for *New list* and *Family lists*.
- **Links behave**: Wishes pages stay in the app; store links you tap open in your browser or the store's app; single sign-on (OIDC, forward auth) stays in the app so you land back signed in.
- **Downloads** (list exports) go to the phone's Downloads folder.
- A friendly **"can't reach your server"** screen with *Try again* and *Switch server*.
- Works over plain `http://` on a home network, as well as `https://`.

## Get the app

Every change to `android-app/` builds an APK on GitHub: **Actions → Android app → the latest run → Artifacts**.
Tagged releases (`v1.4.0`…) attach the APK to the release too.

On the phone, open the `.apk`, allow "install unknown apps" for your browser or file manager when asked, and install.

Test builds (`…-test.apk`) are all signed with the same public test key in this folder, so a newer one installs over an older one.
A build signed with your own key (below) can't install over a test build: uninstall the test build first.

## Limits

- **Push alerts**: Android's in-app web view can't receive web push, so in the app alerts arrive by email. (Chrome on the same phone can still get push.) Native alerts would need Firebase and are a possible next step.
- **Self-signed certificates** aren't trusted. Use a reverse proxy with a real certificate (Let's Encrypt), or the `http://` LAN address.
- **"Sign in with Google"** directly through Google refuses to run inside apps. Identity providers like Authelia, Authentik, Pocket ID, Keycloak and Tinyauth are fine.

## Your own signing key (needed for Google Play, and for stable updates)

1. Make a key once and keep it safe (losing it means you can't update the app on Play):
   ```bash
   keytool -genkeypair -v -keystore wishes-release.keystore -alias wishes -keyalg RSA -keysize 2048 -validity 10000
   ```
2. In GitHub: **Settings → Secrets and variables → Actions**, add
   - `ANDROID_KEYSTORE_BASE64`: the keystore file as base64 (`base64 -w0 wishes-release.keystore`, or on Windows `[Convert]::ToBase64String([IO.File]::ReadAllBytes("wishes-release.keystore"))` in PowerShell)
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`wishes`), and `ANDROID_KEY_PASSWORD` (if different)
3. The next build also produces a signed `.apk` and an `.aab` (the file Google Play wants).

## Publishing on Google Play

You need your own [Google Play developer account](https://play.google.com/console/signup) (a one-time $25).
New personal accounts must run a closed test with testers for a couple of weeks before going public.
Upload the `.aab`, fill in the store listing and the content rating questions, and use "Families" settings only if you're targeting children directly.
The app id is `io.github.spacegoose02.wishes`; change `appId` in `capacitor.config.json` and `applicationId`/`namespace` in `android/app/build.gradle` before the first upload if you want a different one.

## Build it yourself

You need Node 22+, Java 21 and the Android SDK (easiest: install [Android Studio](https://developer.android.com/studio)).

```bash
cd android-app
npm install
npx cap sync android     # copies www/ into the Android project
npx cap open android     # opens Android Studio; press Run
# or from the command line:
cd android && ./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```

The native code is in `android/app/src/main/java/io/github/spacegoose02/wishes/`:
`MainActivity` (startup, shares, shortcuts, back button, downloads), `WishesWebViewClient` (what opens where),
`WishesAppPlugin` (the connect screen's bridge) and `Servers` (saving and checking the address).
