import { TextEdit, Range, Position, TextDocument, FormattingOptions } from 'vscode-languageserver';
import { formatText, producePatch, UserOptions, WriteMode } from 'lua-fmt';
import { parsePatch } from 'diff';
import { FormatOptions } from '../server';

enum EditAction {
    Replace,
    Insert,
    Delete
}

class Edit {
    public action: EditAction;
    public start: Position;
    public end: Position;
    public text: string = '';

    public constructor(action: EditAction, start: Position) {
        this.action = action;
        this.start = start;
    }
}

function getEditsFromFormattedText(documentUri: string, originalText: string, formattedText: string,
    startOffset: number = 0): TextEdit[] {
    const diff = producePatch(documentUri, originalText, formattedText);
    const unifiedDiffs = parsePatch(diff);

    const edits: Edit[] = [];
    let currentEdit: Edit | null = null;

    for (const uniDiff of unifiedDiffs) {
        for (const hunk of uniDiff.hunks) {
            let startLine = hunk.oldStart + startOffset;

            for (const line of hunk.lines) {
                switch (line[0]) {
                    case '-':
                        if (currentEdit === null) {
                            currentEdit = new Edit(EditAction.Delete, Position.create(startLine - 1, 0));
                        }
                        currentEdit.end = Position.create(startLine, 0);
                        startLine++;
                        break;

                    case '+':
                        if (currentEdit === null) {
                            currentEdit = new Edit(EditAction.Insert, Position.create(startLine - 1, 0));
                        } else if (currentEdit.action === EditAction.Delete) {
                            currentEdit.action = EditAction.Replace;
                        }

                        currentEdit.text += line.substr(1) + '\n';

                        break;

                    case ' ':
                        startLine++;
                        if (currentEdit != null) {
                            edits.push(currentEdit);
                        }
                        currentEdit = null;
                        break;
                }
            }
        }

        if (currentEdit != null) {
            edits.push(currentEdit);
        }
    }

    return edits.map(edit => {
        switch (edit.action) {
            case EditAction.Replace:
                return TextEdit.replace(Range.create(edit.start, edit.end), edit.text);
            case EditAction.Insert:
                return TextEdit.insert(edit.start, edit.text);
            case EditAction.Delete:
                return TextEdit.del(Range.create(edit.start, edit.end));
        }
    });
}

export function buildDocumentFormatEdits(documentUri: string, document: TextDocument, extFormatOptions: FormatOptions,
    editorFormatOptions: FormattingOptions):
    TextEdit[] {
    let documentText = document.getText();

    const useTabs = extFormatOptions.useTabs || !editorFormatOptions.insertSpaces;
    const indentCount = extFormatOptions.indentCount || editorFormatOptions.tabSize;

    const formatOptions: UserOptions = {
        writeMode: WriteMode.Diff,
        useTabs,
        indentCount,
        lineWidth: extFormatOptions.lineWidth,
        quotemark: extFormatOptions.singleQuote ? 'single' : 'double'
    };
    let formattedText = formatText(documentText, formatOptions);

    // Normalize the line endings so jsdiff has a chance at providing minimal edits, otherwise the diffing result will
    // be one giant edit, which isn't very friendly.
    if (process.platform === 'win32') {
        documentText = documentText.split('\r\n').join('\n');
        formattedText = formattedText.split('\r\n').join('\n');
    }

    return getEditsFromFormattedText(documentUri, documentText, formattedText);
}

export function buildDocumentRangeFormatEdits(_documentUri: string, _document: TextDocument,
    _range: Range, _extFormatOptions: FormatOptions, _editorFormatOptions: FormattingOptions): TextEdit[] {
    return [];

    // TODO: This feature is dependent on https://github.com/trixnz/lua-fmt/issues/14 to provide a reasonable
    // experience to the user.
    //
    // The code below works, but completely ignores any indentation levels that may exist in the code scope.
    // For this reason, it is temporarily disabled until the aforementioned #14 issue is resolved.

    // const documentText = document.getText();

    // const startOffset = document.offsetAt(range.start);
    // const endOffset = document.offsetAt(range.end);
    // const text = documentText.substring(startOffset, endOffset);

    // const formatOptions: UserOptions = {
    //     writeMode: WriteMode.Diff,
    // };
    // const formattedText = formatText(text, formatOptions);

    // return getEditsFromFormattedText(documentUri, text, formattedText, range.start.line);
}
