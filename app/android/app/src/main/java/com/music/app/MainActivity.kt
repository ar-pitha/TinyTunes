package com.music.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.music.app.MediastorePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(MediastorePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}