import * as luaparse from 'luaparse';

import { Scope } from './scope';
import { ScopedNode } from './node';

export class Analysis {
    public globalScope: Scope;
    public currentScope: Scope;
    public userScope: Scope;

    public nodes: luaparse.Node[] = [];

    public constructor() {
        luaparse.parse({
            locations: true,
            scope: true,
            wait: true,
            comments: false,
            onCreateScope: () => this.onCreateScope(),
            onDestroyScope: () => this.onDestroyScope(),
            onCreateNode: (node: luaparse.Node) => this.onCreateNode(node)
        });

        this.globalScope = new Scope();
        this.globalScope.name = 'Global';
    }

    public write(text: string) {
        luaparse.write(text);
    }

    public end(text: string) {
        luaparse.end(text);
    }

    private onCreateScope() {
        if (this.currentScope == null) {
            this.currentScope = this.globalScope;
        }
        else {
            const newScope = new Scope();

            newScope.parentScope = this.currentScope;
            this.currentScope = newScope;
        }
    }

    private onDestroyScope() {
        if (this.currentScope === null) { return; }

        if (this.currentScope.parentScope != null) {
            this.currentScope = this.currentScope.parentScope;
        }
    }

    private onCreateNode(node: luaparse.Node) {
        this.nodes.push(node);

        const newNode = new ScopedNode(node);
        newNode.scope = this.currentScope;

        // Find the scope marker to figure out which scope the user is in
        if (node.type === 'CallExpression' && node.base.type === 'Identifier' &&
            node.base.name === '__scope_marker__') {
            this.userScope = newNode.scope;
        }

        newNode.scope.nodes.push(newNode);

        (node as any).userdata = newNode;
    }

    public getGlobalSuggestions(): ScopedNode[] {
        return this.globalScope.nodes;
    }

    public getScopedSuggestions(includeGlobals: boolean): ScopedNode[] {
        if (includeGlobals) {
            const nodes: ScopedNode[] = [];
            let scope = this.userScope;
            // TODO: There has to be a better way of doing this..
            while (true) {
                nodes.push(...scope.nodes);

                if (scope.parentScope === null) {
                    break;
                }

                scope = scope.parentScope;
            }

            return nodes;
        }

        return this.userScope.nodes;
    }
}
