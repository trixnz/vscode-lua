import {
    IPCMessageReader, IPCMessageWriter,
    createConnection,
    InitializeResult,
    Diagnostic, DiagnosticSeverity, Range,
    CompletionItem,
    TextDocument, TextDocuments, TextDocumentChangeEvent, TextDocumentPositionParams,
    DocumentSymbolParams, DocumentFormattingParams, DocumentRangeFormattingParams,
    TextEdit,
    SymbolInformation, WorkspaceSymbolParams, InitializeParams
} from 'vscode-languageserver';

import { getCursorWordBoundry } from './utils';
import * as Analysis from './analysis';
import { CompletionService } from './services/completionService';
import { buildDocumentSymbols } from './services/documentSymbolService';
import { buildWorkspaceSymbols } from './services/workspaceSymbolService';
import { buildLintingErrors } from './services/lintingService';
import { buildDocumentFormatEdits, buildDocumentRangeFormatEdits } from './services/formatService';

import { readFiles, FileNamedCallback } from 'node-dir';
import Uri from 'vscode-uri';

import * as luaparse from 'luaparse';

export interface FormatOptions {
    enabled: boolean;
    indentCount: number;
    useTabs: boolean;
    lineWidth: number;
    singleQuote: boolean;
    linebreakMultipleAssignments: boolean;
}

export interface Settings {
    luacheckPath: string;
    preferLuaCheckErrors: boolean;
    targetVersion: string;
    format: FormatOptions;
}

class ServiceDispatcher {

    private connection = createConnection(
        new IPCMessageReader(process),
        new IPCMessageWriter(process)
    );

    private rootUri: string | null = null;
    private settings: Settings = {} as any;
    private documents: TextDocuments = new TextDocuments();
    private perDocumentAnalysis = new Map<string, Analysis.Analysis>();
    private readonly triggerCharacters = ['.', ':'];

    public constructor() {
        this.documents.onDidChangeContent(change => this.onDidChangeContent(change));
        this.documents.onDidClose(change => this.onDidClose(change));

        this.connection.onInitialize(handler => this.onInitialize(handler));
        this.connection.onCompletion(pos => this.onCompletion(pos));
        this.connection.onDocumentSymbol(handler => this.onDocumentSymbol(handler));
        this.connection.onWorkspaceSymbol(handler => this.onWorkspaceSymbol(handler));
        this.connection.onDidChangeConfiguration(change => this.onDidChangeConfiguration(change));
        this.connection.onDocumentFormatting((params) => this.onDocumentFormatting(params));
        this.connection.onDocumentRangeFormatting((params) => this.onDocumentRangeFormatting(params));

        this.documents.listen(this.connection);
        this.connection.listen();
    }

    private onInitialize(initializeParams: InitializeParams): InitializeResult {
        this.rootUri = initializeParams.rootUri;

        return {
            capabilities: {
                // Use full sync mode for now.
                // TODO: Add support for Incremental changes. Full syncs will not scale very well.
                textDocumentSync: this.documents.syncKind,
                documentSymbolProvider: true,
                workspaceSymbolProvider: true,
                completionProvider: {
                    resolveProvider: false,
                    triggerCharacters: this.triggerCharacters
                },
                documentFormattingProvider: true,
                documentRangeFormattingProvider: true
            }
        };
    }

    private onDocumentSymbol(handler: DocumentSymbolParams): SymbolInformation[] {
        const uri = handler.textDocument.uri;
        const analysis: Analysis.Analysis = this.perDocumentAnalysis[uri];

        return buildDocumentSymbols(uri, analysis);
    }

