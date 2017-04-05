import * as luaparse from 'luaparse';

import { Symbol } from './symbol';
import { Scope } from './scope';
import { getNodeRange } from '../utils';

export class Analysis {
    public symbols: Symbol[] = [];

    private rootNode: luaparse.Chunk;

    private scopeStack: Scope[] = [];
    private globalScope: Scope;
    private cursorScope: Scope | null = null;

    public constructor() {
        luaparse.parse({
            locations: true,
            scope: true,
            wait: true,
            comments: false,
            onCreateScope: () => {
                const newScope = new Scope();

                // Flag the first encountered scope as the global scope.
                if (this.globalScope == null) {
                    this.globalScope = newScope;
                }

                newScope.parentScope = this.scopeStack.length ? this.scopeStack[this.scopeStack.length - 1] : null;

                this.scopeStack.push(newScope);
            },
            onCreateNode: (node) => {
                // The chunk is meaningless to us, so ignore it.
                if (node.type === 'Chunk') {
                    return;
                }

                if (this.scopeStack.length === 0) {
                    throw new Error('Empty scope stack when encountering node of type ' + node.type);
                }

                const scope = this.scopeStack[this.scopeStack.length - 1];

                // Assign the scope to the node so we can access it later
                node.scope = scope;

                // And add the node to the scope for ease of iteration
                scope.nodes.push(node);

                // If the current node is our scope marker, notedown the scope it corresponds to so we know where to
                // start our search from.
                if (node.type === 'Identifier' && node.name === '__scope_marker__') {
                    this.cursorScope = scope;
                }
            },
            onDestroyScope: () => {
                this.scopeStack.pop();
            }
        });
    }

    public write(text: string) {
        luaparse.write(text);
    }

    public end(text: string) {
        this.rootNode = luaparse.end(text);
    }

    public buildScopedSymbols(isObjectScope: boolean = false) {
        // TODO: Support object scoped queries. For now, carry on as usual.
        // i.e: someObject.<Completion>
        if (isObjectScope) { }

        // If we didn't find the scope containing the cursor, we can't provide scope-aware suggestions.
        // TODO: Fall back to just providing global symbols?
        if (this.cursorScope === null) {
            return;
        }

        // Add all of the symbols for the current cursor scope
        let currentScope: Scope | null = this.cursorScope;
        while (currentScope !== null) {
            currentScope.nodes.forEach((n) => this.addSymbolsForNode(n, true));
            currentScope = currentScope.parentScope;
        }
    }

    public buildGlobalSymbols() {
        this.globalScope.nodes.forEach((n) => this.addSymbolsForNode(n, false));
    }

    // Nodes don't necessarily need to have an identifier name, nor are their identifiers all of type 'Identifier'.
    // Return an appropriate name, given the context of the node.
    private getIdentifierName(identifier: luaparse.Identifier | luaparse.MemberExpression | null) {
        if (identifier) {
            switch (identifier.type) {
                case 'Identifier':
                    return { name: identifier.name, container: null };

                case 'MemberExpression':
                    switch (identifier.base.type) {
                        case 'Identifier':
                            return { name: identifier.identifier.name, container: identifier.base.name };
                        default:
                            return { name: identifier.identifier.name, container: null };
                    }
            }
        }

        return { name: null, container: null };
    }

    private addSymbolsForNode(node: luaparse.Node, scopedQuery: boolean) {
        switch (node.type) {
            case 'LocalStatement':
            case 'AssignmentStatement':
                this.addLocalAndAssignmentSymbols(node);
                break;

            case 'FunctionDeclaration':
                this.addFunctionSymbols(node, scopedQuery);
                break;
        }
    }

    private addLocalAndAssignmentSymbols(node: luaparse.LocalStatement | luaparse.AssignmentStatement) {
        for (const variable of node.variables) {
            switch (variable.type) {
                case 'Identifier':
                    this.symbols.push({
                        kind: 'Variable',
                        name: variable.name,
                        range: getNodeRange(variable),
                        isGlobalScope: variable.scope === this.globalScope
                    });
                    break;

                // case 'MemberExpression':
                //     const varName = this.getIdentifierName(variable);

                //     this.symbols.push({
                //         kind: 'Variable',
                //         name: varName.name,
                //         display: varName.container,
                //         range: getNodeRange(variable),
                //         isGlobalScope: variable.scope === this.globalScope
                //     });
                //     break;
            }
        }
    }

    private addFunctionSymbols(node: luaparse.FunctionDeclaration, scopedQuery: boolean) {
        const { name, container } = this.getIdentifierName(node.identifier);

        // Build a represesntation of the function declaration
        let display = 'function ';
        if (container) { display += container + ':'; }
        if (name) { display += name; }
        display += '(';
        display += node.parameters
            .filter(param => param.type === 'Identifier')
            .map((param: luaparse.Identifier) => param.name)
            .join(', ');

        display += ')';

        this.symbols.push({
            kind: 'Function',
            name,
            display,
            container,
            range: getNodeRange(node),
            isGlobalScope: node.scope === this.globalScope
        });

        if (scopedQuery) {
            node.parameters
                .filter(param => param.type === 'Identifier' && param.scope.containsScope(this.cursorScope))
                .forEach((param: luaparse.Identifier) => {
                    this.symbols.push({
                        kind: 'FunctionParameter',
                        name: param.name,
                        range: getNodeRange(param),
                        isGlobalScope: false
                    });
                });
        }
    }
}
