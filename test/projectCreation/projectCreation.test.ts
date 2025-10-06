import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as myExtension from '../../extension';

const testNamesFilePath = path.join(__dirname, 'testNames.json');
const testNames: Record<string, { name: string, boards: string[], runBoards: string[] }> = JSON.parse(fs.readFileSync(testNamesFilePath, 'utf8'));

suite(`Project Creation Test Suite`, function() {

	for (const testName of Object.values(testNames)) {
		const { name, boards, runBoards } = testName;
		for (const board of boards) {
			test(`New Project ${name} ${board}`, async () => {
				if (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.endsWith(name)) {
					throw new Error(`${name} workspace folder already exists`);
				}

				const result = await vscode.commands.executeCommand('raspberry-pi-pico.testCreateProject', name, board) as string;

				assert.strictEqual(result, "Project created");
			});
		}
	}
});
