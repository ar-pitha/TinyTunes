# Testing & Troubleshooting Guide

## 🧪 Testing Workflow

### Phase 1: Build Verification (5 minutes)

#### Step 1: Verify Files Exist
```bash
# Check plugin file
ls -la app/android/app/src/main/java/com/music/app/MediastorePlugin.kt

# Check updated files
ls -la app/android/app/src/main/java/com/music/app/MainActivity.kt
ls -la app/android/app/src/main/AndroidManifest.xml
ls -la frontend/src/services/MusicService.js
ls -la frontend/src/components/OfflineMusicPlayer.jsx
```

**Expected:** All files exist and show recent modification date

#### Step 2: Build Frontend
```bash
cd frontend
npm install
npm run build
```

**Expected Output:**
```
vite v8.1.0 building client environment for production...
✓ 1234 modules transformed.
built in 5.23s.
```

**Check:**
- No errors in output
- `dist/` folder created
- Files in `dist/` directory

#### Step 3: Sync to Native
```bash
cd ../app
npx cap sync
```

**Expected Output:**
```
✔ Copying web assets from ../frontend/dist to android/app/src/main/assets/public
✔ Updating Android plugins
✔ Sync complete!
```

**Check:**
- No "ENOENT" or "file not found" errors
- Assets copied successfully
- Plugins updated

---

### Phase 2: Android Build (10 minutes)

#### Option A: Using Android Studio (Recommended)

```bash
npx cap open android
```

**Expected:** Android Studio opens

**In Android Studio:**
1. Wait for Gradle sync to complete (watch the bottom status bar)
2. Click "Build" menu
3. Click "Make Project"
4. Or press Ctrl+F9

**Expected:**
```
Build completed successfully
Built the following APK(s):
  app/build/outputs/apk/debug/app-debug.apk
```

**Check:**
- No "error: cannot find symbol" errors
- No "MediastorePlugin not found" errors
- No "R cannot be resolved" errors
- Gradle sync shows ✓ (check mark)

#### Option B: Using Command Line

```bash
cd app/android
./gradlew assembleDebug
```

**Expected:**
```
BUILD SUCCESSFUL
Total time: 45s
```

**Check:**
- "BUILD SUCCESSFUL" message
- APK created: `app/build/outputs/apk/debug/app-debug.apk`

---

### Phase 3: Deployment (5 minutes)

#### To Emulator

```bash
# Option 1: Via Capacitor
cd ..
npx cap run android

# Option 2: Via Android Studio
# Click the Play button (green triangle)

# Option 3: Via adb
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Expected:**
- App installs without errors
- App launches
- No "Installation error" messages

#### To Physical Device

```bash
# Ensure device is connected and USB debugging enabled
adb devices

# You should see:
# List of attached devices
# xxxxxxxx device
```

Then:
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

### Phase 4: Runtime Testing (15 minutes)

#### Test 1: App Launches
1. Tap the app icon or wait for it to auto-launch
2. **Expected:** App shows loading spinner
3. **Expected:** App navigates to login screen

#### Test 2: Login Flow (if needed)
1. Create account or login with existing
2. **Expected:** Login succeeds
3. **Expected:** Redirected to main screen

#### Test 3: Permission Prompt
1. Navigate to "Offline Music" tab
2. **Expected:** Android permission dialog appears with:
   - "Allow Musicapp to access your music?"
   - "Allow" and "Deny" buttons
3. Tap "Allow"
4. **Expected:** Permission dialog closes

#### Test 4: Songs Load
1. After permission granted, wait 2-3 seconds
2. **Expected:** One of:
   - Song list appears with songs
   - "No songs found" message (if device has no music)
   - "Failed to fetch songs" error (if MediaStore query failed)

#### Test 5: Play a Song
1. If songs loaded, tap on a song
2. **Expected:**
   - Song info appears
   - Play button appears
   - Progress bar shows
3. Tap play button
4. **Expected:** Audio plays or plays with delay (loading)

#### Test 6: Other Features
1. Test skip forward, skip back buttons
2. Test pause, resume
3. Verify progress bar updates
4. Check that other tabs still work

---

## 🐛 Troubleshooting

### Build Issues

#### Error: "Cannot find symbol: MediastorePlugin"

**Cause:** File not in correct location or not compiled

**Solution:**
```bash
# Verify file exists
ls app/android/app/src/main/java/com/music/app/MediastorePlugin.kt

# If not, recreate it
# Copy from SOURCE_CODE_REFERENCE.md

