package io.github.spacegoose02.wishes;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The whole app: a web view that shows the person's own Wishes server, plus a bundled
 * "connect to your server" screen for the first launch.
 */
public class MainActivity extends BridgeActivity {

    /** Set from a launcher shortcut ("New list") to open that page of Wishes. */
    static final String EXTRA_PATH = "io.github.spacegoose02.wishes.PATH";

    private static final Pattern LINK = Pattern.compile("https?://\\S+");

    /** Where to go once a server is chosen, when a share or shortcut arrives before that. */
    private String pendingPath = "/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(WishesAppPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return; // No usable WebView: Capacitor already showed a message.

        WebView webView = bridge.getWebView();
        bridge.setWebViewClient(new WishesWebViewClient(bridge, this));
        webView.setDownloadListener(this::download);

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (canGoBackInWishes(webView)) {
                            webView.goBack();
                        } else {
                            moveTaskToBack(true);
                        }
                    }
                }
            );

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction()) || intent.hasExtra(EXTRA_PATH)) handleIntent(intent);
    }

    /** Back stays inside Wishes: it never steps back to the connect screen behind the first page. */
    private static boolean canGoBackInWishes(WebView webView) {
        if (!webView.canGoBack()) return false;
        WebBackForwardList history = webView.copyBackForwardList();
        WebHistoryItem previous = history.getItemAtIndex(history.getCurrentIndex() - 1);
        WebHistoryItem current = history.getCurrentItem();
        if (previous == null || current == null) return true;
        boolean previousIsApp = Servers.isAppPage(Uri.parse(previous.getUrl()));
        boolean currentIsApp = Servers.isAppPage(Uri.parse(current.getUrl()));
        return !previousIsApp || currentIsApp;
    }

    private void handleIntent(Intent intent) {
        pendingPath = pathFor(intent);
        if (Servers.get(this) != null) openServer();
        // Otherwise the connect screen (the app's start page) is already loading.
    }

    /** Opens the saved server at the page waiting to be opened (the home page by default). */
    void openServer() {
        String server = Servers.get(this);
        if (server == null || bridge == null) return;
        String path = pendingPath == null ? "/" : pendingPath;
        pendingPath = "/";
        bridge.getWebView().loadUrl(server + path);
    }

    /** Shows the bundled "can't reach your server" screen. */
    void showOffline(String failedUrl, String reason) {
        if (bridge == null) return;
        String page =
            "https://localhost/offline.html?url=" + Uri.encode(failedUrl) + "&reason=" + Uri.encode(reason == null ? "" : reason);
        bridge.getWebView().loadUrl(page);
    }

    void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    /** Turns a share from another app, or a launcher shortcut, into a Wishes page. */
    private static String pathFor(Intent intent) {
        if (intent == null) return "/";
        String path = intent.getStringExtra(EXTRA_PATH);
        if (path != null && path.startsWith("/")) return path;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            String url = "";
            if (text != null) {
                Matcher m = LINK.matcher(text);
                if (m.find()) url = m.group();
            }
            return (
                "/share?title=" + Uri.encode(title == null ? "" : title) + "&text=" + Uri.encode(text == null ? "" : text) + "&url=" + Uri.encode(url)
            );
        }
        return "/";
    }

    /** Saves exports (CSV, JSON) and other files to Downloads, signed in as the person. */
    private void download(String url, String userAgent, String contentDisposition, String mimeType, long length) {
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", userAgent);
            request.setMimeType(mimeType);
            request.setTitle(name);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(request);
            toast("Downloading " + name + "…");
        } catch (Exception e) {
            toast("Couldn't download that file.");
        }
    }
}
