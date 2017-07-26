import * as vscode from 'vscode';

export class VersionSelector extends vscode.Disposable {
    private statusBarEntry: vscode.StatusBarItem;
    private onChangeEditorSubscription: vscode.Disposable;
    private onSelectVersionCommand: vscode.Disposable;
    private onConfigChangedSubscription: vscode.Disposable;

    private readonly defaultVersion = '5.1';
    private readonly availableVersions = ['5.1', '5.2', '5.3'];

    public constructor() {
        super(() => this.dispose());

        this.statusBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
        this.onChangeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(this.updateVisibility, this);
        this.onConfigChangedSubscription = vscode.workspace.onDidChangeConfiguration(
            () => this.updateTextFromConfiguration());

        const selectVersionCommand = 'lua.selectVersion';
        this.statusBarEntry.tooltip = 'Select Lua Version';
        this.statusBarEntry.command = selectVersionCommand;

        this.onSelectVersionCommand = vscode.commands.registerCommand(selectVersionCommand,
            this.showVersionPicker, this);

        this.updateTextFromConfiguration();
        this.updateVisibility();
    }

    public dispose() {
        this.statusBarEntry.dispose();
        this.onChangeEditorSubscription.dispose();
        this.onSelectVersionCommand.dispose();
        this.onConfigChangedSubscription.dispose();
    }

    private updateTextFromConfiguration() {
        const targetVersion = vscode.workspace.getConfiguration().get('lua.targetVersion') as string;

        this.statusBarEntry.text = this.availableVersions.includes(targetVersion)
            ? targetVersion
            : this.defaultVersion;
    }

    private updateVisibility() {
        if (!this.statusBarEntry) {
            return;
        }

        if (!vscode.window.activeTextEditor) {
            this.statusBarEntry.hide();
            return;
        }

        const document = vscode.window.activeTextEditor.document;
        if (vscode.languages.match('lua', document)) {
            this.statusBarEntry.show();
        } else {
            this.statusBarEntry.hide();
        }
    }

    private async showVersionPicker() {
        const selectedOption = await vscode.window.showQuickPick(this.availableVersions, {
            placeHolder: 'Select the version of Lua to target'
        });

        if (!selectedOption) {
            return;
        }

        await vscode.workspace.getConfiguration().update('lua.targetVersion', selectedOption);
        this.updateTextFromConfiguration();
    }
}
