---
title: "Syncing your work"
sidebar_position: 5.5
---
**AstraRocket does not sync.** There are no plans for a server. Your designs, motors, materials, parts, locations and settings live in **this browser on this device**, and nowhere else.

To have your work on another computer or your phone, keep its **files** in a folder a cloud service already syncs for you: **Google Drive**, **OneDrive**, **Dropbox** or **iCloud Drive**. The service does the syncing; you **export** from AstraRocket into that folder, and **import** from it on the other device.

That is also your **backup**. Clearing your browser's data, or losing the device, removes everything the app keeps (see [Offline & Installing](./offline-and-installing.md#clearing-it)). A file in a synced folder survives both.

Two kinds of file carry your work, and they move separately:

- **Your designs**, each as its own `.ork` file.
- **Everything else you set up**: materials, parts, locations, motors, templates and settings, together in one backup file.

## Setting up the folder

Install the service's own app on each device and sign in. It makes a folder on your disk that stays the same everywhere:

- **Google Drive**: **Google Drive for desktop** (Windows and Mac) adds a **Google Drive** drive or folder.
- **OneDrive**: built into Windows, and an app for Mac; it adds a **OneDrive** folder.
- **Dropbox**: the **Dropbox** desktop app adds a **Dropbox** folder.
- **iCloud Drive**: built into every Mac, iPhone and iPad, and **iCloud for Windows** adds it on Windows.

Make a folder in it for your rockets, such as **Rockets**, and use that every time.

## Your designs: `.ork` files

An `.ork` holds one rocket, with its flight configurations and its simulations. It also opens in desktop OpenRocket, so the same folder serves both.

- **Export:** **Menu → Export → OpenRocket**, and save into the synced folder.
- **Import:** **Menu → Import → OpenRocket**, and pick the `.ork` from the synced folder.

The **Open…** and **Save As…** library is not synced: it stays in this browser. Export each design you want on another device.

To move between devices:

1. **Before you switch**, export the design you were working on, under the same name each time.
2. **Give the service a moment** to upload it. Its icon shows when it is done.
3. **On the other device**, import that `.ork`. Work, then export it back to the same name.

Syncing is by file, not live. Two devices editing the same design at once each save their own copy, and the last one saved wins; most services keep the other as a "conflicted copy" beside it. Finish on one device before you start on the next.

## Your materials, parts, locations and settings: the backup file

One backup file (`.json`) holds Custom Materials, Custom Parts, Launch Locations, Imported Motors, Flight Path Templates and your settings. Designs are not in it.

- **Export:** **Menu → Export → Backup**, uncheck anything you want to leave out, then **Save backup file** into the synced folder.
- **Import:** **Menu → Import → Backup**, press **Open backup file…** and pick it from the synced folder, choose what to take, then press **Restore**.

Restoring merges your lists: an entry that matches one already there is replaced, and the rest are added. Your settings are replaced by the file's. See the [FAQ](./faq.md#how-do-i-move-my-materials-parts-and-locations-to-another-computer) for the details.

Your map and weather API keys are not in the backup, since it is a file you may hand to someone. Enter them again on each device.

Save a new backup whenever you change any of these, so the folder holds the latest.

## Saving into the folder, by device

**Chrome and Edge** on a computer ask where to save each file, so pick the synced folder. This is **Ask where to save each file** in [Settings](./settings.md), on by default.

**Firefox and Safari** on a computer save to your downloads folder. Either move the file into the synced folder afterward, or point the browser's download folder there: in Firefox, **Settings → General → Downloads**; in Safari, **Settings → General → File download location**.

**On an iPhone or iPad**, a file saved from Safari goes to the **Downloads** folder in the Files app, which is in iCloud Drive unless you changed it. With the app installed to your Home Screen, saving opens the share sheet instead: choose **Save to Files**, then iCloud Drive, or Google Drive, OneDrive or Dropbox if their apps are installed.

**On an Android phone or tablet**, a file goes to **Downloads**. Upload it from there with the Google Drive, OneDrive or Dropbox app, or share it to that app.

## Picking from the folder, by device

Importing opens your device's file picker, which reaches the synced folder:

- **On a computer**, browse to it as you would any folder.
- **On an iPhone or iPad**, the picker lists iCloud Drive, and Google Drive, OneDrive or Dropbox if their apps are installed.
- **On Android**, the picker lists Google Drive and any other storage app you have.
