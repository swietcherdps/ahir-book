# Mobile App Deployment Guide

This guide explains how to build and deploy Ahir Book as a native mobile app for iOS and Android.

## Prerequisites

### For iOS Development
- macOS with Xcode installed
- Apple Developer Account ($99/year)
- CocoaPods installed: `sudo gem install cocoapods`

### For Android Development  
- Android Studio installed
- Java JDK 11 or higher
- Android SDK (installed via Android Studio)

## Build Process

### 1. Build Web Assets

```bash
npm run build
```

This creates optimized production files in the `dist/` directory.

### 2. Sync Assets to Native Projects

```bash
# Sync to both platforms
npx cap sync

# Or sync individually
npx cap sync ios
npx cap sync android
```

## iOS Deployment

### Development Build

1. **Open Xcode Project:**
   ```bash
   npx cap open ios
   ```

2. **Configure Signing:**
   - In Xcode, select the project in the navigator
   - Go to "Signing & Capabilities"
   - Select your Team (Apple Developer Account)
   - Xcode will automatically create a provisioning profile

3. **Run on Simulator:**
   - Select a simulator from the device menu (e.g., iPhone 14)
   - Click the Play button or press Cmd+R

4. **Run on Physical Device:**
   - Connect your iPhone via USB
   - Trust the computer on your iPhone
   - Select your iPhone from the device menu
   - Click Run

### App Store Deployment

1. **Update Version:**
   Edit `ios/App/App.xcodeproj/project.pbxproj`:
   - Increment `MARKETING_VERSION` (e.g., "1.0.0")
   - Increment `CURRENT_PROJECT_VERSION` (e.g., "1")

2. **Archive Build:**
   - In Xcode, select "Any iOS Device" as target
   - Menu: Product → Archive
   - Wait for archive to complete

3. **Upload to App Store Connect:**
   - Window → Organizer
   - Select your archive
   - Click "Distribute App"
   - Choose "App Store Connect"
   - Follow the wizard to upload

4. **App Store Connect:**
   - Go to https://appstoreconnect.apple.com
   - Create new app listing
   - Add screenshots, description, keywords
   - Submit for review

## Android Deployment

### Development Build

1. **Open Android Studio:**
   ```bash
   npx cap open android
   ```

2. **Run on Emulator:**
   - In Android Studio, click AVD Manager
   - Create or start an emulator
   - Click Run (green play button)

3. **Run on Physical Device:**
   - Enable Developer Options on your Android phone:
     - Settings → About Phone → Tap "Build Number" 7 times
   - Enable USB Debugging in Developer Options
   - Connect phone via USB
   - Click Run and select your device

### Google Play Store Deployment

1. **Generate Signing Key:**
   ```bash
   cd android
   keytool -genkey -v -keystore ahir-book-release-key.keystore -alias ahir-book -keyalg RSA -keysize 2048 -validity 10000
   ```
   
   Save the password securely!

2. **Configure Signing:**
   Edit `android/app/build.gradle`:
   ```gradle
   android {
       ...
       signingConfigs {
           release {
               storeFile file('ahir-book-release-key.keystore')
               storePassword 'YOUR_PASSWORD'
               keyAlias 'ahir-book'
               keyPassword 'YOUR_PASSWORD'
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               minifyEnabled false
               proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
           }
       }
   }
   ```

3. **Build Release APK/AAB:**
   ```bash
   cd android
   ./gradlew bundleRelease  # For AAB (Google Play)
   # OR
   ./gradlew assembleRelease  # For APK (sideloading)
   ```

   Output files:
   - AAB: `android/app/build/outputs/bundle/release/app-release.aab`
   - APK: `android/app/build/outputs/apk/release/app-release.apk`

4. **Google Play Console:**
   - Go to https://play.google.com/console
   - Create new app
   - Upload AAB file
   - Complete app listing (screenshots, description)
   - Submit for review

## Update Process

When you make changes to the app:

1. **Update Code:**
   ```bash
   # Make your changes in src/
   npm run build
   ```

2. **Sync Changes:**
   ```bash
   npx cap sync
   ```

3. **Test:**
   - iOS: `npx cap open ios` → Run in Xcode
   - Android: `npx cap open android` → Run in Android Studio

4. **Increment Version:**
   - iOS: Update version in Xcode project settings
   - Android: Update `versionCode` and `versionName` in `android/app/build.gradle`

5. **Build & Deploy:**
   - Follow the deployment steps above for your target platform

## Capacitor Configuration

Edit `capacitor.config.ts` for app settings:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ahirbook.app',
  appName: 'Ahir Book',
  webDir: 'dist',
  server: {
    androidScheme: 'https'  // Use HTTPS for Android
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#3182CE",
      showSpinner: false
    }
  }
};

export default config;
```

## Troubleshooting

### iOS Issues

**Pod Install Fails:**
```bash
cd ios/App
pod install
```

**Code Signing Error:**
- Xcode → Preferences → Accounts → Add your Apple ID
- Select project → Signing → Select your team

### Android Issues

**Gradle Sync Failed:**
```bash
cd android
./gradlew clean
./gradlew build
```

**SDK Not Found:**
- Open Android Studio → SDK Manager
- Install required SDK versions

## Useful Commands

```bash
# Check Capacitor doctor for issues
npx cap doctor

# Update Capacitor
npm install @capacitor/cli@latest @capacitor/core@latest @capacitor/ios@latest @capacitor/android@latest

# Clean and rebuild
npm run build && npx cap sync

# View logs
npx cap run ios --livereload  # iOS with live reload
npx cap run android --livereload  # Android with live reload
```

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [iOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Android Design Guidelines](https://developer.android.com/design)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy](https://play.google.com/about/developer-content-policy/)
