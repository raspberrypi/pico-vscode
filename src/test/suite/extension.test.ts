import { strictEqual, ok, notStrictEqual, doesNotReject } from "assert";
import { commands, extensions, Uri, window } from "vscode";
import { NewProjectPanel } from "../../webview/newProjectPanel";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { existsSync, readdirSync } from "fs";
import which from "which";
import UninstallPicoSDKCommand from "../../commands/uninstallPicoSDK";
import { extensionName } from "../../commands/command";

const extensionId = `raspberry-pi.${extensionName}`;

suite("Extension Test Suite", () => {
  const projectsRoot = join(tmpdir(), "pico-vscode-testing");

  suiteTeardown(() => {
    window.showInformationMessage("All tests done!");
  });

  window.showInformationMessage("Start all tests.");

  test("Activate extension", async () => {
    const extension = extensions.getExtension(extensionId);
    notStrictEqual(extension, undefined);
    await doesNotReject(async () => extension!.activate());
    strictEqual(extension?.isActive, true);
  });

  test("Activation via Quick Access Panel", async () => {
    await commands.executeCommand(
      "raspberry-pi-pico-project-quick-access.focus"
    );
    ok(extensions.getExtension(extensionId)?.isActive);
  });

  test("New Project from blink example test", async () => {
    if (process.platform === "darwin" || process.platform === "linux") {
      if (process.platform === "linux") {
        // check if system python3 command is available
        notStrictEqual(
          await which("python3", { nothrow: true }),
          null,
          "Preinstalled python3 not found. " +
            "This test requires on linux python3 to be installed."
        );
      }

      // check for git
      notStrictEqual(
        await which("git", { nothrow: true }),
        null,
        "Preinstalled git not found. " +
          "This test requires git to be installed."
      );

      // check for tar
      notStrictEqual(
        await which("tar", { nothrow: true }),
        null,
        "Preinstalled tar not found. " +
          "This test requires tar to be installed."
      );
    }

    const extension = extensions.getExtension(extensionId);
    notStrictEqual(extension, undefined);
    await doesNotReject(async () => extension!.activate());
    strictEqual(extension?.isActive, true);

    NewProjectPanel.createOrShow(
      extension.extensionUri,
      false,
      true,
      undefined
    );
    await new Promise(resolve => {
      setTimeout(resolve, 1000);
    });
    notStrictEqual(
      NewProjectPanel.currentPanel,
      undefined,
      "Failed to create new project from example panel"
    );

    strictEqual(
      NewProjectPanel.currentPanel!.getTitle(),
      NewProjectPanel.newFromExampleTitle,
      "New project from example panel has incorrect title"
    );

    ok(NewProjectPanel.currentPanel!.getIsCreateFromExampleOnly());

    // submit example
    const expectedLocaiton = join(projectsRoot, "blink");
    NewProjectPanel.currentPanel!.submitExample(Uri.file(projectsRoot), {
      example: "blink",
      boardType: "pico2",
      selectedSDK: "2.0.0",
      selectedToolchain: "13_3_Rel1",
      selectedPicotool: "2.0.0",
      ninjaMode: 0,
      ninjaPath: "",
      ninjaVersion: "",
      cmakeMode: 0,
      cmakePath: "",
      cmakeVersion: "",
      pythonMode: 0,
      pythonPath: "",

      // debugger selection CMSIS-DAP
      debugger: 0,
    });

    await doesNotReject(
      new Promise((resolve, reject) => {
        let onFailed = (): void => {};
        const onGenerated = (): void => {
          NewProjectPanel.currentPanel!.off(
            NewProjectPanel.onProjectGenerationErrorEvent,
            onFailed
          );
          resolve(undefined);
        };
        onFailed = (): void => {
          NewProjectPanel.currentPanel!.off(
            NewProjectPanel.onProjectGeneratedEvent,
            onGenerated
          );
          reject(new Error("Failed to generate project"));
        };

        NewProjectPanel.currentPanel!.once(
          NewProjectPanel.onProjectGeneratedEvent,
          onGenerated
        );

        NewProjectPanel.currentPanel!.once(
          NewProjectPanel.onProjectGenerationErrorEvent,
          onFailed
        );
      })
    );

    // check generated stuff

    // check if all requriements are installed
    // on all: sdk, toolchain, picotool, cmake, ninja
    const reqRoot = join(homedir(), ".pico-sdk");
    const sdkFile = join(
      reqRoot,
      "sdk",
      "2.0.0",
      "external",
      "pico_sdk_import.cmake"
    );
    const toolchainFile = join(
      reqRoot,
      "toolchain",
      "13_3_Rel1",
      "bin",
      "arm-none-eabi-gcc.exe"
    );
    const picotoolFile = join(
      reqRoot,
      "picotool",
      "2.0.0",
      "picotool",
      process.platform === "win32" ? "picotool.exe" : "picotool"
    );
    const picoCmakeFile = join(reqRoot, "cmake", "pico-vscode.cmake");
    const cmakeFile = join(
      reqRoot,
      "cmake",
      "v3.28.6",
      "bin",
      process.platform === "win32" ? "cmake.exe" : "cmake"
    );
    const ninjaFile = join(
      reqRoot,
      "ninja",
      "v1.12.1",
      process.platform === "win32" ? "ninja.exe" : "ninja"
    );

    ok(
      readdirSync(reqRoot).length > 0,
      "No requirements installed in ~/.pico-sdk"
    );

    ok(
      readdirSync(join(reqRoot, "sdk")).length > 0,
      "No sdk installed in ~/.pico-sdk"
    );

    ok(
      readdirSync(join(reqRoot, "toolchain")).length > 0,
      "No toolchain installed in ~/.pico-sdk"
    );

    ok(
      readdirSync(join(reqRoot, "picotool")).length > 0,
      "No picotool installed in ~/.pico-sdk"
    );

    ok(
      readdirSync(join(reqRoot, "cmake")).length > 0,
      "No cmake installed in ~/.pico-sdk"
    );

    ok(
      readdirSync(join(reqRoot, "ninja")).length > 0,
      "No ninja installed in ~/.pico-sdk"
    );

    // check files directly
    ok(existsSync(sdkFile), "SDK not installed correctly");
    ok(existsSync(toolchainFile), "Toolchain not installed correctly");
    ok(existsSync(picotoolFile), "Picotool not installed correctly");
    ok(existsSync(picoCmakeFile), "Pico CMake not installed correctly");
    ok(existsSync(cmakeFile), "CMake not installed correctly");
    ok(existsSync(ninjaFile), "Ninja not installed correctly");

    switch (process.platform) {
      case "linux":
        break;
      // TODO: maybe force on windows to install git
      case "win32": // check for pytho
      case "darwin":
        // check for python
        {
          const pythonFile = join(reqRoot, "python", "3.12.1", "python.exe");
          ok(existsSync(pythonFile), "Python not installed correctly");
        }
        break;
      default:
        throw new Error("Unsupported platform");
    }

    // check if the project was generated
    /* project layout check:
    expectedLocaiton |
      - .vscode |
        - settings.json
        - launch.json
        - tasks.json
        - c_cpp_properties.json
        - cmake-kits.json
        - extensions.json
        
      - .gitignore
      - *.c count > 0
      - pico_sdk_import.cmake
      - CMakeLists.txt
    */

    const rootFiles = readdirSync(expectedLocaiton);
    ok(rootFiles.length > 0);
    ok(rootFiles.includes(".vscode"));
    const vscodePath = join(expectedLocaiton, ".vscode");
    const vscodeFiles = readdirSync(vscodePath);
    strictEqual(vscodeFiles.length, 6);
    ok(
      vscodeFiles.includes("settings.json"),
      "No settings.json found in .vscode"
    );
    ok(vscodeFiles.includes("launch.json"), "No launch.json found in .vscode");
    ok(vscodeFiles.includes("tasks.json"), "No tasks.json found in .vscode");
    ok(
      vscodeFiles.includes("c_cpp_properties.json"),
      "No c_cpp_properties.json found in .vscode"
    );
    ok(
      vscodeFiles.includes("cmake-kits.json"),
      "No cmake-kits.json found in .vscode"
    );
    ok(
      vscodeFiles.includes("extensions.json"),
      "No extensions.json found in .vscode"
    );

    ok(rootFiles.includes(".gitignore"), "No .gitignore found in project");
    ok(
      rootFiles.includes("pico_sdk_import.cmake"),
      "No pico_sdk_import.cmake found in project"
    );
    ok(
      rootFiles.includes("CMakeLists.txt"),
      "No CMakeLists.txt found in project"
    );
    ok(
      rootFiles.filter(file => file.endsWith(".c")).length > 0,
      "No .c files in generated project found"
    );
  });

  test("Uninstall pico-sdk", async () => {
    await commands.executeCommand(
      extensionName + "." + UninstallPicoSDKCommand.id
    );
    const reqRoot = join(homedir(), ".pico-sdk");
    ok(!existsSync(reqRoot), "Failed to uninstall pico-sdk");
  });

  /*test("New Project from blink example test (RISC-V)", () => {
    const extension = extensions.getExtension(extensionId);
    notStrictEqual(extension, undefined);

    NewProjectPanel.test(extension!.extensionUri);

    ok(extensions.getExtension(extensionId)?.isActive);
  });*/
});
