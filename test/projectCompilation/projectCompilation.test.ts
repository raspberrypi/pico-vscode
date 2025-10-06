import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as myExtension from '../../extension';

const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.split(path.sep);
const testName = projectPath?.pop();
const board = projectPath?.pop();

const testNamesFilePath = path.join(__dirname, 'testNames.json');
const testNames = JSON.parse(fs.readFileSync(testNamesFilePath, 'utf8'));

suite(`${testName} Project Test Suite`, () => {

	if (!testName) {
		throw new Error(`testName not found`);
	}

	if (!testNames[testName]) {
		throw new Error(`${testName} not found in testNames.json`);
	}

	if (testNames[testName].runBoards.includes(board)) {
		test(`${testName} Erase Start`, async () => {
			const result = await vscode.commands.executeCommand("raspberry-pi-pico.testRunTask", "Erase Start") as string;
			assert.strictEqual(result, "Task completed");
		});
	}

	test(`${testName} Compile Project`, async () => {
		const result = await vscode.commands.executeCommand("raspberry-pi-pico.compileProject") as boolean;
		assert.strictEqual(result, true);
	});

	if (testNames[testName].runBoards.includes(board)) {
		test(`${testName} Run Project`, async () => {
			const result = await vscode.commands.executeCommand('raspberry-pi-pico.runProject') as boolean;
			assert.strictEqual(result, true);
		});
	}
});
