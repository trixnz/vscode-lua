import { Node } from 'luaparse';

export class Scope {
    public nodes: Node[] = [];
    public parentScope: Scope | null = null;

    public containsScope(otherScope: Scope | null) {
        let currentScope = otherScope;
        while (currentScope !== null) {
            if (currentScope === this) {
                return true;
            }
            currentScope = currentScope.parentScope;
        }

        return false;
    }
}
