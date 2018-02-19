import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { spawnSync } from 'child_process';
// Arrrgh. This is awful!
import { Settings } from '../server';
import { dirname } from 'path';
import Uri from 'vscode-uri';

function parseDiagnostics(data: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const errorRegex = /^.*:(\d+):(\d+)-(\d+): \(([EW]?)(\d+)\) (.*)$/mg;
    //  file line column endcolumn type code message

    const matches = data.match(errorRegex);
    if (!matches) { return []; }

    while (true) {
        const m = errorRegex.exec(data);
        if (!m) { break; }

        const [, lineStr, columnStr, endColumnStr, type, codeStr, message] = m;

        const line = Number(lineStr) - 1;
        const column = Number(columnStr) - 1;
        const columnEnd = Number(endColumnStr);
        const code = Number(codeStr);

        const mapSeverity = () => {
            switch (type) {
                case 'E':
                    return DiagnosticSeverity.Error;

                case 'W':
                    return DiagnosticSeverity.Warning;

                default:
                    return DiagnosticSeverity.Information;
            }
        };

        diagnostics.push({
            range: Range.create(line, column, line, columnEnd),
            severity: mapSeverity(),
            code,
            source: 'luacheck',
            message
        });
    }

    return diagnostics;
}

export function buildLintingErrors(settings: Settings, documentUri: string, documentText: string) {
    // If a path to luacheck hasn't been provided, don't bother trying.
    if (!settings.luacheckPath) { return []; }

    const uri = Uri.parse(documentUri);
    const dir = dirname(uri.fsPath);

    const cp = spawnSync(
        settings.luacheckPath,
        [
            '-', '--no-color', '--ranges', '--codes', '--filename=' + uri.fsPath
        ],
        {
            cwd: dir,
            input: documentText
        }
    );

    // From https://luacheck.readthedocs.io/en/stable/cli.html
    // Exit code is 0 if no warnings or errors occurred.
    // Exit code is 1 if some warnings occurred but there were no syntax errors or invalid inline options.
    // Exit code is 2 if there were some syntax errors or invalid inline options.
    // Exit code is 3 if some files couldn’t be checked, typically due to an incorrect file name.
    // Exit code is 4 if there was a critical error(invalid CLI arguments, config, or cache file).
    if (cp.status == 0) { return []; }

    if (cp.status == 1 || cp.status == 2) {
        return parseDiagnostics(cp.output.join('\n'));
    }

    throw new Error('luacheck failed with error: ' + cp.stderr.toString());
}
