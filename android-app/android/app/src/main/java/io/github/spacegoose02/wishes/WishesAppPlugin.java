package io.github.spacegoose02.wishes;

import android.content.pm.PackageInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the app's own connect and offline screens pick a server and open it. */
@CapacitorPlugin(name = "WishesApp")
public class WishesAppPlugin extends Plugin {

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("server", Servers.get(getContext()));
        result.put("version", version());
        call.resolve(result);
    }

    /** Checks an address and, if a Wishes server answers (or force is set), saves it and opens it. */
    @PluginMethod
    public void connect(PluginCall call) {
        String url = call.getString("url", "");
        boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
        new Thread(() -> {
            try {
                Servers.Probe probe = Servers.probe(url);
                JSObject result = new JSObject();
                result.put("server", probe.server);
                result.put("verified", probe.verified);
                if (probe.verified || force) {
                    Servers.save(getContext(), probe.server);
                    open();
                }
                call.resolve(result);
            } catch (Servers.ProbeException e) {
                call.reject(e.getMessage());
            }
        })
            .start();
    }

    /** Opens the saved server again (the "Try again" and "Go back" buttons). */
    @PluginMethod
    public void open(PluginCall call) {
        if (Servers.get(getContext()) == null) {
            call.reject("No server saved yet.");
            return;
        }
        open();
        call.resolve();
    }

    private void open() {
        if (getActivity() instanceof MainActivity) {
            MainActivity activity = (MainActivity) getActivity();
            activity.runOnUiThread(activity::openServer);
        }
    }

    private String version() {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return info.versionName;
        } catch (Exception e) {
            return "";
        }
    }
}
