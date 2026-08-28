import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
const pathList = projectPath.split(path.sep);
const testName = pathList.pop();
const board = pathList.pop();

suite(`${testName} Zephyr Project Test Suite`, () => {

	if (!testName) {
		throw new Error(`testName not found`);
	}

	test(`${testName} Compile Zephyr Project ${board}`, async () => {
		const result = await vscode.commands.executeCommand("raspberry-pi-pico.compileProject") as boolean;
		assert.strictEqual(result, true);
		// west puts its output under build/zephyr, not alongside the project like
		// the SDK build does
		assert.strictEqual(
			fs.existsSync(path.join(projectPath, "build", "zephyr", "zephyr.elf")),
			true,
			"zephyr.elf was not built"
		);
	});
});
