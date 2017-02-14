import { Position } from 'vscode-languageserver';

export function getWordFromCursor(documentText: string, position: Position) {
    const line = documentText.split(/\r?\n/g)[position.line];

    const beginningOfLineWordRegex = /^\w*[a-zA-Z_]+\w*\b/g;
    const endOfLineWordRegex = /\b\w*[a-zA-Z_]+\w*$/g;

    const leadingText = line.substring(0, position.character);
    const prefix = leadingText.match(endOfLineWordRegex);
    let prefixString = prefix ? prefix[0] : '';
    const prefixStartPosition = Position.create(position.line, position.character - prefixString.length);

    const trailingText = line.substring(position.character);
    const suffix = trailingText.match(beginningOfLineWordRegex);
    let suffixString = suffix ? suffix[0] : '';
    const suffixEndPosition = Position.create(position.line, position.character + suffixString.length);

    return {
        word: prefixString + suffixString,
        prefixStartPosition: prefixStartPosition,
        suffixEndPosition: suffixEndPosition
    };
}
