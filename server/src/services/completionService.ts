import {
    CompletionItem, CompletionItemKind,
    Range, Position
} from 'vscode-languageserver';
import { Analysis } from '../analysis';

export class CompletionService {
    private analysis: Analysis;
    private position: Position;

    public constructor(analysis: Analysis, position: Position) {
        this.analysis = analysis;
        this.position = position;
    }

    public buildCompletions(query: string): CompletionItem[] {
        const completions: CompletionItem[] = [];

        const matchesQuery = (name: string | null) => {
            if (name === null) { return false; }
            return name.toLowerCase().indexOf(query) !== -1;
        };

        for (const symbol of this.analysis.symbols) {
            switch (symbol.kind) {
                case 'Function':
                    // Add any global functions
                    if (symbol.isGlobalScope && symbol.name && matchesQuery(symbol.name)) {
                        completions.push({
                            label: symbol.name,
                            kind: CompletionItemKind.Function
                        });
                    }

                    // Add locals and parameters from any function we're in (including outer scopes)
                    if (this.rangeContains(symbol.range, this.position)) {
                        // Push its parameters
                        for (const param of symbol.parameters.filter(p => matchesQuery(p))) {
                            completions.push({
                                label: param,
                                kind: CompletionItemKind.Property
                            });
                        }

                        // Push its local variables
                        for (const variable of symbol.localVariables.filter(v => matchesQuery(v.name))) {
                            if (!variable.name) { continue; }

                            completions.push({
                                label: variable.name,
                                kind: CompletionItemKind.Variable
                            });
                        }
                    }
                    break;

                case 'Variable':
                    // Add any global variables
                    if (symbol.isGlobalScope && symbol.name && matchesQuery(symbol.name)) {
                        completions.push({
                            label: symbol.name,
                            kind: CompletionItemKind.Variable
                        });
                    }
                    break;
            }
        }

        return completions;
    }

    private rangeContains(range: Range, pos: Position) {
        return range.start.line <= pos.line && range.end.line >= pos.line;
    }
}
