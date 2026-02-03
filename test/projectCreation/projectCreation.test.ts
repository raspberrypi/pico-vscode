import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as myExtension from '../../extension';

const testNamesFilePath = path.join(__dirname, 'testNames.json');
const testNames: Record<string, { name: string, boards: string[], runBoards: string[], cmakeToolsOptions: boolean[] }> = JSON.parse(fs.readFileSync(testNamesFilePath, 'utf8'));

suite(`Project Creation Test Suite`, function() {

	for (const testName of Object.values(testNames)) {
		const { name, boards, runBoards, cmakeToolsOptions } = testName;
		for (const board of boards) {
			for (const cmakeTools of cmakeToolsOptions) {
				test(`New Project ${name} ${board} ${cmakeTools ? "with CMake Tools" : "without CMake Tools"}`, async () => {
					if (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.endsWith(name)) {
						throw new Error(`${name} workspace folder already exists`);
					}

					const result = await vscode.commands.executeCommand('raspberry-pi-pico.testCreateProject', name, board, cmakeTools) as string;

					assert.strictEqual(result, "Project created");
				});
			}
		}
	}
});
