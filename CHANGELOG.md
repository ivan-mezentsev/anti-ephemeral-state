# Changelog

## 1.1.3 - 2026-01-21

- refactor(logging): replace console.log with console.debug
- refactor(tests): fix lint
- chore(package): update linting configuration and dependencies

## 1.1.0 - 2025-08-18

- feat: add Lock Mode (status bar lock/unlock, Reading enforcement, external change indicator, live enable/disable)
- feat: add "Lock/Unlock" command (Command Palette), synced with status bar icon
- feat(settings): enable Lock Mode by default
- fix: reduce Lock Mode notice duration
- tests: add unit and integration tests for Lock Mode
- tasks: add task configuration for running unit tests

## 1.0.2 - 2025-08-07

- fix: ensure correct file state restoration on layout change

## 1.0.1 - 2025-08-02

- refactor: move DEFAULT_SETTINGS to class property and use configDir

## 1.0.0 - 2025-08-01

- First fully functional public release
