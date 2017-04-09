import {
    IPCMessageReader, IPCMessageWriter,
    createConnection,
    InitializeResult,
    Diagnostic, DiagnosticSeverity, Range, Position,
    CompletionItem,
    TextDocument, TextDocuments, TextDocumentChangeEvent, TextDocumentPositionParams,
    DocumentSymbolParams, DocumentFormattingParams, DocumentRangeFormattingParams,
    TextEdit,
    SymbolInformation
} from 'vscode-languageserver';

import { getCursorWordBoundry } from './utils';
import * as Analysis from './analysis';
import { CompletionService } from './services/completionService';
import { buildDocumentSymbols } from './services/documentSymbolService';
import { buildLintingErrors } from './services/lintingService';
import { formatText } from 'lua-fmt';

export interface Settings {
    luacheckPath: string;
    preferLuaCheckErrors: boolean;
}

class ServiceDispatcher {

    private connection = createConnection(
        new IPCMessageReader(process),
        new IPCMessageWriter(process)
    );

    private settings: Settings;
    private documents: TextDocuments = new TextDocuments();
    private perDocumentAnalysis = new Map<string, Analysis.Analysis>();
    private readonly triggerCharacters = ['.', ':'];

    public constructor() {
        this.documents.onDidChangeContent(change => this.onDidChangeContent(change));

        this.connection.onInitialize(() => this.onInitialize());
        this.connection.onCompletion(pos => this.onCompletion(pos));
        this.connection.onDocumentSymbol(handler => this.onDocumentSymbol(handler));
        this.connection.onDidChangeConfiguration(change => this.onDidChangeConfiguration(change));
        this.connection.onDocumentFormatting((params) => this.onDocumentFormatting(params));
        this.connection.onDocumentRangeFormatting((params) => this.onDocumentRangeFormatting(params));

        this.documents.listen(this.connection);
        this.connection.listen();
    }

    private onInitialize(): InitializeResult {
        return {
            capabilities: {
                // Use full sync mode for now.
                // TODO: Add support for Incremental changes. Full syncs will not scale very well.
                textDocumentSync: this.documents.syncKind,
                documentSymbolProvider: true,
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

    private onCompletion(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] {
        const uri = textDocumentPosition.textDocument.uri;
        const document = this.documents.get(uri);
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

        const suggestionService = new CompletionService(analysis, textDocumentPosition.position);

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

    private onDidChangeConfiguration(change: any) {
        this.settings = change.settings.lua as Settings;
    }

    private onDocumentFormatting(params: DocumentFormattingParams): TextEdit[] {
        const uri = params.textDocument.uri;
        const document = this.documents.get(uri);
        const documentText = document.getText();
        const lines = documentText.split(/\r?\n/g);

        const formattedText = formatText(documentText);

        const range = Range.create(
            Position.create(0, 0),
            Position.create(document.lineCount - 1, lines[document.lineCount - 1].length)
        );
        return [
            TextEdit.replace(range, formattedText)
        ];
    }

    private onDocumentRangeFormatting(params: DocumentRangeFormattingParams): TextEdit[] {
        const uri = params.textDocument.uri;
        const document = this.documents.get(uri);
        const documentText = document.getText();

        const startOffset = document.offsetAt(params.range.start);
        const endOffset = document.offsetAt(params.range.end);
        const text = documentText.substring(startOffset, endOffset);
        const formattedText = formatText(text);

        return [
            TextEdit.replace(params.range, formattedText)
        ];
    }

    private async parseAndLintDocument(document: TextDocument) {
        const documentUri = document.uri;
        const documentText = document.getText();

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
            const lintingErrors = await buildLintingErrors(this.settings, documentUri, documentText);

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
};

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
