'use strict';

import {
    IPCMessageReader, IPCMessageWriter,
    IConnection, createConnection,
    InitializeResult,
    Diagnostic, Range, Location,
    CompletionItem, CompletionItemKind,
    TextDocuments, TextDocumentPositionParams, DocumentSymbolParams,
    SymbolInformation, SymbolKind,
    Position
} from 'vscode-languageserver';

import * as luaparse from 'luaparse';

import { LuaSymbol, LuaSymbolKind } from './lua_symbol';
import { getWordFromCursor } from './utils';
import * as Analysis from './analysis';

export const connection: IConnection = createConnection(new IPCMessageReader(process),
    new IPCMessageWriter(process));

export const documents: TextDocuments = new TextDocuments();
documents.listen(connection);

connection.onInitialize((params): InitializeResult => {
    return {
        capabilities: {
            // Use full sync mode for now.
            // TODO: Add support for Incremental changes. Full syncs will not scale very well.
            textDocumentSync: documents.syncKind,
            documentSymbolProvider: true
        }
    };
});

// Analysis of each document as they're saved
// TODO: Make this better, because this sucks.
const perDocumentAnalysis: { [uri: string]: Analysis.Analysis; } = {};

documents.onDidChangeContent((change) => {
    const documentUri = change.document.uri;

    try {
        perDocumentAnalysis[documentUri] = new Analysis.Analysis();
        perDocumentAnalysis[documentUri].end(change.document.getText());

        // Clear diagnostics for this document as nothing went wrong
        connection.sendDiagnostics({
            uri: documentUri,
            diagnostics: []
        });
    } catch (e) {
        const lines = change.document.getText().split(/\r?\n/g);
        const line = lines[e.line - 1];

        const range = Range.create(e.line - 1, e.column,
            e.line - 1, line.length);

        // Strip out the row and column from the message
        const message = e.message.match(/\[\d+:\d+\] (.*)/)[1];

        connection.sendDiagnostics({
            uri: documentUri,
            diagnostics: [
                Diagnostic.create(range, message)
            ]
        });
    }
});

function buildCompletionList(nodes: Analysis.ScopedNode[], uri: string, query?: string): LuaSymbol[] {
    const satisfiesQuery = (name: string) => { return query == null || name.toLowerCase().indexOf(query) >= 0; };
    const symbols: LuaSymbol[] = [];

    for (const scopedNode of nodes) {
        const node = scopedNode.node;

        switch (node.type) {
            case 'FunctionDeclaration':
                if (node.identifier === null) { break; }

                let name = '';
                let container = null;
                switch (node.identifier.type) {
                    case 'Identifier':
                        name = node.identifier.name;
                        break;

                    case 'MemberExpression':
                        name = node.identifier.identifier.name;
                        container = (node.identifier.base as luaparse.Identifier).name;
                        break;
                }

                if (satisfiesQuery(name)) {
                    const symbol = new LuaSymbol(name, LuaSymbolKind.Function, LuaSymbol.createLocation(uri, node));
                    symbols.push(symbol);
                }

                break;

            case 'LocalStatement':
            case 'AssignmentStatement':
                for (const variable of node.variables) {
                    if (variable.type === 'Identifier' && satisfiesQuery(variable.name)) {
                        const symbol = new LuaSymbol(variable.name, LuaSymbolKind.Variable,
                            LuaSymbol.createLocation(uri, variable));

                        // If the variable contains a function declaration, mark it as such
                        if (node.init.length === 1 && node.init[0].type === 'FunctionDeclaration') {
                            symbol.kind = LuaSymbolKind.Function;
                        }

                        symbols.push(symbol);
                    }
                }
                break;
        }
    }

    return symbols;
}

connection.onCompletion(
    (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        const uri = textDocumentPosition.textDocument.uri;
        const document = documents.get(uri);
        const documentText = document.getText();

        const analysis = new Analysis.Analysis();

        const { word, prefixStartPosition, suffixEndPosition } = getWordFromCursor(documentText,
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

            let curScope = l;
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
    });

connection.onDocumentSymbol((handler: DocumentSymbolParams): SymbolInformation[] => {
    const uri = handler.textDocument.uri;
    const analysis = perDocumentAnalysis[uri];

    return buildCompletionList(analysis.getGlobalSuggestions(), uri, null).map(symbol => {
        return {
            name: symbol.name,
            kind: symbol.translateSymbolKind(),
            location: symbol.location,
            containerName: symbol.containerName
        };
    });
});

connection.listen();
