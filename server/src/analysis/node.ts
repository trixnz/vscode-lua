import * as luaparse from 'luaparse';
import { Scope } from './scope';

export class ScopedNode {
    public node: luaparse.Node;
    public scope: Scope;

    public constructor(node: luaparse.Node) {
        this.node = node;
    }
}
