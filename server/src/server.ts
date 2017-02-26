import {
    IPCMessageReader, IPCMessageWriter,
    createConnection,
    InitializeResult,
    Diagnostic, Range,
    CompletionItem,
    TextDocuments, TextDocumentChangeEvent, TextDocumentPositionParams,
    DocumentSymbolParams,
    SymbolInformation
} from 'vscode-languageserver';

import { getCursorWordBoundry } from './utils';
import * as Analysis from './analysis';
import { CompletionService } from './services/completionService';
import { buildDocumentSymbols } from './services/documentSymbolService';

class ServiceDispatcher {
    private connection = createConnection(
        new IPCMessageReader(process),
        new IPCMessageWriter(process)
    );

    private documents: TextDocuments = new TextDocuments();
    private perDocumentAnalysis = new Map<string, Analysis.Analysis>();

    public constructor() {
        this.documents.onDidChangeContent(change => this.onDidChangeContent(change));

        this.connection.onInitialize(() => this.onInitialize());
        this.connection.onCompletion(pos => this.onCompletion(pos));
        this.connection.onDocumentSymbol(handler => this.onDocumentSymbol(handler));

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
                    resolveProvider: false
                }
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

        const analysis = new Analysis.Analysis();
        // Write everything up to the beginning of the potentially invalid text
        analysis.write(documentText.substring(0, document.offsetAt(prefixStartPosition)));

        // And everything after
        try {
            analysis.end(documentText.substring(document.offsetAt(suffixEndPosition)));
        } catch (e) {
            throw e;
        }

        const suggestionService = new CompletionService(analysis, textDocumentPosition.position);

        const word = documentText.substring(document.offsetAt(prefixStartPosition),
            document.offsetAt(suffixEndPosition));
        return suggestionService.buildCompletions(word);
    }

    private onDidChangeContent(change: TextDocumentChangeEvent) {
        const documentUri = change.document.uri;

        try {
            this.perDocumentAnalysis[documentUri] = new Analysis.Analysis();
            this.perDocumentAnalysis[documentUri].end(change.document.getText());

            // Clear diagnostics for this document, as nothing went wrong
            this.connection.sendDiagnostics({
                uri: documentUri,
                diagnostics: []
            });
        } catch (err) {
            if (!(err instanceof SyntaxError)) { throw err; }
            const e = err as any;

            const lines = change.document.getText().split(/\r?\n/g);
            const line = lines[e.line - 1];

            const range = Range.create(e.line - 1, e.column,
                e.line - 1, line.length);

            // Strip out the row and column from the message
            const message = e.message.match(/\[\d+:\d+\] (.*)/)[1];

            this.connection.sendDiagnostics({
                uri: documentUri,
                diagnostics: [
                    Diagnostic.create(range, message)
                ]
            });
        }
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
