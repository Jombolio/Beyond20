# Installing Beyond20 with the Foundry VTT 14 fixes

This fork of Beyond20 has the fixes needed for Foundry VTT 14 and dnd5e 6. The Chrome Web Store
release doesn't have them yet, so Chrome installs this build straight from this repository and keeps
it up to date from there.

It installs as a separate extension called **Beyond 20 (dev)**, with its own settings and site
permissions. Settings from the store version don't carry over.

## Before you start

Disable the Chrome Web Store copy of Beyond20 at `chrome://extensions`. Running both at once makes
every roll fire twice.

## Install on Linux

Chrome allows extensions hosted outside the store on Linux. Windows and macOS don't, so use the
[unpacked build](#install-anywhere-unpacked-build) there.

1. Create the file that points Chrome at this repository:

   ```bash
   sudo mkdir -p /opt/google/chrome/extensions
   echo '{ "external_update_url": "https://raw.githubusercontent.com/Jombolio/Beyond20/chrome-dev-updates/update.xml" }' \
     | sudo tee /opt/google/chrome/extensions/aiaomoikbbkghoegboakkdoopcenphga.json
   sudo chmod 644 /opt/google/chrome/extensions/aiaomoikbbkghoegboakkdoopcenphga.json
   ```

   For Chromium, use `/usr/share/chromium/extensions/` instead. Some Chrome packages read
   `/usr/share/google-chrome/extensions/`; if the extension doesn't appear, put the file there too.

2. Quit Chrome completely and start it again. Linux installs the extension without prompting.

3. Open `chrome://extensions` and check that **Beyond 20 (dev)** is listed. Its version is the
   Beyond20 version with the build number added, such as `2.21.0.1`.

4. Open your Foundry VTT tab and click the Beyond20 icon in the toolbar to activate it for that
   site, the same as with the store version.

## Updating

Every push to `fvtt-v14-compat-test` publishes a new build. Chrome picks it up within a few hours,
or immediately if you turn on Developer mode at `chrome://extensions` and click **Update**. A fresh
build can take about five minutes to become available.

## Removing it

Delete the file you created and restart Chrome:

```bash
sudo rm /opt/google/chrome/extensions/aiaomoikbbkghoegboakkdoopcenphga.json
```

Removing it only from the extensions page can leave Chrome refusing to install it again.

## Install anywhere: unpacked build

This works on every platform and in Firefox, but it doesn't update itself.

```bash
git clone --branch fvtt-v14-compat-test https://github.com/Jombolio/Beyond20.git
cd Beyond20
npm install
npm run build
```

Then follow [Developer Mode Installation](../README.md#developer-mode-installation) in the README,
loading `build/chrome` in Chrome or `build/firefox/manifest.json` in Firefox. Firefox drops a
temporary add-on when it restarts, so you have to load it again each time.

## Foundry VTT companion module

The matching companion module isn't released yet either. Install it in Foundry through
**Add-on Modules → Install Module** with this manifest URL:

```
https://raw.githubusercontent.com/Jombolio/Beyond20/fvtt-v14-compat-test/FVTT-module/beyond20/module.json
```

Uninstall the old Beyond20 module first, since Foundry won't offer this as an update.

## How the build is made

`.github/workflows/chrome-dev.yml` runs on every push to `fvtt-v14-compat-test`. It builds the
extension, signs it with a private key kept as a repository secret, and publishes the package with
its update manifest on the `chrome-dev-updates` branch. The signing key fixes the extension's ID as
`aiaomoikbbkghoegboakkdoopcenphga`, which is how Chrome recognises later builds as updates.

These builds are unofficial: they come from this fork rather than the Chrome Web Store, so Google
doesn't review them. The store release is the upstream version and doesn't have the Foundry 14
fixes, so if you go back to it, remove this build first or every roll fires twice.
