import * as luaparse from 'luaparse';

type Callback = (node: luaparse.Node) => void;

interface Visitor {
    onEnterNode?: Callback;
    onExitNode?: Callback;
    onVisitNode: Callback;
}

export function visitAST(node: luaparse.Node | null, visitor: Visitor) {
    function visitNode(obj: luaparse.Node | null) {
        visitAST(obj, visitor);
    }
    function visitNodes<T extends Array<luaparse.Node | null>>(obj: T) {
        obj.forEach(n => visitAST(n, visitor));
    }

    if (node === null) {
        return;
    }

    if (visitor.onEnterNode != null) { visitor.onEnterNode(node); }

    visitor.onVisitNode(node);

    switch (node.type) {
        case 'Chunk':
            visitNodes(node.body);
            break;
        case 'FunctionDeclaration':
            visitNode(node.identifier);
            visitNodes(node.parameters);
            visitNodes(node.body);
            break;
        case 'LocalStatement':
        case 'AssignmentStatement':
            visitNodes(node.variables);
            visitNodes(node.init);
            break;
        case 'MemberExpression':
            visitNode(node.base);
            visitNode(node.identifier);
            break;
        case 'Identifier':
        case 'NumericLiteral':
        case 'BooleanLiteral':
        case 'StringLiteral':
        case 'VarargLiteral':
        case 'NilLiteral':
        case 'BreakStatement':
            break;
        case 'CallStatement':
            visitNode(node.expression);
            break;
        case 'CallExpression':
            visitNode(node.base);
            visitNodes(node.arguments);
            break;
        case 'StringCallExpression':
            visitNode(node.base);
            visitNode(node.argument);
            break;
        case 'RepeatStatement':
        case 'WhileStatement':
            visitNode(node.condition);
            visitNodes(node.body);
            break;
        case 'ForGenericStatement':
            visitNodes(node.variables);
            visitNodes(node.iterators);
            visitNodes(node.body);
            break;
        case 'ForNumericStatement':
            visitNode(node.variable);
            visitNode(node.start);
            visitNode(node.end);
            visitNode(node.step);
            visitNodes(node.body);
            break;
        case 'IfStatement':
            visitNodes(node.clauses);
            break;
        case 'IfClause':
        case 'ElseifClause':
            visitNode(node.condition);
            visitNodes(node.body);
            break;
        case 'ElseClause':
            visitNodes(node.body);
            break;
        case 'DoStatement':
            visitNodes(node.body);
            break;
        case 'TableConstructorExpression':
            visitNodes(node.fields);
            break;
        case 'TableKeyString':
        case 'TableKey':
            visitNode(node.key);
            visitNode(node.value);
            break;
        case 'TableCallExpression':
            visitNode(node.base);
            visitNode(node.arguments);
            break;
        case 'TableValue':
            visitNode(node.value);
            break;
        case 'LabelStatement':
        case 'GotoStatement':
            visitNode(node.label);
            break;
        case 'BinaryExpression':
            visitNode(node.left);
            visitNode(node.right);
            break;
        case 'LogicalExpression':
            visitNode(node.left);
            visitNode(node.right);
            break;
        case 'IndexExpression':
            visitNode(node.base);
            visitNode(node.index);
            break;
        case 'UnaryExpression':
            // visitNode(node.argument);
            break;
        case 'ReturnStatement':
            visitNodes(node.arguments);
            break;
    }

    if (visitor.onExitNode != null) { visitor.onExitNode(node); }
}