    private onWorkspaceSymbol(handler: WorkspaceSymbolParams) {
        if (!this.rootUri) {
            return [];
        }

        const query = handler.query.toLowerCase();

        return new Promise<SymbolInformation[]>((resolve, reject) => {
            const symbols: SymbolInformation[] = [];
            const callback: FileNamedCallback = (err, content, filename, next) => {
                if (err) {
                    return;
                }

                try {
                    const analysis = new Analysis.Analysis();
                    analysis.end(content.toString());
                    analysis.buildGlobalSymbols();

                    symbols.push(...buildWorkspaceSymbols(filename, query, analysis));
                } catch (e) {
                }

                next();
            };

            const uri = Uri.parse(this.rootUri!);
            readFiles(uri.fsPath, { match: /.lua$/ }, callback, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(symbols);
            });
        });
    }

    private onCompletion(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] {
        const uri = textDocumentPosition.textDocument.uri;
        const document = this.documents.get(uri);

        if (!document) {
            return [];
        }

        const documentText = document.getText();

        const { prefixStartPosition, suffixEndPosition } = getCursorWordBoundry(documentText,
            textDocumentPosition.position);

        const startOffset = document.offsetAt(prefixStartPosition);
        const endOffset = document.offsetAt(suffixEndPosition);

        const analysis = new Analysis.Analysis();
        // Write everything up to the beginning of the potentially invalid text
        analysis.write(documentText.substring(0, startOffset));

        // Is the completion for a table?
        let isTableScoped = false;

        const charAt = documentText.charAt(startOffset - 1);
        // If the completion is prefixed by a trigger character, insert a dummy function call to keep the Lua
        // syntactically valid and parsable.
        if (this.triggerCharacters.indexOf(charAt) >= 0) {
            analysis.write('__completion_helper__()');
            isTableScoped = true;
        }

        // Insert a scope marker to help us find which scope we're in
        analysis.write('__scope_marker__()');

        // And everything after
        try {
            analysis.end(documentText.substring(endOffset));
            analysis.buildScopedSymbols(isTableScoped);
        } catch (err) {
            if (!(err instanceof SyntaxError)) { throw err; }

            // Suppress the failure due to syntax errors
            return [];
        }

        const suggestionService = new CompletionService(analysis);

        const word = documentText.substring(startOffset, endOffset);
        return suggestionService.buildCompletions(word.toLowerCase());
    }

    private onDidChangeContent(change: TextDocumentChangeEvent) {
        this.parseAndLintDocument(change.document).then(diagnostics => {
            this.connection.sendDiagnostics({
                uri: change.document.uri,
                diagnostics
            });
        });
    }

    private onDidClose(change: TextDocumentChangeEvent) {
        this.connection.sendDiagnostics({
            uri: change.document.uri,
            diagnostics: []
        });
    }

    private onDidChangeConfiguration(change: any) {
        const oldVersion = this.settings ? this.settings.targetVersion : null;
        this.settings = change.settings.lua as Settings;

        // Because the JSON we get in `change` can be anything, we need to make sure that we've actually been passed
        // a valid type, and not something else, like a string.
        const validateSetting = <T>(v: any, defaultVal: T) => {
            if (typeof (v) === typeof (defaultVal)) { return v; }
            return defaultVal;
        };

        this.settings.preferLuaCheckErrors = validateSetting<boolean>(this.settings.preferLuaCheckErrors, false);
        // indentCount defaults to `null`, which means we should use the editor settings. Anything else shall override
        // what the editor tells us.
        if (this.settings.format.indentCount !== null) {
            this.settings.format.indentCount = validateSetting<number>(this.settings.format.indentCount, 4);
        }
        this.settings.format.lineWidth = validateSetting<number>(this.settings.format.lineWidth, 120);
        this.settings.format.singleQuote = validateSetting<boolean>(this.settings.format.singleQuote, false);
        this.settings.format.linebreakMultipleAssignments = validateSetting<boolean>(
            this.settings.format.linebreakMultipleAssignments, false);

        // Validate the version. onDidChangeConfiguration seems to be called for every keystroke the user enters,
        // so its possible that the version string will be malformed.
        if (!['5.1', '5.2', '5.3'].includes(this.settings.targetVersion)) {
            this.settings.targetVersion = '5.1';
        }

        // Update luaparse to reflect the user's choice in Lua version. This is much easier than
        // remembering to pass it in every time we may use it.
        luaparse.defaultOptions.luaVersion = this.settings.targetVersion;

        // If the version has changed, we best act on it.
        if (oldVersion && oldVersion !== this.settings.targetVersion) {
            // Re-lint all of the open documents, as the previous diagnostics may no longer be valid for the new
            // version.
            this.documents.all().forEach((doc) => {
                this.parseAndLintDocument(doc).then(diagnostics => {
                    this.connection.sendDiagnostics({
                        uri: doc.uri,
                        diagnostics
                    });
                });
            });
        }
    }

    private onDocumentFormatting(params: DocumentFormattingParams): TextEdit[] {
        if (!this.settings.format.enabled) {
            return [];
        }

        const uri = params.textDocument.uri;
        const document = this.documents.get(uri);

        if (!document) {
            return [];
        }

        return buildDocumentFormatEdits(uri, document, this.settings.format, params.options);
    }

    private onDocumentRangeFormatting(params: DocumentRangeFormattingParams): TextEdit[] {
        if (!this.settings.format.enabled) {
            return [];
        }

        const uri = params.textDocument.uri;
        const document = this.documents.get(uri);

        if (!document) {
            return [];
        }

        return buildDocumentRangeFormatEdits(uri, document, params.range, this.settings.format, params.options);
    }

    private async parseAndLintDocument(document: TextDocument) {
        const documentUri = document.uri;
        const documentText = document.getText();

        const parsedUri = Uri.parse(documentUri);
        // Don't lint the diff view. Fixes #22.
        if (parsedUri.scheme === 'showModifications') {
            return [];
        }

        // Run the docment through luaparse and output any errors it finds
        const parseDocument = (): Promise<Diagnostic[]> => {
            return new Promise((resolve) => {
                try {
                    this.perDocumentAnalysis[documentUri] = new Analysis.Analysis();
                    this.perDocumentAnalysis[documentUri].end(documentText);
                    this.perDocumentAnalysis[documentUri].buildGlobalSymbols();

                    return resolve([]);
                } catch (err) {
                    if (!(err instanceof SyntaxError)) { throw err; }
                    const e = err as any;

                    const lines = documentText.split(/\r?\n/g);
                    const line = lines[e.line - 1];

                    const range = Range.create(e.line - 1, e.column,
                        e.line - 1, line.length);

                    // Strip out the row and column from the message
                    const message = e.message.match(/\[\d+:\d+\] (.*)/)[1];

                    const diagnostic: Diagnostic = {
                        range,
                        message,
                        severity: DiagnosticSeverity.Error,
                        source: 'luaparse'
                    };

                    return resolve([diagnostic]);
                }
            });
        };

        let errors = await parseDocument();

        try {
            // TODO: Clean up the dependency on this.settings.. should probably have a SettingsManager type class.
            const lintingErrors = buildLintingErrors(this.settings, documentUri, documentText);

            // If luacheck errors are preferred and luacheck has provided us with some, usurp any luaparse errors.
            if (this.settings.preferLuaCheckErrors && lintingErrors.length > 0) {
                errors = lintingErrors;
            } else {
                // Otherwise, join the two lists together.
                errors = errors.concat(lintingErrors);
            }
        } catch (e) { }

        return errors;
    }
}

let serviceDispatcher: ServiceDispatcher | null = null;

if (module.hot) {
    module.hot.accept();

    module.hot.store(stash => {
        stash.serviceDispatcher = serviceDispatcher;
    });

    module.hot.restore(stash => {
        if (stash.serviceDispatcher) {
            serviceDispatcher = stash.serviceDispatcher;
            const oldProto = Object.getPrototypeOf(serviceDispatcher);
            const newProto = ServiceDispatcher.prototype;
            for (const p of Object.getOwnPropertyNames(newProto)) {
                oldProto[p] = newProto[p];
            }
        }
    });
}

if (serviceDispatcher === null) {
    serviceDispatcher = new ServiceDispatcher();
}
