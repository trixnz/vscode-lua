import * as luaparse from 'luaparse';

type Callback = (node: luaparse.Node) => void;

interface Visitor {
    onEnterNode?: Callback;
    onExitNode?: Callback;
    onVisitNode: Callback;
}

export function visitAST(node: luaparse.Node, visitor: Visitor) {
    function visitNode(obj: luaparse.Node) {
        visitor.onVisitNode(obj);
    }
    function visitNodes<T extends Array<luaparse.Node>>(obj: T) {
        obj.forEach(n => visitAST(n, visitor));
    }

    if (visitor.onEnterNode != null) { visitor.onEnterNode(node); }

    switch (node.type) {
        case 'Chunk':
            visitNodes(node.body);
            break;

        case 'FunctionDeclaration':
            visitNode(node);
            visitNodes(node.body);
            break;

        case 'LocalStatement':
        case 'AssignmentStatement':
            visitNode(node);
            visitNodes(node.init as luaparse.Node[]);
            break;
    }

    if (visitor.onExitNode != null) { visitor.onExitNode(node); }
}
