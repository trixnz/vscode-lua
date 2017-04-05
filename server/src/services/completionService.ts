import {
    CompletionItem, CompletionItemKind,
    Position
} from 'vscode-languageserver';

import { Analysis, Symbol } from '../analysis';

export class CompletionService {
    private analysis: Analysis;
    private position: Position;

    public constructor(analysis: Analysis, position: Position) {
        this.analysis = analysis;
        this.position = position;
    }

    public buildCompletions(query: string): CompletionItem[] {
        const matchesQuery = (name: string | null) => {
            if (query.length === 0) { return true; }
            if (name === null) { return false; }
            return name.toLowerCase().indexOf(query) !== -1;
        };

        return this.analysis.symbols
            .filter(symbol => matchesQuery(symbol.name))
            .map(symbol => {
                let detail = symbol.display;

                if (!detail) {
                    if (symbol.isGlobalScope) {
                        detail = '(global)';
                    }
                    else if (symbol.kind === 'FunctionParameter') {
                        detail = '(parameter)';
                    }
                    else {
                        detail = '(local)';
                    }
                }

                return {
                    label: symbol.name,
                    kind: this.convertSymbolKindToCompletionKind(symbol),
                    detail
                } as CompletionItem;
            });
    }

    private convertSymbolKindToCompletionKind(symbol: Symbol) {
        switch (symbol.kind) {
            case 'Function':
                return CompletionItemKind.Function;
            case 'FunctionParameter':
                return CompletionItemKind.Property;
            case 'Variable':
                return CompletionItemKind.Variable;
        }
    }
}
