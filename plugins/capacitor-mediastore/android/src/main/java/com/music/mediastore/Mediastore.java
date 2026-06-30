package com.music.mediastore;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

public class Mediastore {

    public JSArray getSongs(ContentResolver resolver) {

        JSArray songs = new JSArray();

        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE
        };

        String selection =
                MediaStore.Audio.Media.IS_MUSIC + "!=0";

        Cursor cursor = resolver.query(
                collection,
                projection,
                selection,
                null,
                MediaStore.Audio.Media.TITLE + " ASC"
        );

        if (cursor != null) {

            int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
            int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
            int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
            int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
            int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
            int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);

            while (cursor.moveToNext()) {

                long id = cursor.getLong(idCol);

                JSObject song = new JSObject();

                song.put("id", String.valueOf(id));
                song.put("title", cursor.getString(titleCol));
                song.put("artist", cursor.getString(artistCol));
                song.put("album", cursor.getString(albumCol));
                song.put("duration", cursor.getLong(durationCol));
                song.put("size", cursor.getLong(sizeCol));

                Uri contentUri = Uri.withAppendedPath(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        String.valueOf(id)
                );

                song.put("contentUri", contentUri.toString());

                songs.put(song);
            }

            cursor.close();
        }

        return songs;
    }
}