package com.music.mediastore;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Mediastore")
public class MediastorePlugin extends Plugin {

    private final Mediastore implementation = new Mediastore();

    @PluginMethod
    public void checkPermission(PluginCall call) {

        String permission;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permission = Manifest.permission.READ_MEDIA_AUDIO;
        } else {
            permission = Manifest.permission.READ_EXTERNAL_STORAGE;
        }

        boolean granted =
                ContextCompat.checkSelfPermission(
                        getContext(),
                        permission
                ) == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        ret.put("granted", granted);

        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {

        requestAllPermissions(call, "permissionCallback");
    }

    @PluginMethod
    public void getSongs(PluginCall call) {

        try {

            JSArray songs = implementation.getSongs(
                    getContext().getContentResolver()
            );

            JSObject ret = new JSObject();
            ret.put("songs", songs);

            call.resolve(ret);

        } catch (Exception ex) {

            call.reject(ex.getMessage());

        }

    }

    private void permissionCallback(PluginCall call) {

        JSObject ret = new JSObject();

        ret.put("granted", true);

        call.resolve(ret);

    }

}