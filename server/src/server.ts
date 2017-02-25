import {
    IPCMessageReader, IPCMessageWriter,
    createConnection,
    InitializeResult,
    Diagnostic, Range,
    CompletionItem, CompletionItemKind,
    TextDocuments, TextDocumentChangeEvent, TextDocumentPositionParams,
    DocumentSymbolParams,
    SymbolInformation
} from 'vscode-languageserver';

import * as luaparse from 'luaparse';

import { getCursorWordBoundry } from './utils';
import * as Analysis from './analysis';
import { buildCompletionList } from './services/completionProvider';

class ServiceDispatcher {
    private connection = createConnection(
        new IPCMessageReader(process),
        new IPCMessageWriter(process)
    );

    private documents: TextDocuments = new TextDocuments();
    private perDocumentAnalysis = new Map<string, Analysis.Analysis>();

    public log(...args: any[]) {
        this.connection.console.log(args.toString());
    }

    public constructor() {
        this.documents.onDidChangeContent(change => this.onDidChangeContent(change));

        this.connection.onInitialize(() => this.onInitialize());
        this.connection.onCompletion(pos => this.onCompletion(pos));
        this.connection.onDocumentSymbol(handler => this.onDocumentSymbol(handler));

        this.documents.listen(this.connection);
        this.connection.listen();
    }

    private onInitialize(): InitializeResult {
        this.connection.console.info('Initializing state');

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
        const analysis = this.perDocumentAnalysis[uri];

        return buildCompletionList(analysis.getGlobalSuggestions(), uri).map(symbol => {
            return {
                name: symbol.name,
                kind: symbol.translateSymbolKind(),
                location: symbol.location,
                containerName: symbol.containerName
            };
        });
    }

    private onCompletion(textDocumentPosition: TextDocumentPositionParams): CompletionItem[] {
        const uri = textDocumentPosition.textDocument.uri;
        const document = this.documents.get(uri);
        const documentText = document.getText();

        const analysis = new Analysis.Analysis();

        const { prefixStartPosition, suffixEndPosition } = getCursorWordBoundry(documentText,
            textDocumentPosition.position);

        // Write everything up to the beginning of the potentially invalid text
        analysis.write(documentText.substring(0, document.offsetAt(prefixStartPosition)));
        // Inject a scope marker to (easily) determine which scope the suggestion is for.
        // We could always parse the ranges, but this works for now.
        analysis.write('__scope_marker__()');

        // And everything after
        try {
            analysis.end(documentText.substring(document.offsetAt(suffixEndPosition)));
        } catch (e) {
            throw e;
            // return [];
        }

        const getNodeScope = (node: luaparse.Node): Analysis.Scope => {
            return ((node as any).userdata as Analysis.ScopedNode).scope;
        };

        const isParentOf = (l: Analysis.Scope, r: luaparse.Node) => {
            const nodeScope = getNodeScope(r);

            let curScope: Analysis.Scope | null = l;
            while (true) {
                if (curScope === null) { break; }
                if (curScope === nodeScope) { return true; }

                curScope = curScope.parentScope;
            }

            return false;
        };

        const symbols = [];
        const suggestions = analysis.getScopedSuggestions(true);
        for (const scopedNode of suggestions) {
            const node = scopedNode.node;

            switch (node.type) {
                case 'AssignmentStatement':
                case 'LocalStatement':
                    for (const variable of node.variables) {
                        if (variable.type === 'Identifier') {
                            symbols.push({
                                label: variable.name,
                                kind: CompletionItemKind.Variable
                            });
                        }
                    }
                    break;

                case 'FunctionDeclaration':
                    // Add the function name, if present.
                    if (node.identifier !== null && node.identifier.type === 'Identifier') {
                        symbols.push({
                            label: node.identifier.name,
                            kind: CompletionItemKind.Function
                        });
                    }

                    // Add the function arguments only if it's scope is a parent of the completion scope
                    for (const parameter of node.parameters.filter(n => isParentOf(analysis.userScope, n))) {
                        if (parameter.type === 'Identifier') {
                            symbols.push({
                                label: parameter.name,
                                kind: CompletionItemKind.Property
                            });
                        }
                    }

                    break;
            }
        }

        return symbols;
    }

    private onDidChangeContent(change: TextDocumentChangeEvent) {
        const documentUri = change.document.uri;

        try {
            this.perDocumentAnalysis[documentUri] = new Analysis.Analysis();
            this.perDocumentAnalysis[documentUri].end(change.document.getText());

            // Clear diagnostics for this document as nothing went wrong
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
