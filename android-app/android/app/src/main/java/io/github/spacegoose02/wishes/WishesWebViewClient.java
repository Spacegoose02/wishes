package io.github.spacegoose02.wishes;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Decides what opens inside the app and what goes to the phone's browser or other apps.
 *
 * Wishes pages stay in the app. Store links (Amazon, Target...) a person taps open in the
 * browser, so shopping works as usual. Sign-in services the server sends you to (single
 * sign-on) stay in the app, so the session lands back in Wishes.
 */
public class WishesWebViewClient extends BridgeWebViewClient {

    private final MainActivity activity;

    public WishesWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https")) {
            // mailto:, tel:, sms:, webcal:, intent: and app links go to whatever handles them.
            openOutside(url);
            return true;
        }
        if (Servers.isAppPage(url) || Servers.isServer(activity, url)) return false;
        if (!request.isForMainFrame()) return false;

        String currentUrl = view.getUrl();
        Uri current = currentUrl == null ? null : Uri.parse(currentUrl);
        boolean fromWishes = current != null && (Servers.isServer(activity, current) || Servers.isAppPage(current));
        // A redirect, or a page we're already on that isn't Wishes, is part of a sign-in.
        if (request.isRedirect() || !fromWishes || !request.hasGesture()) return false;

        openOutside(url);
        return true;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        // Skip Capacitor's own handling: it would swap in an error page for any failed load.
        if (request.isForMainFrame() && Servers.isServer(activity, request.getUrl())) {
            activity.showOffline(request.getUrl().toString(), String.valueOf(error.getDescription()));
        }
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        // Wishes shows its own pages for 404s and the like; leave them on screen.
    }

    private void openOutside(Uri url) {
        Intent intent;
        try {
            intent = "intent".equals(url.getScheme())
                ? Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME)
                : new Intent(Intent.ACTION_VIEW, url);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            activity.toast("No app on this phone can open that link.");
        } catch (Exception e) {
            activity.toast("Couldn't open that link.");
        }
    }
}
