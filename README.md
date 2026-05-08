# Belt Mod Manager (Belt MM)

A desktop application to manage mod profiles for Factorio. Switch mods on/off using profile-based presets.

## Features

- Vue.js interface inside Electron
- Profile creation, renaming, and switching
- Enable/Disable all mods instantly
- Mod downloads tab with search, browse, and dependency resolution
- Downloads from re146.dev mirror (no login required) with official API fallback

## Version History

- **v0.9.1**
  - Secure credential storage (AES-256-GCM, machine-bound key via PBKDF2)
  - Auth profile button with encrypted username/token popup
  - Download source logic: auth creds → official API, no creds → re146.dev mirror
  - Thumbnail proxy endpoint fixes all mod portal images in Electron
  - Custom dropdown filters for Sort and Category (replaces native `<select>`)
  - Category filter: Content, Overhaul, Tweaks, Utilities, Scenarios, etc.
  - Sound effects on all filter/dropdown interactions
  - Auth status indicator in filter row
- **v0.9.0**
  - Implemented Downloader tab: search/browse Factorio Mod Portal, download mods with progress tracking
  - Recursive dependency resolution with optional deps toggle
  - Per-file progress bars, download speed display, retry logic (3 attempts)
  - Concurrent download limiting (3 simultaneous)
  - Skip-already-installed detection
  - Downloads panel with status icons (downloading/complete/retrying/failed/cancelled)
- **v0.8.5**
  - Fine-tuned layout spacing and vertical gaps across all tabs
  - Updated footer gap enforcement and recompiled styles
- **v0.8.0**
  - Rebranded application to "Belt Mod Manager" ("Belt MM")
  - Added custom application icons using Assets/Belt.ico and Belt.png
  - Custom text selection overrides (enabled selection only inside inputs, profile boxes, and Installed Mods list)
  - Disabled spellchecking and red underlines on all input fields
  - Re-aligned active profile switch handles
  - Standardized console logs to pure ASCII to prevent Windows terminal Mojibake
- **v0.7.0**
  - Added metadata caching and parallelized startup requests for fast loading
- **v0.6.0**
  - Compacted Mod and Game folders into a single paths settings box
  - Added inline Accept/Cancel buttons for profile creation/editing
- **v0.5.0**
  - Fixed wildcard routing collisions in API endpoints
- **v0.4.0**
  - Replaced text boxes with native OS folder picker dialogs
- **v0.3.0**
  - Converted styling to SASS and added custom scrollbars
- **v0.2.0**
  - Implemented profile preset file synchronization
- **v0.1.0**
  - Initial project structure