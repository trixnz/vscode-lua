import {
    Range, Location,
    CompletionItemKind,
    SymbolInformation, SymbolKind
} from 'vscode-languageserver';

import * as luaparse from 'luaparse';

enum LuaSymbolKind {
    Variable,
    Function,
    FunctionParameter
}

class LuaSymbol {
    public constructor(name: string, kind: LuaSymbolKind, location: Location) {
        this.name = name;
        this.kind = kind;
        this.location = location;
    }

    public static createLocation(uri: string, symbol: luaparse.NodeAdditional) {
        return Location.create(uri,
            Range.create(
                symbol.loc.start.line - 1, symbol.loc.start.column,
                symbol.loc.end.line - 1, symbol.loc.end.column));
    }

    public translateCompletionKind(): CompletionItemKind {
        switch (this.kind) {
            case LuaSymbolKind.Variable:
                return CompletionItemKind.Variable;

            case LuaSymbolKind.Function:
                return CompletionItemKind.Function;

            case LuaSymbolKind.FunctionParameter:
                return CompletionItemKind.Property;
        }
    }

    public translateSymbolKind(): SymbolKind {
        switch (this.kind) {
            case LuaSymbolKind.Variable:
                return SymbolKind.Variable;

            case LuaSymbolKind.Function:
                return SymbolKind.Function;
        }
    }

    public name: string;
    public kind: LuaSymbolKind;
    public location: Location;
    public insertText: string;
    public containerName?: string;
};

export {
    LuaSymbol,
    LuaSymbolKind
}
