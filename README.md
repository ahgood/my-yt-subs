# My YT Subscriptions

Quickly view and search your YouTube subscriptions from a Chrome toolbar popup.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `myYtSubs` folder.

## Use

1. Make sure you are signed in to YouTube in Chrome.
2. Click the **My YT Subscriptions** extension icon.
3. Use the search box to filter channels.
4. Click a channel row to open it in a new tab.
5. Use **Refresh** to re-fetch subscriptions.

## Notes

- The extension fetches https://www.youtube.com/feed/channels and parses subscription data.
- If it cannot find subscriptions, you will see a sign-in prompt and links to log in.
- Results are cached for 30 minutes in `chrome.storage.local`.
