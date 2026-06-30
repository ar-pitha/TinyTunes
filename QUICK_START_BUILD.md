# Quick Start - Build & Deploy Guide

## ⚡ 5-Minute Setup

### Prerequisites
- Node.js 16+
- Android Studio
- Android SDK (API 31+)
- Android Emulator OR physical device

---

## Step 1: Build Frontend (2 min)

```bash
cd frontend
npm run build
```

**Expected output:**
```
vite v8.1.0 building client environment for production...
✓ 1234 modules transformed.
built in 5.23s.
```

---

## Step 2: Sync to Native (1 min)

```bash
cd ../app
npx cap sync
```

**Expected output:**
```
✔ Copying web assets from ../frontend/dist to android/app/src/main/assets/public
✔ Updating Android plugins
✔ Sync complete!
```

---

## Step 3: Build Android (5 min)

### Option A: Using Android Studio
```bash
npx cap open android
```
- Wait for Gradle sync
- Menu: Build → Make Project
- Or press Ctrl+F9

### Option B: Using Command Line
```bash
cd app/android
./gradlew assembleDebug
```

---

## Step 4: Deploy

### To Android Emulator
```bash
cd ../..
npx cap run android
```

### To Physical Device (USB)
```bash
# Ensure device is connected and USB debugging enabled
npx cap run android
```

---

## Troubleshooting During Build

### Error: "Cannot resolve entry moduleindex.html"
**Solution:** Make sure you built frontend first:
```bash
cd frontend && npm run build
```

### Error: "Gradle sync failed"
**Solution:** Update Gradle:
```bash
cd app/android
./gradlew wrapper --gradle-version 8.0
```

### Error: "SDK version too low"
**Solution:** Update SDK in `app/android/app/build.gradle`

### Plugin not recognized
**Solution:** Verify MediastorePlugin.kt exists:
```bash
ls app/android/app/src/main/java/com/music/app/MediastorePlugin.kt
```

---

## Testing the Plugin

### Step 1: Add Music to Emulator
```bash
# Push music file to emulator
adb push /path/to/song.mp3 /sdcard/Music/

# Or use emulator UI to add music
```

### Step 2: Test Permission Flow
1. Open app
2. Go to "Offline Music" tab
3. Permission dialog should appear
4. Tap "Allow"
5. Songs should load

### Step 3: Setup Backend Access
```bash
# Forward emulator port to host
adb reverse tcp:3001 tcp:3001

# Now emulator can access http://localhost:3001
```

---

## Environment Setup

### Create `.env` for Development

**Frontend** (`frontend/.env`):
```env
VITE_BACKEND_URL=http://10.0.2.2:3001
```

For testing:
```env
VITE_BACKEND_URL=http://localhost:3001
```

---

## Plugin API Reference

### Request Permission
```javascript
const granted = await MusicService.requestPermission();
if (!granted) {
  console.log('User denied permission');
}
```

### Check Permission
```javascript
const hasPermission = await MusicService.checkPermission();
```

### Get Songs
```javascript
try {
  const songs = await MusicService.getSongs();
  console.log(`Loaded ${songs.length} songs`);
  // songs[0] = { id, title, artist, album, duration, contentUri, ... }
} catch (error) {
  console.error(error.message);
}
```

### Play Song
```javascript
const audio = new Audio(song.contentUri);
audio.play();
```

---

## Project Structure Recap

```
Musicapp/
├── backend/          ← Node.js/Express server
├── frontend/         ← React/Vite (build here!)
└── app/
    └── android/
        └── app/
            └── src/main/
                ├── java/com/music/app/
                │   ├── MainActivity.kt
                │   └── MediastorePlugin.kt     ← The Plugin!
                └── AndroidManifest.xml
```

---

## Key Files Implemented

| File | Purpose | Status |
|------|---------|--------|
| `MediastorePlugin.kt` | Capacitor plugin for Android | ✅ Complete |
| `MainActivity.kt` | Plugin registration | ✅ Updated |
| `AndroidManifest.xml` | Permissions declaration | ✅ Updated |
| `MusicService.js` | JavaScript bridge to plugin | ✅ Updated |
| `OfflineMusicPlayer.jsx` | UI component | ✅ Updated |

---

## What Was Fixed

❌ **Before:**
- No Capacitor plugin existed
- Permission API calls were broken
- Plugin not registered
- Wrong method names

✅ **After:**
- Complete MediastorePlugin.kt implementation
- Proper permission handling for Android 12, 13, 14, 15+
- Plugin registered in MainActivity
- Correct method names and API
- Error handling and logging

---

## Expected Behavior

### On First Launch
1. App loads
2. User navigates to "Offline Music" tab
3. Permission dialog appears (Android system)
4. User taps "Allow"
5. Songs load from device MediaStore
6. List displays all audio files

### On Subsequent Launches
1. App loads
2. Permission already granted
3. Songs load immediately
4. User can play any song using content:// URI

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Offline not available" | Plugin not built | Run `npx cap sync` then rebuild |
| No songs showing | Device has no music | Add MP3s to `/sdcard/Music/` |
| Permission denied error | User rejected | Manually allow in Settings |
| Backend unreachable | Wrong URL | Check `.env` VITE_BACKEND_URL |
| Build fails with Gradle error | Outdated SDK | Update Android SDK |

---

## Next: Test the Full App Flow

1. ✅ Login with test account
2. ✅ Upload a song in Song Manager
3. ✅ Play from "Music" tab
4. ✅ Go to "Offline Music" tab
5. ✅ View local songs
6. ✅ Click to play local song

---

**Ready to build? Start with Step 1!** 🚀
