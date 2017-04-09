import { Analysis } from '../analysis';
import { SymbolInformation, SymbolKind, Location } from 'vscode-languageserver';
import { matchesQuery } from '../utils';
import Uri from 'vscode-uri/lib';

export function buildWorkspaceSymbols(path: string, query: string, analysis: Analysis): SymbolInformation[] {
    const symbols: SymbolInformation[] = [];
    const uri = Uri.file(path);

    for (const symbol of analysis.symbols.filter(sym => sym.isGlobalScope && matchesQuery(query, sym.name))) {
        // Populate the document's functions:
        if (symbol.kind === 'Function') {
            if (symbol.name === null) { continue; }

            symbols.push({
                name: symbol.name,
                containerName: symbol.container || undefined,
                kind: SymbolKind.Function,
                location: Location.create(uri.toString(), symbol.range)
            });
        }
        // Populate the document's variables:
        else if (symbol.kind === 'Variable') {
            if (symbol.name === null) { continue; }

            symbols.push({
                name: symbol.name,
                kind: SymbolKind.Variable,
                location: Location.create(uri.toString(), symbol.range)
            });
        }
    }

    return symbols;
}
