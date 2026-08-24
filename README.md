# My YT Subscriptions

Quickly view and search your YouTube subscriptions from an in-page overlay.

![My YT Subscriptions](https://github.com/ahgood/my-yt-subs/blob/main/assets/screens/my-yt-subscriptions.png?raw=true)

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `myYtSubs` folder.

## Use

1. Make sure you are signed in to YouTube in Chrome.
2. Click the **My YT Subscriptions** extension icon to open the overlay.
3. Use the search box to filter channels.
4. Click a channel card to open it in a new tab.
5. Click the star on a card to move that channel into the **Starred** section at
   the top. Click the star again to unstar it and send it back to All channels.
6. Click the **refresh** icon in the top right to re-fetch your subscriptions
   from YouTube. The list is cached, so this is how you pick up channels you
   have subscribed to or unsubscribed from since it was last fetched.
7. Use **Export starred** to save your starred channels as a JSON file, and
   **Import starred** to load one back. Importing merges with what you already
   have, so it never removes a star.
8. Click the close button or press Esc to dismiss the overlay.

## Notes

- The extension fetches https://www.youtube.com/feed/channels and parses subscription data.
- If it cannot find subscriptions, you will see a sign-in prompt and links to log in.
- The channel list is cached in `localStorage` on youtube.com under
  `myYtSubs.channels.v1`, so the overlay opens without waiting on a fetch. It is
  only fetched automatically when that cache is empty; use refresh at any time
  to update it. Hovering refresh shows how old the list is.
- A failed refresh keeps the list you already have and reports the problem in
  the footer, so a network blip cannot leave you with an empty overlay.
- Starred channels are the one exception: the channel URL, name, and avatar URL
  are saved in `localStorage` on youtube.com under `myYtSubs.starred.v1`, so
  they survive a browser restart. Clearing YouTube site data clears them, which
  is what export and import are for.
- A starred channel you later unsubscribe from stays in the Starred section,
  shown dimmed, until you unstar it.
- Both sections are listed alphabetically: digits first, then letters (case
  insensitive, accents folded), then other scripts. Numbers inside a name sort
  numerically, so "Episode 2" comes before "Episode 10".

## Screenshots

- `assets/screens/my-yt-subscriptions.png`
- `assets/screens/my-yt-subscriptions-search.png`

## Privacy

- Privacy policy: https://github.com/ahgood/my-yt-subs/blob/main/PRIVACY_POLICY.md
