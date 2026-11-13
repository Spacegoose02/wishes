package io.github.spacegoose02.wishes;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.net.ssl.SSLException;
import org.json.JSONObject;

/** Remembers which Wishes server this phone uses, and checks an address before saving it. */
final class Servers {

    private static final String PREFS = "wishes";
    private static final String KEY_SERVER = "server";
    private static final String MANIFEST = "/manifest.webmanifest";
    private static final int TIMEOUT_MS = 10000;

    private Servers() {}

    /** The saved server, like "https://wishes.example.com", or null before the first connect. */
    static String get(Context ctx) {
        return prefs(ctx).getString(KEY_SERVER, null);
    }

    static void save(Context ctx, String server) {
        prefs(ctx).edit().putString(KEY_SERVER, server).apply();
    }

    static void forget(Context ctx) {
        prefs(ctx).edit().remove(KEY_SERVER).apply();
    }

    /** True when the address is on the saved server (same scheme, host and port). */
    static boolean isServer(Context ctx, Uri url) {
        String server = get(ctx);
        if (server == null || url == null) return false;
        Uri s = Uri.parse(server);
        return eq(s.getScheme(), url.getScheme()) && eq(s.getHost(), url.getHost()) && port(s) == port(url);
    }

    /** The app's own bundled pages (the connect and offline screens). */
    static boolean isAppPage(Uri url) {
        return url != null && "https".equals(url.getScheme()) && "localhost".equals(url.getHost());
    }

    private static boolean eq(String a, String b) {
        return a != null && a.equalsIgnoreCase(b);
    }

    private static int port(Uri u) {
        if (u.getPort() != -1) return u.getPort();
        return "http".equalsIgnoreCase(u.getScheme()) ? 80 : 443;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** What a check of an address found. */
    static final class Probe {

        final String server;
        /** False when a sign-in page (forward auth) stood in the way, so we couldn't confirm it's Wishes. */
        final boolean verified;

        Probe(String server, boolean verified) {
            this.server = server;
            this.verified = verified;
        }
    }

    /** A friendly reason an address didn't work, ready to show as is. */
    static final class ProbeException extends Exception {

        ProbeException(String message) {
            super(message);
        }
    }

    /**
     * Turns what someone typed ("wishes.example.com", "192.168.1.20:3000", a full link) into a
     * server address, and checks that a Wishes server answers there. Runs network calls: never
     * call it on the main thread.
     */
    static Probe probe(String typed) throws ProbeException {
        String input = typed == null ? "" : typed.trim();
        if (input.isEmpty()) throw new ProbeException("Type the address of your Wishes server.");
        List<String> candidates = new ArrayList<>();
        if (input.contains("://")) {
            candidates.add(input);
        } else {
            candidates.add("https://" + input);
            candidates.add("http://" + input);
        }
        ProbeException first = null;
        for (String candidate : candidates) {
            try {
                return check(base(candidate));
            } catch (ProbeException e) {
                if (first == null) first = e;
            }
        }
        throw first;
    }

    /** Scheme, host, port and any path prefix, without a trailing slash, query or page name. */
    private static String base(String raw) throws ProbeException {
        Uri u = Uri.parse(raw);
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new ProbeException("The address should start with https:// or http://");
        }
        if (u.getHost() == null || u.getHost().isEmpty()) throw new ProbeException("That doesn't look like a web address.");
        String path = u.getPath() == null ? "" : u.getPath();
        // Someone pasted a link to a page inside Wishes: keep only the server part.
        int cut = path.indexOf("/lists");
        if (cut < 0) cut = path.indexOf("/login");
        if (cut >= 0) path = path.substring(0, cut);
        while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        String authority = u.getEncodedAuthority();
        return scheme + "://" + authority + path;
    }

    private static Probe check(String server) throws ProbeException {
        String url = server + MANIFEST;
        String host = Uri.parse(server).getHost();
        try {
            for (int hop = 0; hop < 6; hop++) {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(TIMEOUT_MS);
                conn.setReadTimeout(TIMEOUT_MS);
                conn.setRequestProperty("Accept", "application/manifest+json, application/json");
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (location == null) break;
                    String next = new URL(new URL(url), location).toString();
                    Uri n = Uri.parse(next);
                    if (n.getHost() != null && !n.getHost().equalsIgnoreCase(host)) {
                        // Sent to a sign-in service in front of Wishes (Authelia, Tinyauth...).
                        return new Probe(server, false);
                    }
                    if (next.endsWith(MANIFEST)) server = next.substring(0, next.length() - MANIFEST.length());
                    url = next;
                    continue;
                }
                if (code == 401 || code == 403) {
                    conn.disconnect();
                    return new Probe(server, false);
                }
                if (code != 200) {
                    conn.disconnect();
                    throw new ProbeException("The server answered, but not like Wishes does (error " + code + "). Check the address.");
                }
                String body = read(conn.getInputStream());
                conn.disconnect();
                if (!looksLikeWishes(body)) {
                    throw new ProbeException("Something answered at that address, but it isn't a Wishes server.");
                }
                return new Probe(server, true);
            }
            throw new ProbeException("That address keeps redirecting. Check it and try again.");
        } catch (ProbeException e) {
            throw e;
        } catch (UnknownHostException e) {
            throw new ProbeException("Couldn't find that address. Check the spelling, and that this phone is on the right network or VPN.");
        } catch (SSLException e) {
            throw new ProbeException(
                "This phone doesn't trust that server's security certificate. Use the address with a real certificate (from your reverse proxy), or the http:// address on your home network."
            );
        } catch (ConnectException | SocketTimeoutException e) {
            throw new ProbeException("Couldn't reach the server. Is it running, and is this phone on the same network (or VPN)?");
        } catch (IOException e) {
            throw new ProbeException("Couldn't reach the server: " + e.getMessage());
        }
    }

    private static boolean looksLikeWishes(String body) {
        try {
            JSONObject json = new JSONObject(body);
            String name = json.optString("name", "") + " " + json.optString("short_name", "");
            return name.toLowerCase(Locale.ROOT).contains("wishes");
        } catch (Exception e) {
            return false;
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream s = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = s.read(buf)) != -1 && out.size() < 256 * 1024) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }
}
