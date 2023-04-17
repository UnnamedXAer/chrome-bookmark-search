# ![logo](./icons/icon48.png) Chrome Bookmarks & Tabs

This project is a chrome extension for keyboard heavy users to easily switch tabs or open bookmarks.

It displays and allows to filter list of opened tabs (except the incognito) and all bookmarks to quickly find and open them.

----------------

## Usage

Extension is triggered via shortcut <kbd>Ctrl+M</kbd>, this can be change from: [`chrome://extensions/shortcuts`](chrome://extensions/shortcuts).
 > Preferred shortcut would be <kbd>Ctrl+P</kbd> but that is assigned for printing and setting it from the manifest won't override existing binding however if the shortcut is change via *chrome://extensions/shortcuts* then it will override existing one so any shortcut is possible with this workaround.

The extensions has a few shortcuts that cover common needs while opening bookmarks urls or switching the tabs (see [`help.json`](./src/popup/help.json) or within extension itself the information icon).

----------------

## Installation

- You can use `chrome-ext.zip` from the [Releases](https://github.com/UnnamedXAer/chrome-bookmark-search/releases). 

  - download the `chrome-ext.zip`
  - goto *chrome://extensions*
  - enable `Developer mode`
  - drag&drop the zip file into chrome extensions tab.

- To build the extension from source:

  - clone the repo
  - build it using `tsc`.
  - go to *chrome://extensions*, enable `Developer mode`
  - use `Load unpacked` selecting the folder with source code (manifest.json should be at the root folder).

*Chrome does not allow to use packed extensions that are not installed via Chrome Web Store therefore there is no point of building one.*
