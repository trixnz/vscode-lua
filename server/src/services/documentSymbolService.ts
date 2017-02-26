import { Analysis } from '../analysis';
import { SymbolInformation, CompletionItemKind, Location } from 'vscode-languageserver';

export function buildDocumentSymbols(uri: string, analysis: Analysis): SymbolInformation[] {
    const symbols: SymbolInformation[] = [];

    for (const symbol of analysis.symbols.filter(f => f.isGlobalScope)) {

        // Populate the document's functions:
        if (symbol.kind === 'Function') {
            if (symbol.name === null) { continue; }

            symbols.push({
                name: symbol.name,
                containerName: symbol.container || undefined,
                kind: CompletionItemKind.Function,
                location: Location.create(uri, symbol.range)
            });
        }
        // Populate the document's variables:
        else if (symbol.kind === 'Variable') {
            if (symbol.name === null) { continue; }

            symbols.push({
                name: symbol.name,
                kind: CompletionItemKind.Variable,
                location: Location.create(uri, symbol.range)
            });
        }
    }

    return symbols;
}
