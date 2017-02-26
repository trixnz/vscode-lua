import { Range } from 'vscode-languageserver';

export interface ISymbol {
    kind: string;

    name: string | null;
    range: Range;
    isGlobalScope: boolean;
}

export interface Function extends ISymbol {
    kind: 'Function';

    name: string | null;
    range: Range;
    isGlobalScope: boolean;

    container?: string | null;
    parameters: string[];
    localVariables: Variable[];
}

export interface Variable extends ISymbol {
    kind: 'Variable';

    name: string | null;
    range: Range;
    isGlobalScope: boolean;
}

export type Symbol = Function | Variable;
