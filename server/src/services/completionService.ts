import {
    CompletionItem, CompletionItemKind,
    Position
} from 'vscode-languageserver';

import { Analysis, Symbol } from '../analysis';
import { matchesQuery } from '../utils';

export class CompletionService {
    private analysis: Analysis;
    private position: Position;

    public constructor(analysis: Analysis, position: Position) {
        this.analysis = analysis;
        this.position = position;
    }

    public buildCompletions(query: string): CompletionItem[] {
        return this.analysis.symbols
            .filter(symbol => matchesQuery(query, symbol.name))
            .map(symbol => {
                let detail = symbol.display;

                if (!detail) {
                    if (symbol.isGlobalScope) {
                        detail = '(global)';
                    }
                    else if (symbol.kind === 'FunctionParameter') {
                        detail = '(parameter)';
                    }
                    else if (symbol.isOuterScope) {
                        detail = '(outer)';
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
