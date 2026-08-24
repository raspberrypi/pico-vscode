import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as myExtension from '../../extension';

const testNamesFilePath = path.join(__dirname, 'testNames.json');
const testNames: Record<string, { name: string, boards: string[], runBoards: string[], cmakeToolsOptions: boolean[] }> = JSON.parse(fs.readFileSync(testNamesFilePath, 'utf8'));

const rigFilePath = path.join(__dirname, 'rig.json');
const rig: {
	probeSerials: Record<string, string | null>,
	boardChips: Record<string, string>,
	bootselPids: Record<string, number>,
} = JSON.parse(fs.readFileSync(rigFilePath, 'utf8'));

/**
 * Point a new project's hardware tasks at the board it was created for.
 *
 * The generated tasks carry no device selector, which is unambiguous with a
 * single board on the desk but not on the hardware rig, where an RP2040 and an
 * RP2350 are attached at once, each with its own debug probe: Erase Start would
 * drive whichever probe openocd enumerated first, and picotool would have two
 * candidate devices to choose between.
 *
 * Done as each project is created, rather than in the compilation suite that
 * runs the tasks, because the project is still closed here - so there's no race
 * with VS Code reloading tasks.json underneath a test that is about to run it.
 */
function pinTasksToBoard(projectPath: string, board: string): void {
	const chip = rig.boardChips[board];
	const serial = rig.probeSerials[chip];
	const bootselPid = rig.bootselPids[chip];
	const tasksFile = path.join(projectPath, '.vscode', 'tasks.json');
	// The generated file has trailing commas: fine for VS Code, not for JSON.parse.
	const tasks = JSON.parse(
		fs.readFileSync(tasksFile, 'utf8').replace(/,(\s*[}\]])/g, '$1')
	) as { tasks: Array<{ command?: string, args?: string[] }> };

	for (const task of tasks.tasks) {
		const args = task.args;
		const command = path.basename(task.command ?? '');
		if (args === undefined) {
			continue;
		}

		if (command.startsWith('openocd') && serial) {
			// `adapter serial` needs an adapter driver to have been selected, so
			// it goes after the interface config (the first -f) and before the
			// target config.
			const iface = args.indexOf('-f');
			if (iface >= 0 && !args.includes(`adapter serial ${serial}`)) {
				args.splice(iface + 2, 0, '-c', `adapter serial ${serial}`);
			}
		} else if (command.startsWith('picotool') && !args.includes('--pid')) {
			// Erase Start leaves the board in BOOTSEL, where its product id is
			// what tells it apart from the other chip on the rig.
			//
			// It has to go ahead of the existing flags: picotool rejects any
			// device selector that follows --force ("unexpected option: --pid"),
			// and the generated task passes -fx.
			const firstFlag = args.findIndex(arg => arg.startsWith('-'));
			args.splice(
				firstFlag < 0 ? args.length : firstFlag,
				0,
				'--pid', `0x${bootselPid.toString(16).padStart(4, '0')}`
			);
		}
	}

	fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 4));
}

suite(`Project Creation Test Suite`, function() {

	for (const testName of Object.values(testNames)) {
		const { name, boards, runBoards, cmakeToolsOptions } = testName;
		for (const board of boards) {
			for (const cmakeTools of cmakeToolsOptions) {
				test(`New Project ${name} ${board} ${cmakeTools ? "with CMake Tools" : "without CMake Tools"}`, async () => {
					const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					if (workspacePath?.endsWith(name)) {
						throw new Error(`${name} workspace folder already exists`);
					}

					const result = await vscode.commands.executeCommand('raspberry-pi-pico.testCreateProject', name, board, cmakeTools) as string;

					assert.strictEqual(result, "Project created");

					if (workspacePath && runBoards.includes(board)) {
						pinTasksToBoard(path.join(
							workspacePath,
							'projects',
							cmakeTools ? 'cmakeTools' : 'default',
							board,
							name
						), board);
					}
				});
			}
		}
	}
});
