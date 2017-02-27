import * as luaparse from 'luaparse';

import { visitAST } from './astVisitor';
import { Symbol, Function, Variable } from './types';

import { Range } from 'vscode-languageserver';

export class Analysis {
    public symbols: Symbol[] = [];

    private rootNode: luaparse.Node;

    private enteredNodes: luaparse.Node[] = [];
    private enteredFunctions: Function[] = [];

    public constructor() {
        luaparse.parse({
            locations: true,
            scope: true,
            wait: true,
            comments: false
        });
    }

    public write(text: string) {
        luaparse.write(text);
    }

    public end(text: string) {
        const ast = luaparse.end(text);

        const visitNode = (node: luaparse.Node) => {
            switch (node.type) {
                case 'FunctionDeclaration':
                    this.visitFunction(node);
                    break;

                case 'LocalStatement':
                case 'AssignmentStatement':
                    this.visitLocalOrAssignment(node);
                    break;
            }
        };

        this.rootNode = ast;

        visitAST(ast, {
            onVisitNode: visitNode,
            onEnterNode: (node) => {
                // Inject a parent onto the luaparse nodes so we can deduce if a node is in the global scope
                if (this.enteredNodes.length) {
                    (node as any).parent = this.enteredNodes[this.enteredNodes.length - 1];
                }
                else {
                    (node as any).parent = this.rootNode;
                }

                this.enteredNodes.push(node);
            },
            onExitNode: (node) => {
                if (node.type === 'FunctionDeclaration') {
                    this.enteredFunctions.pop();
                }

                this.enteredNodes.pop();
            }
        });
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

    // Convert the node's range into something the vscode language server can work with
    private getRange(node: luaparse.NodeAdditional): Range {
        return {
            start: {
                character: node.loc.start.column,
                line: node.loc.start.line - 1
            },
            end: {
                character: node.loc.end.column,
                line: node.loc.end.line - 1
            }
        };
    }

    private isNodeGlobal(node: luaparse.Node) {
        return (node as any).parent === this.rootNode;
    }

    private visitFunction(node: luaparse.FunctionDeclaration) {
        const { name, container } = this.getIdentifierName(node.identifier);

        const parameters = [];
        for (const p of node.parameters) {
            switch (p.type) {
                case 'Identifier':
                    parameters.push(p.name);
                    break;

                case 'VarargLiteral':
                    break;
            }
        }

        const func: Function = {
            kind: 'Function',
            name,
            range: this.getRange(node),
            isGlobalScope: this.isNodeGlobal(node),
            container,
            parameters,
            localVariables: []
        };

        this.symbols.push(func);
        this.enteredFunctions.push(func);
    }

    private visitLocalOrAssignment(node: luaparse.LocalStatement | luaparse.AssignmentStatement) {
        for (const variable of node.variables) {
            switch (variable.type) {
                case 'Identifier':
                    {
                        const newVariable: Variable = {
                            kind: 'Variable',
                            name: variable.name,
                            range: this.getRange(variable),
                            isGlobalScope: this.isNodeGlobal(node)
                        };
                        this.symbols.push(newVariable);

                        if (this.enteredFunctions.length) {
                            this.enteredFunctions[this.enteredFunctions.length - 1].localVariables.push(newVariable);
                        }
                    }
                    break;
                case 'MemberExpression':
                    {
                        const varName = this.getIdentifierName(variable);

                        const newVariable: Variable = {
                            kind: 'Variable',
                            name: varName.name,
                            range: this.getRange(variable),
                            isGlobalScope: this.isNodeGlobal(node),
                            container: varName.container
                        };
                        this.symbols.push(newVariable);

                        if (this.enteredFunctions.length) {
                            this.enteredFunctions[this.enteredFunctions.length - 1].localVariables.push(newVariable);
                        }
                    }
                    break;
            }
        }
    }
}
