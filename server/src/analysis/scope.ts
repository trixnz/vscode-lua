import { ScopedNode } from './node';

export class Scope {
    public nodes: ScopedNode[] = [];
    public parentScope: Scope | null = null;

    public name = 'Unnamed';
}
