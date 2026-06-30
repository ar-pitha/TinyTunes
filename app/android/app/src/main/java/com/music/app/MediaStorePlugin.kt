// NOTE:
// This plugin targets Capacitor 8.
// Uses only READ_MEDIA_AUDIO since the manifest scopes
// READ_EXTERNAL_STORAGE to maxSdkVersion 32 (Android 12 and below).
// On API 33+ devices/emulators, READ_MEDIA_AUDIO alone is required.

package com.music.app

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "Mediastore",
    permissions = [
        Permission(
            alias = "audio",
            strings = [
                Manifest.permission.READ_MEDIA_AUDIO
            ]
        )
    ]
)
class MediastorePlugin : Plugin() {

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val obj = JSObject()
        obj.put("granted", getPermissionState("audio") == PermissionState.GRANTED)
        call.resolve(obj)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (getPermissionState("audio") == PermissionState.GRANTED) {
            val obj = JSObject()
            obj.put("granted", true)
            call.resolve(obj)
            return
        }

        requestPermissionForAlias("audio", call, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val obj = JSObject()
        val granted = getPermissionState("audio") == PermissionState.GRANTED
        obj.put("granted", granted)

        if (granted) {
            call.resolve(obj)
        } else {
            call.reject("Permission denied")
        }
    }

    @PluginMethod
    fun getSongs(call: PluginCall) {
        if (getPermissionState("audio") != PermissionState.GRANTED) {
            call.reject("Permission not granted")
            return
        }

        val songs = JSArray()

        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DISPLAY_NAME
        )

        val cursor = context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection,
            "${MediaStore.Audio.Media.IS_MUSIC}!=0",
            null,
            "${MediaStore.Audio.Media.TITLE} ASC"
        )

        cursor?.use {
            val idCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val titleCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val artistCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val albumCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val durCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val sizeCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            val nameCol = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)

            while (it.moveToNext()) {
                val id = it.getLong(idCol)

                val song = JSObject()
                song.put("id", id.toString())
                song.put("title", it.getString(titleCol))
                song.put("artist", it.getString(artistCol))
                song.put("album", it.getString(albumCol))
                song.put("duration", it.getLong(durCol))
                song.put("size", it.getLong(sizeCol))
                song.put("displayName", it.getString(nameCol))
                song.put(
                    "contentUri",
                    Uri.withAppendedPath(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        id.toString()
                    ).toString()
                )

                songs.put(song)
            }
        }

        val result = JSObject()
        result.put("songs", songs)
        call.resolve(result)
    }
}