import { Position, Range } from 'vscode-languageserver';
import { NodeAdditional } from 'luaparse';

export function getCursorWordBoundry(documentText: string, position: Position) {
    const line = documentText.split(/\r?\n/g)[position.line];

    const beginningOfLineWordRegex = /^\w*[a-zA-Z_]+\w*\b/g;
    const endOfLineWordRegex = /\b\w*[a-zA-Z_]+\w*$/g;

    const leadingText = line.substring(0, position.character);
    const prefix = leadingText.match(endOfLineWordRegex);
    const prefixString = prefix ? prefix[0] : '';
    const prefixStartPosition = Position.create(position.line, position.character - prefixString.length);

    const trailingText = line.substring(position.character);
    const suffix = trailingText.match(beginningOfLineWordRegex);
    const suffixString = suffix ? suffix[0] : '';
    const suffixEndPosition = Position.create(position.line, position.character + suffixString.length);

    return {
        prefixStartPosition,
        suffixEndPosition
    };
}

// Convert the node's range into something the vscode language server can work with
export function getNodeRange(node: NodeAdditional): Range {
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

export function matchesQuery(query: string, name: string | null) {
    if (query.length === 0) { return true; }
    if (name === null) { return false; }
    return name.toLowerCase().indexOf(query) !== -1;
};