# Then rebuild
cd app/android
./gradlew clean assembleDebug
```

#### Error: "error: Cannot find symbol: plugin"

**Cause:** MainActivity not importing MediastorePlugin correctly

**Solution:**
1. Open `MainActivity.kt`
2. Verify this line exists: `import com.music.app.MediastorePlugin`
3. Verify this line in onCreate(): `registerPlugin(MediastorePlugin::class.java)`
4. Clean and rebuild

#### Error: "error: Unresolved reference: JSObject"

**Cause:** Capacitor dependencies not imported

**Solution:**
1. Check `build.gradle` has Capacitor dependencies
2. Run: `./gradlew clean`
3. Rebuild: `./gradlew assembleDebug`

#### Error: "Build failed in 30ms: Cannot resolve entry moduleindex.html"

**Cause:** Frontend not built

**Solution:**
```bash
cd frontend
npm run build
cd ../app
npx cap sync
npx cap open android
# Rebuild
```

---

### Runtime Issues

#### Issue: "Offline Player Not Available" Error

**Cause:** Plugin not loading, permission denied, or platform check failing

**Solution:**
1. Check Android logcat:
```bash
adb logcat | grep -E "MediastorePlugin|Capacitor"
```

2. Look for:
```
E/MediastorePlugin: Error fetching songs
E/MediastorePlugin: Error querying MediaStore
```

3. If permission issue:
```bash
# Check permissions on device
adb shell pm list permissions -d
```

4. Grant permission manually:
```bash
adb shell pm grant com.music.app android.permission.READ_MEDIA_AUDIO
adb shell pm grant com.music.app android.permission.READ_EXTERNAL_STORAGE
```

#### Issue: Permission Dialog Doesn't Appear

**Cause:** Permission already granted or Android version handling issue

**Solution:**
1. Uninstall app: `adb uninstall com.music.app`
2. Reinstall: `adb install app/build/outputs/apk/debug/app-debug.apk`
3. Open app fresh - should prompt

Or on device:
1. Go to Settings → Apps → MusicApp → Permissions
2. Toggle "Media" off and on
3. Reopen app

#### Issue: No Songs Show After Permission

**Cause:** Device has no music files OR MediaStore query failed

**Solution:**
1. Add music files:
```bash
# Push an MP3 to device
adb push ~/Music/song.mp3 /sdcard/Music/song.mp3

# Or use file manager on device to add to /sdcard/Music/
```

2. Check logcat for errors:
```bash
adb logcat | grep MediastorePlugin
```

3. Verify MediaStore has songs:
```bash
adb shell content query --uri content://media/external/audio/media
```

#### Issue: Songs List Appears But Won't Play

**Cause:** contentUri incorrect or audio codec not supported

**Solution:**
1. Check logcat for audio errors:
```bash
adb logcat | grep -E "audio|media|AudioTrack"
```

2. Verify song format is supported (MP3, WAV, OGG, FLAC)
3. Try different song file
4. Check that audio permission is granted

#### Issue: App Crashes When Accessing Offline Music

**Cause:** Null pointer exception, permission error, or query failure

**Solution:**
1. Check crash in logcat:
```bash
adb logcat | grep -E "Exception|Crash|Fatal"
```

2. Look for stack trace showing which method crashed
3. Check MediastorePlugin.kt for the line and verify logic
4. Common cause: Column name typos

---

## ✅ Verification Checklist

After each phase, verify:

### Build Phase
- [ ] Frontend builds without errors
- [ ] No "Cannot find module" errors
- [ ] `dist/` folder exists with files
- [ ] `npx cap sync` completes without errors
- [ ] Android Gradle syncs in Android Studio
- [ ] No "Cannot find symbol" errors
- [ ] Project builds successfully

### Deployment Phase
- [ ] APK file created: `app/build/outputs/apk/debug/app-debug.apk`
- [ ] APK installs without errors
- [ ] App launches
- [ ] No immediate crashes

### Runtime Phase
- [ ] App navigates properly
- [ ] Offline Music tab accessible
- [ ] Permission dialog appears
- [ ] Permission is granted
- [ ] Songs list appears or "No songs" message shows
- [ ] Can click on song
- [ ] Can play audio
- [ ] Other features still work

---

## 📊 Testing Matrix

Test all combinations:

| Android Version | Permission | Action | Expected | Status |
|-----------------|-----------|--------|----------|--------|
| 12 | Not granted | Navigate to Offline | Dialog appears | ✓/✗ |
| 12 | Granted | Get Songs | Songs list/empty | ✓/✗ |
| 13 | Not granted | Navigate to Offline | Dialog appears | ✓/✗ |
| 13 | Granted | Get Songs | Songs list/empty | ✓/✗ |
| 14 | Not granted | Navigate to Offline | Dialog appears | ✓/✗ |
| 14 | Granted | Get Songs | Songs list/empty | ✓/✗ |

---

## 🔍 Debugging Tips

### Enable Verbose Logging
```bash
adb logcat | grep -v "DEBUG\|INFO" | head -100
```

### Filter by App
```bash
adb logcat | grep "com.music.app\|MediastorePlugin"
```

### Get Full Stack Trace
```bash
adb logcat > logcat.txt
# Trigger the error
# Ctrl+C to stop
cat logcat.txt | grep -A 20 "Exception"
```

### Monitor Performance
```bash
adb shell dumpsys batterymanager | grep current
adb shell top -n 1
```

### Check App Status
```bash
adb shell pm list packages | grep music
adb shell dumpsys package com.music.app
```

---

## 📝 Test Report Template

```
Test Date: ______
Android Version: ______
Device: ______
Build: ______

TESTS:
[ ] Build completes
[ ] App installs
[ ] App launches
[ ] Navigation works
[ ] Permission prompt appears
[ ] Permission is granted
[ ] Songs load (or empty message)
[ ] Song plays
[ ] Controls work
[ ] Other tabs work
[ ] No crashes

ISSUES FOUND:
1. ________________
2. ________________

RESOLUTION:
1. ________________
2. ________________

SIGNED OFF: ________ DATE: ________
```

---

## 🎯 Success Criteria

The implementation is successful when:

✅ App builds without errors
✅ App installs on device/emulator
✅ App launches without crashing
✅ Permission dialog appears on first access
✅ After permission granted, songs load
✅ Songs can be played with audio
✅ No errors in logcat
✅ All tabs/features functional
✅ User can login, upload, and access offline music

---

**Ready to test? Start with Phase 1!**
