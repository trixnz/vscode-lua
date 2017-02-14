import * as luaparse from 'luaparse';
import { ScopedNode } from './node';

export class Scope {
    public nodes: ScopedNode[] = [];
    public parentScope?: Scope = null;
}
