# BunkSafe Android APK (Trusted Web Activity)

This folder adds the server endpoints needed for Android TWA packaging while preserving the existing Flask app, Vercel deployment, and Neon PostgreSQL setup.

## Important before building

A Trusted Web Activity (TWA) is a thin Android launcher for the existing HTTPS website. It does not bundle the website or database into the APK. BunkSafe still needs internet access and the deployed Vercel app and Neon database must remain available.

TWA full-screen verification requires Digital Asset Links. The file at `/.well-known/assetlinks.json` is intentionally a placeholder (`[]`) until you generate the Android signing key and fingerprint. Do not expect verified full-screen mode until you replace it with the generated file and redeploy.

Use the stable **Production** domain shown in Vercel → Settings → Domains. Do not use an ephemeral preview deployment URL. If your custom domain is still invalid, use the stable `*.vercel.app` Production domain assigned by Vercel.

## 1. Deploy the web prerequisites

1. Merge/copy these files into your existing local `BunkSafe` repository. Keep the existing `.git` folder and `.env` file; never upload `.env`.
2. Commit and push to the same GitHub repository so Vercel deploys the changes:

   ```powershell
   git add app.py static/branding/twa-manifest.json .well-known/assetlinks.json README_ANDROID_TWA.md build-android-twa.bat
   git commit -m "Add Android TWA support"
   git push
   ```

3. In Vercel, wait for the Production deployment to finish.
4. Open these URLs using your stable Production host and verify they return JSON (not a 404 or HTML page):
   - `https://YOUR-PRODUCTION-HOST/manifest.json`
   - `https://YOUR-PRODUCTION-HOST/.well-known/assetlinks.json`

   The first should show the BunkSafe manifest. The second will show `[]` until the signing fingerprint is added in step 4.

## 2. Install Android build tools on Windows

Install:
- Node.js LTS (18 or newer recommended): https://nodejs.org/
- Android Studio: https://developer.android.com/studio (install Android SDK and accept SDK licenses when prompted)

Open a new PowerShell window and run:

```powershell
node --version
npm --version
npm install -g @bubblewrap/cli
bubblewrap --version
```

The first Bubblewrap run may prompt to download/configure Java and Android build tools. Accept the prompts and Android SDK licenses.

## 3. Validate and create the TWA Android project

Replace `YOUR-PRODUCTION-HOST` with the stable host from Vercel. Include `https://` and do not add a path other than `/manifest.json`.

```powershell
bubblewrap validate --url=https://YOUR-PRODUCTION-HOST/
mkdir android-twa
bubblewrap init --manifest=https://YOUR-PRODUCTION-HOST/manifest.json --directory=android-twa
cd android-twa
```

When prompted, use these suggested values:
- App name: `BunkSafe — Attendance Planner`
- Launcher name: `BunkSafe`
- Package ID: `com.jeevanth.bunksafe` (choose carefully; changing it later creates a different Android app)
- Host: your stable Production host
- Start URL: `/`
- Theme/background colors: `#090d18`
- App icon: the manifest's 512×512 BunkSafe icon

Choose a signing-key/keystore password you can safely retain. **Back up the keystore and remember its password**; losing it can prevent you from publishing future updates under the same app identity. Do not commit the keystore or passwords to GitHub.

Build the APK:

```powershell
bubblewrap build
```

Bubblewrap normally creates `app-release-signed.apk` and an Android App Bundle in the TWA project directory (the exact output path is shown in the command output). The APK can be installed directly on an Android test phone.

## 4. Enable verified full-screen mode

From inside the `android-twa` folder, generate Digital Asset Links using the same signing key used to build the APK:

```powershell
bubblewrap fingerprint generateAssetLinks --output=../.well-known/assetlinks.json
```

If your Bubblewrap version reports a command/option error, run `bubblewrap fingerprint --help` and follow the installed CLI's syntax. Do not manually invent the fingerprint. The generated JSON must contain the exact package ID and SHA-256 fingerprint for the signing certificate used by the installed APK.

Return to the repository root and deploy the generated file:

```powershell
cd ..
git add .well-known/assetlinks.json
git commit -m "Add Android TWA Digital Asset Links"
git push
```

Wait for Vercel Production deployment to finish. Confirm `https://YOUR-PRODUCTION-HOST/.well-known/assetlinks.json` returns the generated JSON. Keep the host identical to the one configured in the Android TWA.

**Signing note:** If you later publish through Google Play and use Play App Signing, you may need to add the Play app-signing certificate fingerprint as well as the local upload/debug certificate. Keep fingerprints aligned with the certificate that signs the APK users install.

## 5. Install and test on Android

Copy `app-release-signed.apk` to the phone and open it to install (allow installation from that source if Android asks). Test registration/login, attendance changes, persistence after relaunch, navigation, and back button behavior. The app requires an internet connection because the backend remains on Vercel/Neon.

If browser chrome appears around the page, Digital Asset Links verification likely failed. Check that the `.well-known` URL is publicly reachable over HTTPS, returns valid JSON, and contains the exact package ID and signing fingerprint.

## Files added/changed by this TWA setup

- `app.py`: adds `/manifest.json` and `/.well-known/assetlinks.json` routes only.
- `static/branding/twa-manifest.json`: Android/PWA metadata and 512×512 app icon reference.
- `.well-known/assetlinks.json`: placeholder until the signing fingerprint is generated.
- `build-android-twa.bat`: opens a guided command window for the build workflow.

Official references:
- Chrome TWA overview: https://developer.chrome.com/docs/android/trusted-web-activity/
- Android TWA guide: https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2
- Bubblewrap CLI: https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli
