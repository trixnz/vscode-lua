import { Analysis } from '../analysis';
import { SymbolInformation, Location, SymbolKind } from 'vscode-languageserver';

export function buildDocumentSymbols(uri: string, analysis: Analysis): SymbolInformation[] {
    const symbols: SymbolInformation[] = [];

    for (const symbol of analysis.symbols.filter(sym => sym.isGlobalScope)) {
        // Populate the document's functions:
        if (symbol.kind === 'Function') {
            if (symbol.name === null) { continue; }

            symbols.push({
                name: symbol.name,
                containerName: symbol.container || undefined,
                kind: SymbolKind.Function,
                location: Location.create(uri, symbol.range)
            });
        }
        // Populate the document's variables:
        else if (symbol.kind === 'Variable') {
            if (symbol.name === null) { continue; }

            symbols.push({
                name: symbol.name,
                kind: SymbolKind.Variable,
                location: Location.create(uri, symbol.range)
            });
        }
    }

    return symbols;
}
