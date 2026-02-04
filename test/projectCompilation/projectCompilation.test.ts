import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as myExtension from '../../extension';

const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
const pathList = projectPath.split(path.sep);
const testName = pathList.pop();
const board = pathList.pop();
const type = pathList.pop();

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

	test(`${testName} Compile Project ${type}`, async () => {
		if (type === "cmakeTools") {
			// Wait for a bit
			await new Promise(resolve => setTimeout(resolve, 5000));
			// Kit selection may not have run yet
			await vscode.commands.executeCommand("cmake.setKitByName", "Pico");
			// Wait for a bit more
			await new Promise(resolve => setTimeout(resolve, 5000));
			// Select launch target
			await vscode.commands.executeCommand("cmake.selectLaunchTarget", "", testName);	// takes folder then name, but folder can be empty string
		}
		const result = await vscode.commands.executeCommand("raspberry-pi-pico.compileProject") as boolean;
		assert.strictEqual(result, true);
		assert.strictEqual(fs.existsSync(path.join(projectPath, "build", `${testName}.elf`)), true);
		assert.strictEqual(fs.existsSync(path.join(projectPath, "build", `${testName}.uf2`)), true);
	});

	if (testNames[testName].runBoards.includes(board)) {
		test(`${testName} Run Project`, async () => {
			const result = await vscode.commands.executeCommand('raspberry-pi-pico.runProject') as boolean;
			assert.strictEqual(result, true);
		});
	}
});
