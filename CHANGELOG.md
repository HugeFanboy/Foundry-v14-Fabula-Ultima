# Changelog

All notable changes to this Foundry VTT v14 fork of the Fabula Ultima system are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Release versions follow the Foundry VTT build they are verified against.

## [Unreleased]

### Added

- **Import from Fultimator** button in the Project FU sidebar (Utilities). It creates NPCs and player characters from JSON exported from [Fultimator](https://fultimator.com), from uploaded files or pasted text. Both the current and the older export formats are supported. Classes, skills, heroic skills and spells with matching names are taken from the system compendium, so their automation works. Class features with special rules (such as arcana or alchemy) and custom weapons are listed for manual setup.

## [v14.370.0] - 2026-11-05

First release of the Foundry v14 fork. Verified against Foundry VTT 14.370.

### Added

- **Ultima Power Rolls** homebrew setting (Settings → Homebrew, off by default). Attacks always hit. Damage uses a High Roll of 0 (HR0) unless the result is strictly greater than the target's Defense or Magic Defense, or the roll is a critical. Chat cards show which targets took HR0.

### Changed

- Replaced deprecated globals with their v14 equivalents: `FilePicker`, `ImagePopout`, `FormDataExtended`, `loadTexture`, `VideoHelper`, `KeyboardManager` and `TextEditor`.
- Formula rolls use `messageMode` instead of the deprecated `rollMode`.
- Temporary effects use the v14 duration format (`value`/`units`).
- Tinkerer Alchemy reads roll table results with `getHTML()` instead of the deprecated `getChatText()`.
- Releases are published to GitHub only, not to the foundryvtt.com package registry.
- Codebase cleanup: removed dead and commented-out code and unused files, and made code style consistent.

### Fixed

- Jumping to a journal page from the item selection dialog, which relied on a hook that no longer fires in v14.
- The compatibility shim for the deprecated `ActiveEffectDuration#duration`, which always returned nothing.

[Unreleased]: https://github.com/HugeFanboy/Foundry-v14-Fabula-Ultima/compare/v14.370.0...dev
[v14.370.0]: https://github.com/HugeFanboy/Foundry-v14-Fabula-Ultima/releases/tag/v14.370.0
