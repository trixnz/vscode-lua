import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { spawn } from 'child_process';
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
    if (!settings.luacheckPath) { return Promise.resolve([]); }

    return new Promise<Diagnostic[]>((resolve, reject) => {
        const uri = Uri.parse(documentUri);
        const dir = dirname(uri.fsPath);

        const cp = spawn(settings.luacheckPath, [
            '-', '--no-color', '--ranges', '--codes', '--filename=' + uri.fsPath
        ], { cwd: dir });

        try {
            cp.stdin.write(documentText);
            cp.stdin.end();
        } catch (err) { }

        cp.stdout.on('data', (data: Buffer) => {
            return resolve(parseDiagnostics(data.toString()));
        });
        cp.stderr.on('data', (data: Buffer) => {
            return reject(data.toString());
        });
        cp.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ENOENT') {
                return reject('Path to luacheck is invalid.');
            }
            return reject(err);
        });
    });
}
