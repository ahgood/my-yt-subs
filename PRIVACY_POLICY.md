# Privacy Policy

Last updated: 2026-08-24

My YT Subscriptions (the "Extension") does not collect or transmit personal data.
The only thing it saves is the list of channels you star, and that stays in your
own browser.

## Data Access
- The Extension requests access to https://www.youtube.com/feed/channels to read your subscription list when you open the overlay.
- The Extension does not send this data to any external server.

## Data Storage
- Your subscription list is cached locally on your own device, in the
  Extension's storage (`chrome.storage.local`, key `myYtSubs.channels.v1`), so
  the overlay can open without re-fetching. It holds the channel names, URLs,
  and avatar URLs from your subscription page, plus the time it was fetched. It
  is refreshed when you click refresh in the overlay.
- Channels you mark as starred are stored the same way, under the key
  `myYtSubs.starred.v1`. Each entry holds the channel URL, name, and avatar URL.
  This stays on your device.
- Versions up to 1.2.1 kept both in your browser's `localStorage` on youtube.com.
  Updating moves that data into the Extension's own storage and deletes the old
  copies. Nothing is transmitted at any point.
- Nothing is stored remotely, and starred channels are never transmitted
  anywhere.
- Exporting writes your starred channels to a JSON file that you choose the
  location of. Importing reads a file you pick. Neither step contacts a
  server.

## Analytics
- The Extension does not use analytics, tracking, or advertising services.

## Contact
If you have questions about this policy, contact: ahgood@gmail.com

## Changes
If this policy changes, it will be updated on this page.
