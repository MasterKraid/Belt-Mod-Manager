# Belt Mod Manager (Belt MM)

A desktop application to manage mod profiles for Factorio. Switch mods on/off using profile-based presets.

## Features

- **Tauri 2.0 + Webview2**: Blazing fast, lightweight desktop framework (replacing legacy Electron)
- **Bun Runtime Execution**: High-speed, modern test runner and package manager integration
- **Profile Presets**: Instantly switch, rename, or clone customized mod lists
- **Advanced Downloader**: Search, browse, and download mods with automatic recursive dependency resolution
- **Flexible Downloads**: Leverages the re146.dev mirror (no login required) with seamless official API fallback
- **AES-256-GCM Encryption**: Secure machine-bound credential storage for official Factorio portal login

## Architecture

* **Frontend**: HTML5, Vanilla CSS / SCSS, and Vue.js
* **Backend**: Express.js server and Worker threads fully isolated inside the `/backend` directory
* **Native Shell & Window Layer**: Rust (Tauri 2.0)

## Version History

- **v0.9.6**
  - **Tauri 2.0 & Bun Migration**: Upgraded native shell from Electron to Tauri 2.0, achieving a tiny build footprint.
  - **Bun Integration**: Replaced Jest with the Bun test runner, dropping test suite runtime by over 88% (~1.18s).
  - **Clean Subdirectory Structure**: Consolidated background processes, configurations, and worker engines into the `backend/` directory.
  - **Premium UI Borders**: Disabled OS-level drop shadows inside Webview2 configurations to remove transparent border outlines.
  - **Restored Window Actions**: Fully wired Tauri client-side APIs for frameless window minimize and exit events with matching sound effects.
  - **Clean Assets**: Removed redundant `.png` and `.icns` binary files, pinning the resource compiler to the required `icon.ico` to keep the Git workspace pristine.
- **v0.9.1**
  - Secure credential storage (AES-256-GCM, machine-bound key via PBKDF2)
  - Auth profile button with encrypted username/token popup
  - Download source logic: auth creds → official API, no creds → re146.dev mirror
  - Thumbnail proxy endpoint fixes all mod portal images
  - Custom dropdown filters for Sort and Category
  - Sound effects on all filter/dropdown interactions and tabs
  - Auth status indicator in filter row
- **v0.9.0**
  - Implemented Downloader tab: search/browse Factorio Mod Portal, download mods with progress tracking
  - Recursive dependency resolution with optional deps toggle
  - Per-file progress bars, download speed display, retry logic (3 attempts)
  - Concurrent download limiting (3 simultaneous)
  - Skip-already-installed detection
  - Downloads panel with status icons
- **v0.8.0**
  - Rebranded application to "Belt Mod Manager" ("Belt MM")
  - Custom application icons
  - Custom text selection overrides
  - Standardized console logs to pure ASCII to prevent Windows terminal Mojibake

## Getting Started

### Prerequisites

Ensure you have [Rust](https://www.rust-lang.org/) and [Bun](https://bun.sh/) installed.

### Launching the Application

Run the following command to boot the development server and open the native Tauri window:

```bash
bun start
```

### Running Tests

Execute the lightning-fast test suite:

```bash
bun test
```

## Authors & Credits

* **Author**: Kraid | Tathagata S. under Kivx.in
* **Credits**:
  * Special thanks to **vaibhavvikas** of [factorio-mod-downloader](https://github.com/vaibhavvikas/factorio-mod-downloader) for inspiration on the downloader alpha version behavior.

## License

This project is licensed under the [MIT License](LICENSE).