import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const zephyrTestsFilePath = path.join(__dirname, 'zephyrTests.json');
const zephyrTests: Array<{ name: string, board: string, template: string, console: string }> =
	JSON.parse(fs.readFileSync(zephyrTestsFilePath, 'utf8'));

suite(`Zephyr Project Creation Test Suite`, function() {

	for (const { name, board, template, console: consoleType } of zephyrTests) {
		test(`New Zephyr Project ${name} ${board}`, async () => {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (workspacePath?.endsWith(name)) {
				throw new Error(`${name} workspace folder already exists`);
			}

			const result = await vscode.commands.executeCommand(
				'raspberry-pi-pico.testCreateZephyrProject',
				name,
				board,
				template,
				consoleType
			) as string;

			assert.strictEqual(result, "Project created");

			if (workspacePath) {
				// west needs these to build, and getting them wrong is the kind of
				// thing that only shows up much later, in the compilation suite
				const projectPath = path.join(workspacePath, 'zephyrProjects', board, name);
				for (const file of ['CMakeLists.txt', 'prj.conf', '.vscode/tasks.json']) {
					assert.strictEqual(
						fs.existsSync(path.join(projectPath, file)),
						true,
						`${file} was not generated`
					);
				}
			}
		});
	}
});
