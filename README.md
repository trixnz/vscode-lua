[![Build Status](https://travis-ci.org/trixnz/vscode-lua.svg?branch=master)](https://travis-ci.org/trixnz/vscode-lua) [![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/version/trixnz.vscode-lua.svg)](https://marketplace.visualstudio.com/items?itemName=trixnz.vscode-lua)

# Lua for Visual Studio Code
Provides Intellisense and Linting for Lua in VSCode

## Features
- [x] Autocompletion
- [x] Go to Symbol
- [x] Error checking
- [x] Linting
- [x] Formatting
- [ ] Code Snippets

## Installing
* Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:
* `ext install vscode-lua`

Alternatively, you can download the extension from the [marketplace](https://marketplace.visualstudio.com/items?itemName=trixnz.vscode-lua).

## Luacheck
Support for linting is provided via [luacheck](https://github.com/mpeterv/luacheck). Installation instructions can be found on the `luacheck` [repository](https://github.com/mpeterv/luacheck#installation).

Once installed, `luacheck` support can be activated by assigning the `lua.luacheckPath` setting to the path of the `luacheck` executable. Additionally, since `luacheck` provides vastly more detailed and contextually aware errors that may sometimes duplicate those created by `luaparse`, the setting `lua.preferLuaCheckErrors` can be set to `true` to suppress `luaparse` errors.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments
* [Oskar Schöldström](https://github.com/oxyc) - [luaparse](https://github.com/oxyc/luaparse): A Lua parser written in JavaScript
* [Mikael Hermansson](https://github.com/mihe) - [node-hot](https://github.com/mihe/node-hot): Hot-reloading for Node.js
* [Peter Melnichenko](https://github.com/mpeterv) - [luacheck](https://github.com/mpeterv/luacheck): A tool for linting and static analysis of Lua code.
