import * as vscode from 'vscode';
import * as path from 'path';
import { VersionSelector } from './versionSelector';

import {
    LanguageClient, LanguageClientOptions, ServerOptions,
    TransportKind
} from 'vscode-languageclient';

export function activate(context: vscode.ExtensionContext) {
    startLanguageServer(context);

    context.subscriptions.push(new VersionSelector());
}

export function deactivate() {
}

function startLanguageServer(context: vscode.ExtensionContext) {
    const serverModule = path.join(__dirname, '../server', 'main.js');

    const debugOptions = {
        execArgv: ['--nolazy', '--inspect=6009'], env: {
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
            module: serverModule,
            transport: TransportKind.ipc,
            // The current version of node shipped with VSCode Insiders (as of April 3 2017) seems to have an issue with
            // --inspect debugging, so we'll assume that someone debugging the extension has a recent version of node on
            // on their PATH.
            // If you do not, comment this line out and replace the --inspect above with --debug.
            runtime: 'node',
            options: debugOptions
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [
            { language: 'lua', scheme: 'file' },
            { language: 'lua', scheme: 'untitled' }
        ],
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
