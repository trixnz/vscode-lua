import { LuaSymbol, LuaSymbolKind } from '../lua_symbol';
import * as Analysis from '../analysis';
import * as luaparse from 'luaparse';

export function buildCompletionList(nodes: Analysis.ScopedNode[], uri: string, query?: string): LuaSymbol[] {
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

                        if (node.init.length === 1) {
                            const decl = node.init[0];

                            // If the variable contains a function declaration, mark it as such
                            if (node.init.length === 1 && decl !== null && decl.type === 'FunctionDeclaration') {
                                symbol.kind = LuaSymbolKind.Function;
                            }
                        }

                        symbols.push(symbol);
                    }
                }
                break;
        }
    }

    return symbols;
}
