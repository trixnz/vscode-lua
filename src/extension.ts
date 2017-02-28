'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';

import {
    LanguageClient, LanguageClientOptions, ServerOptions,
    TransportKind
} from 'vscode-languageclient';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const serverModule = path.join(__dirname, '../server', 'main.js');

    const debugOptions = {
        execArgv: ['--nolazy', '--debug=6009'], env: {
            NODE_ENV: 'development'
        }
    };

    const runOptions = {
        env: {
            NODE_ENV: 'production'
        }
    };

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, options: runOptions },
        debug: {
            module: serverModule, transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: ['lua'],
        synchronize: {
            configurationSection: [
                'lua'
            ]
        }
    };

    // Create the language client and start the client.
    const disposable = new LanguageClient('luaLanguageServer',
        'Lua Language Server', serverOptions, clientOptions).start();

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
