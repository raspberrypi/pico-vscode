import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

import { EventEmitter } from 'events';

const testName = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.split('/').pop();

suite(`${testName} Project Test Suite`, () => {

	test(`${testName} Erase Start`, async () => {
		// // Get the task with the specified name
    // const task = (await vscode.tasks.fetchTasks()).find(
    //   task =>
    //     task.name === "Erase Start"
    // );

		// assert.notStrictEqual(task, undefined);

		// // Execute the task
		// const emitter = new EventEmitter();

		// // add callbacks for task completion
		// const end = vscode.tasks.onDidEndTaskProcess(e => {
		// 	if (e.execution.task === task) {
		// 		emitter.emit(
		// 			"terminated",
		// 			e.exitCode === undefined ? -1 : e.exitCode
		// 		);
		// 	}
		// });
		// const end2 = vscode.tasks.onDidEndTask(e => {
		// 	if (e.execution.task === task) {
		// 		emitter.emit("terminated", -1);
		// 	}
		// });

		// await vscode.tasks.executeTask(task!);
		// // eslint-disable-next-line @typescript-eslint/no-unused-vars
		// const code = await new Promise<number>((resolve, reject) => {
		// 	emitter.on("terminated", code => {
		// 		if (typeof code === "number") {
		// 			resolve(code);
		// 		} else {
		// 			resolve(-1);
		// 		}
		// 	});
		// });

		// // dispose of callbacks
		// end.dispose();
		// end2.dispose();

		const result = await vscode.commands.executeCommand("raspberry-pi-pico.testRunTask", "Erase Start") as string;
		assert.strictEqual(result, "Task completed");
	});

	test(`${testName} Compile Project`, async () => {
		const result = await vscode.commands.executeCommand("raspberry-pi-pico.compileProject") as boolean;
		assert.strictEqual(result, true);
	});

	test(`${testName} Run Project`, async () => {
		const result = await vscode.commands.executeCommand('raspberry-pi-pico.runProject') as boolean;
		assert.strictEqual(result, true);
	});
});
