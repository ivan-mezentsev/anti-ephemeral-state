# Anti-Ephemeral State for Obsidian

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/ivan-mezentsev/anti-ephemeral-state.svg)](https://github.com/ivan-mezentsev/anti-ephemeral-state/issues)
[![plugin](https://img.shields.io/github/v/release/ivan-mezentsev/anti-ephemeral-state?label=plugin&display_name=tag&logo=obsidian&color=purple&logoColor=violet)](https://github.com/ivan-mezentsev/anti-ephemeral-state/releases/latest)
[![downloads](https://img.shields.io/github/downloads/ivan-mezentsev/anti-ephemeral-state/total?logo=github)](href="https://github.com/ivan-mezentsev/anti-ephemeral-state)
[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?color=7e6ad6&labelColor=34208c&label=Obsidian%20Downloads&query=$['anti-ephemeral-state'].downloads&url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json&)](obsidian://show-plugin?id=anti-ephemeral-state)
![GitHub stars](https://img.shields.io/github/stars/ivan-mezentsev/anti-ephemeral-state?style=flat)

Return exactly where you left off in every Obsidian note - scroll, cursor, view mode.

## 📋 Changelog

For detailed changes, see [CHANGELOG.md](CHANGELOG.md).

## Demo

![demo01](docs/demo01.gif)
![demo02](docs/demo02.gif)

## 🔧 How it Works

The plugin combats ephemerality by preserving each note's state in separate JSON files, enabling seamless synchronization across devices when Obsidian sync is configured. By storing state data in individual files, conflicts are limited to specific notes rather than affecting the entire database as a whole.

The state is read every time a file is opened and saved half a second after the last changes in the document. This aggressive approach to fighting ephemerality allows you to focus on your work without being distracted by primitive concerns like scrolling to position and remembering the last selected text fragment.

**Key benefits:**

- **Cross-device synchronization** - State files sync with your vault, maintaining consistency across all devices
- **Isolated conflicts** - Individual state files limit conflicts to specific notes rather than the entire vault
- **Automatic persistence** - State is automatically saved and restored without manual intervention
- **Anti-ephemeral design** - Eliminates the temporary nature of view states, preserving your exact working context

## 🔒 Lock Mode (optional)

Keep notes safe from accidental edits and spot external changes at a glance.

- Status bar icon: click to Lock ● / Unlock ○ the active note. Lock switches it to Reading view and marks it as protected. The icon reflects the current state.
- Auto-return: if you start editing a protected note, it instantly snaps back to Reading and shows a short notice "Lock Mode enabled".
- External changes: when a protected note was modified outside Obsidian, a "✖" indicator appears with tooltip "File content was modified externally". Clicking it performs the same toggle as the lock icon.
- Command Palette: the "Lock/Unlock" command mirrors the icon’s action.
- Settings: toggle "Enable Lock Mode" in plugin settings.
- Compatibility: works seamlessly with cursor, scroll, and view mode restore.

## 🚀 Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Navigate to Community Plugins
3. Search for "Anti-Ephemeral State"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from [GitHub](https://github.com/ivan-mezentsev/anti-ephemeral-state/releases)
2. Extract to your vault's `.obsidian/plugins/anti-ephemeral-state/` directory
3. Enable the plugin in Obsidian settings

### With BART

1. Install [BART](https://github.com/Sytone/obsidian-braty)
2. In Obsidian, open the command palette
3. Run `Brat: Add a beta plugin for testing`
4. Paste `ivan-mezentsev/anti-ephemeral-state`
5. BART will install the plugin
6. Enable the plugin in Obsidian settings

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

For issues or feature requests, visit the [GitHub repository](https://github.com/ivan-mezentsev/anti-ephemeral-state).

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Credits

Special thanks to:

- **Dmitry Savosh** - for the core idea and basic implementation examples from [obsidian-remember-cursor-position](https://github.com/dy-sh/obsidian-remember-cursor-position)

---

**Transform your Obsidian experience with individual note state persistence!**
