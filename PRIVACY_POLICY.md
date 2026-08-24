# Privacy Policy

Last updated: 2026-08-23

My YT Subscriptions (the "Extension") does not collect or transmit personal data.
The only thing it saves is the list of channels you star, and that stays in your
own browser.

## Data Access
- The Extension requests access to https://www.youtube.com/feed/channels to read your subscription list when you open the overlay.
- The Extension does not send this data to any external server.

## Data Storage
- Your subscription list is cached locally in your browser, in `localStorage` on
  youtube.com under the key `myYtSubs.channels.v1`, so the overlay can open
  without re-fetching. It holds the channel names, URLs, and avatar URLs from
  your subscription page, plus the time it was fetched. It is refreshed when you
  click refresh in the overlay.
- Channels you mark as starred are stored locally in your browser, in
  `localStorage` on youtube.com under the key `myYtSubs.starred.v1`. Each entry
  holds the channel URL, name, and avatar URL. This stays on your device.
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
