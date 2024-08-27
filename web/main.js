"use strict";

const CMD_CHANGE_LOCATION = 'changeLocation';
const CMD_SUBMIT = 'submit';
const CMD_CANCEL = 'cancel';
const CMD_SET_THEME = 'setTheme';
const CMD_ERROR = 'error';
const CMD_SUBMIT_DENIED = 'submitDenied';
const CMD_VERSION_BUNDLE_AVAILABLE_TEST = 'versionBundleAvailableTest';
const CMD_SUBMIT_EXAMPLE = 'submitExample';
const CMD_IMPORT_PROJECT = 'importProject';
const CMD_CREATE_FROM_EXAMPLE = 'createFromExample';
const CMD_NOT_CREATE_FROM_EXAMPLE = 'notCreateFromExample';

var submitted = false;
var isPicoWireless = false;

(function () {
  const vscode = acquireVsCodeApi();

  // setup state for webview implemented in state.js
  setupStateSystem(vscode);

  // needed so a element isn't hidden behind the navbar on scroll
  const navbarOffsetHeight = document.getElementById('top-navbar').offsetHeight;

  // returns true if project name input is valid
  function projectNameFormValidation(projectNameElement) {
    if (typeof examples !== 'undefined') {
      return true;
    }

    const projectNameError = document.getElementById('inp-project-name-error');
    const projectName = projectNameElement.value;

    var invalidChars = /[\/:*?"<>| ]/;
    // check for reserved names in Windows
    var reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
    if (projectName.trim().length == 0 || invalidChars.test(projectName) || reservedNames.test(projectName)) {
      projectNameError.hidden = false;
      //projectNameElement.scrollIntoView({ behavior: "smooth" });
      window.scrollTo({
        top: projectNameElement.offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });

      return false;
    }

    projectNameError.hidden = true;
    return true;
  }

  window.changeLocation = () => {
    // Send a message back to the extension
    vscode.postMessage({
      command: CMD_CHANGE_LOCATION,
      value: null
    });
  }

  window.cancelBtnClick = () => {
    // close webview
    vscode.postMessage({
      command: CMD_CANCEL,
      value: null
    });
  }

  window.submitBtnClick = () => {
    /* Catch silly users who spam the submit button */
    if (submitted) {
      console.error("already submitted");
      return;
    }
    submitted = true;

    const createFromExampleBtn = document.getElementById('btn-create-from-example');
    const isExampleMode = createFromExampleBtn ? createFromExampleBtn.getAttribute('data-example-mode') === 'true' : true;
    if (isExampleMode && !isExampleSelected && !doProjectImport) {
      console.error("example not selected");
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select an example or enter custom project creation."
      });
      submitted = false;
      return;
    }

    // get all values of inputs
    const projectNameElement = document.getElementById('inp-project-name');
    // if is project import then the project name element will not be rendered and does not exist in the DOM
    const projectName = doProjectImport ? undefined : projectNameElement.value;
    if (projectName !== undefined && !projectNameFormValidation(projectNameElement)) {
      submitted = false;
      return;
    }

    // already stored in the extension, readonly
    //const projectLocation = document.getElementById('inp-project-location').value;

    // get board type, (if is project import then the sel-board-type element will not be rendered and does not exist in the DOM)
    const boardType = doProjectImport ? undefined : document.getElementById('sel-board-type').value;

    // selected sdk
    const selectedSDK = document.getElementById('sel-pico-sdk').value;
    // selected toolchain
    const selectedToolchain = document.getElementById('sel-toolchain').value;

    // TODO: maybe move these duplicate sections for ninja, cmake and python into a generic helper function

    // selected ninja version
    const ninjaVersionRadio = document.getElementsByName('ninja-version-radio');
    let ninjaMode = null;
    let ninjaPath = null;
    let ninjaVersion = null;
    for (let i = 0; i < ninjaVersionRadio.length; i++) {
      if (ninjaVersionRadio[i].checked) {
        ninjaMode = ninjaVersionRadio[i].value;
        break;
      }
    }
    if (ninjaVersionRadio.length == 0) {
      // default to ninja mode 1 == System version
      ninjaMode = 1;
    }

    // if ninja version is null or not a number, smaller than 0 or bigger than 3, set it to 0
    if (ninjaMode === null || isNaN(ninjaMode) || ninjaMode < 0 || ninjaMode > 4) {
      ninjaMode = 0;
      console.debug('Invalid ninja version value: ' + ninjaMode.toString());
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select a valid ninja version."
      });
      submitted = false;

      return;
    }
    if (ninjaMode == 2) {
      ninjaVersion = document.getElementById('sel-ninja').value;
    } else if (ninjaMode == 3) {
      const files = document.getElementById('ninja-path-executable').files;

      if (files.length == 1) {
        ninjaPath = files[0].name;
      } else {
        console.debug("Please select a valid ninja executable file");
        vscode.postMessage({
          command: CMD_ERROR,
          value: "Please select a valid ninja executable file."
        });
        submitted = false;

        return;
      }
    }

    // selected cmake version
    const cmakeVersionRadio = document.getElementsByName('cmake-version-radio');
    let cmakeMode = null;
    let cmakePath = null;
    let cmakeVersion = null;
    for (let i = 0; i < cmakeVersionRadio.length; i++) {
      if (cmakeVersionRadio[i].checked) {
        cmakeMode = cmakeVersionRadio[i].value;
        break;
      }
    }
    if (cmakeVersionRadio.length == 0) {
      // default to cmake mode 1 == System version
      cmakeMode = 1;
    }

    // if cmake version is null or not a number, smaller than 0 or bigger than 3, set it to 0
    if (cmakeMode === null || isNaN(cmakeMode) || cmakeMode < 0 || cmakeMode > 4) {
      // TODO: first check if defaul is supported
      cmakeMode = 0;
      console.debug('Invalid cmake version value: ' + cmakeMode.toString());
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select a valid cmake version."
      });
      submitted = false;

      return;
    }
    if (cmakeMode == 2) {
      cmakeVersion = document.getElementById('sel-cmake').value;
    } else if (cmakeMode == 3) {
      const files = document.getElementById('cmake-path-executable').files;

      if (files.length == 1) {
        cmakePath = files[0].name;
      } else {
        console.debug("Please select a valid cmake executable file");
        vscode.postMessage({
          command: CMD_ERROR,
          value: "Please select a valid cmake executable file."
        });
        submitted = false;

        return;
      }
    }

    // selected cmake version
    const pythonVersionRadio = document.getElementsByName('python-version-radio');
    let pythonMode = null;
    let pythonPath = null;
    for (let i = 0; i < pythonVersionRadio.length; i++) {
      if (pythonVersionRadio[i].checked) {
        pythonMode = pythonVersionRadio[i].value;
        break;
      }
    }
    if (pythonVersionRadio.length == 0) {
      // default to python mode 1 == System version
      pythonMode = 1;
    }

    // if cmake version is null or not a number, smaller than 0 or bigger than 3, set it to 0
    if (pythonMode === null || isNaN(pythonMode) || pythonMode < 0 || pythonMode > 3) {
      // TODO: first check if defaul is supported
      pythonMode = 0;
      console.debug('Invalid python version value: ' + pythonMode.toString());
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select a valid python version."
      });
      submitted = false;

      return;
    }
    if (pythonMode == 2) {
      const files = document.getElementById('python-path-executable').files;

      if (files.length == 1) {
        cmakePath = files[0].name;
      } else {
        console.debug("Please select a valid python executable file");
        vscode.postMessage({
          command: CMD_ERROR,
          value: "Please select a valid python executable file."
        });
        submitted = false;

        return;
      }
    }

    // debugger selection
    const debuggerRadio = document.getElementsByName('debugger-radio');
    let debuggerSelection = null;
    for (let i = 0; i < debuggerRadio.length; i++) {
      if (debuggerRadio[i].checked) {
        debuggerSelection = parseInt(debuggerRadio[i].value);
        break;
      }
    }
    // if debugger selection is null or not a number, smaller than 0 or bigger than 1, set it to 0
    if (debuggerSelection === null || isNaN(debuggerSelection) || debuggerSelection < 0 || debuggerSelection > 1) {
      debuggerSelection = 0;
      console.debug('Invalid debugger selection value: ' + debuggerSelection);
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select a valid debugger"
      });
      submitted = false;
      return;
    }

    if (doProjectImport) {
      vscode.postMessage({
        command: CMD_IMPORT_PROJECT,
        value: {
          selectedSDK: selectedSDK,
          selectedToolchain: selectedToolchain,
          ninjaMode: Number(ninjaMode),
          ninjaPath: ninjaPath,
          ninjaVersion: ninjaVersion,
          cmakeMode: Number(cmakeMode),
          cmakePath: cmakePath,
          cmakeVersion: cmakeVersion,
          pythonMode: Number(pythonMode),
          pythonPath: pythonPath,

          // debugger selection
          debugger: 0
        }
      });
      return;
    }

    if (isExampleMode && isExampleSelected) {
      vscode.postMessage({
        command: CMD_SUBMIT_EXAMPLE,
        value: {
          example: projectName,
          boardType: boardType,

          selectedSDK: selectedSDK,
          selectedToolchain: selectedToolchain,
          ninjaMode: Number(ninjaMode),
          ninjaPath: ninjaPath,
          ninjaVersion: ninjaVersion,
          cmakeMode: Number(cmakeMode),
          cmakePath: cmakePath,
          cmakeVersion: cmakeVersion,
          pythonMode: Number(pythonMode),
          pythonPath: pythonPath,

          // debugger selection
          debugger: debuggerSelection
        }
      });
      return;
    }

    // get stdio support
    const uartStdioSupport = document.getElementById('uart-stdio-support-cblist').checked;
    const usbStdioSupport = document.getElementById('usb-stdio-support-cblist').checked;

    // features
    const spiFeature = document.getElementById('spi-features-cblist').checked;
    const pioFeature = document.getElementById('pio-features-cblist').checked;
    const i2cFeature = document.getElementById('i2c-features-cblist').checked;
    const dmaFeature = document.getElementById('dma-features-cblist').checked;
    const hwwatchdogFeature = document.getElementById('hwwatchdog-features-cblist').checked;
    const hwclocksFeature = document.getElementById('hwclocks-features-cblist').checked;
    const hwinterpolationFeature = document.getElementById('hwinterpolation-features-cblist').checked;
    const hwtimerFeature = document.getElementById('hwtimer-features-cblist').checked;

    const picoWirelessRadio = document.getElementsByName('pico-wireless-radio');
    let picoWireless = null;
    for (let i = 0; i < picoWirelessRadio.length; i++) {
      if (picoWirelessRadio[i].checked) {
        picoWireless = picoWirelessRadio[i].value;
        break;
      }
    }
    // if pico wireless is null or not a number, smaller than 0 or bigger than 3, set it to 0
    if (picoWireless === null || isNaN(picoWireless) || picoWireless < 0 || picoWireless > 3) {
      picoWireless = 0;
      console.debug('Invalid pico wireless value: ' + picoWireless);
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select a valid pico wireless option"
      });
      submitted = false;
      return;
    }

    // code-gen options
    const addExamplesCodeGen = document.getElementById('add-examples-code-gen-cblist').checked;
    const runFromRamCodeGen = document.getElementById('run-from-ram-code-gen-cblist').checked;
    const cppCodeGen = document.getElementById('cpp-code-gen-cblist').checked;
    const cppRttiCodeGen = document.getElementById('cpp-rtti-code-gen-cblist').checked;
    const cppExceptionsCodeGen = document.getElementById('cpp-exceptions-code-gen-cblist').checked;

    //post all data values to the extension
    vscode.postMessage({
      command: CMD_SUBMIT,
      value: {
        projectName: projectName,
        boardType: boardType,
        selectedSDK: selectedSDK,
        selectedToolchain: selectedToolchain,
        ninjaMode: Number(ninjaMode),
        ninjaPath: ninjaPath,
        ninjaVersion: ninjaVersion,
        cmakeMode: Number(cmakeMode),
        cmakePath: cmakePath,
        cmakeVersion: cmakeVersion,
        pythonMode: Number(pythonMode),
        pythonPath: pythonPath,

        // features
        spiFeature: spiFeature,
        pioFeature: pioFeature,
        i2cFeature: i2cFeature,
        dmaFeature: dmaFeature,
        hwwatchdogFeature: hwwatchdogFeature,
        hwclocksFeature: hwclocksFeature,
        hwinterpolationFeature: hwinterpolationFeature,
        hwtimerFeature: hwtimerFeature,

        // stdio support
        uartStdioSupport: uartStdioSupport,
        usbStdioSupport: usbStdioSupport,

        picoWireless: picoWireless,

        // code-gen options
        addExamples: addExamplesCodeGen,
        runFromRam: runFromRamCodeGen,
        cpp: cppCodeGen,
        cppRtti: cppRttiCodeGen,
        cppExceptions: cppExceptionsCodeGen,

        // debugger selection
        debugger: debuggerSelection
      }
    });
  }

  // get index of option (in select) by value
  function getIndexByValue(selectElement, value) {
    for (var i = 0; i < selectElement.options.length; i++) {
      if (selectElement.options[i].value === value) {
        return i; // Found the index
      }
    }
    return -1; // Value not found
  }

  function _onMessage(event) {
    // JSON data sent from the extension
    const message = event.data;

    switch (message.command) {
      case CMD_CHANGE_LOCATION:
        // update UI
        document.getElementById('inp-project-location').value = message.value;
        break;
      case CMD_SET_THEME:
        console.log("set theme", message.theme);
        // update UI
        if (message.theme == "dark") {
          // explicitly choose dark mode
          localStorage.theme = 'dark'
          document.body.classList.add('dark')
        } else if (message.theme == "light") {
          document.body.classList.remove('dark')
          // explicitly choose light mode
          localStorage.theme = 'light'
        }
        break;
      case CMD_VERSION_BUNDLE_AVAILABLE_TEST:
        // update UI
        const result = message.value;
        const requiresVersionBundleElements = document.getElementsByClassName('requires-version-bundle');
        for (let i = 0; i < requiresVersionBundleElements.length; i++) {
          requiresVersionBundleElements[i].disabled = !result.result;
        }

        if (result.result && "toolchainVersion" in result && "riscvToolchainVersion" in result) {
          var toolchainSelector = document.getElementById("sel-toolchain");
          const useRiscv = document.getElementsByClassName('use-riscv');
          var selectedIndex = getIndexByValue(toolchainSelector, result.toolchainVersion);

          if (result.riscvToolchainVersion === "NONE") {
            document.getElementById("sel-pico2").disabled = true;
            const boardTypeSelector = document.getElementById('sel-board-type');

            if (boardTypeSelector && boardTypeSelector.value.includes("pico2")) {
              // first element could be hidden
              //document.getElementById('sel-board-type').selectedIndex = 0;

              // select first not hidden option
              for (let i = 0; i < boardTypeSelector.options.length; i++) {
                const option = boardTypeSelector.options[i];

                // Check if the option is not hidden
                if (option.style.display !== 'none' && option.hidden === false) {
                  boardTypeSelector.selectedIndex = i;
                  break;
                }
              }
            }
          } else {
            document.getElementById("sel-pico2").disabled = false;
          }

          var riscv = document.getElementById("sel-riscv").checked;
          var board = document.getElementById('sel-board-type').value;

          if (board !== "pico2") {
            for (let i = 0; i < useRiscv.length; i++) {
              useRiscv[i].hidden = true;
            }
          } else {
            for (let i = 0; i < useRiscv.length; i++) {
              useRiscv[i].hidden = false;
            }
            if (riscv) {
              selectedIndex = getIndexByValue(toolchainSelector, result.riscvToolchainVersion);
            }
          }

          if (selectedIndex !== -1) {
            toolchainSelector.selectedIndex = selectedIndex;
            console.debug("Updated selected toolchain with new default value", toolchainSelector.options[selectedIndex].value);
          } else {
            console.error("Could not find default toolchain version in versionBundle response!");
          }
        }

        // get all radio buttons with the specified names and select the first non-disabled option for each if the currently selected option is disabled
        // TODO: move in a helper function
        var pythonRadioButtons = document.querySelectorAll('input[name="python-version-radio"]');
        var ninjaRadioButtons = document.querySelectorAll('input[name="ninja-version-radio"]');
        var cmakeRadioButtons = document.querySelectorAll('input[name="cmake-version-radio"]');

        // Don't check if no pythonRadioButtons, eg on Linux
        if (pythonRadioButtons.length > 0) {
          // Check if the first radio button is selected and disabled
          if (pythonRadioButtons[0].checked && pythonRadioButtons[0].disabled) {
            // Find the first non-disabled radio button
            for (var i = 1; i < pythonRadioButtons.length; i++) {
              if (!pythonRadioButtons[i].disabled) {
                // Select the first non-disabled radio button
                pythonRadioButtons[i].checked = true;
                break;
              }
            }
          }
        }

        // Check if the first radio button is selected and disabled
        if (ninjaRadioButtons[0].checked && ninjaRadioButtons[0].disabled) {
          // Find the first non-disabled radio button
          for (var i = 1; i < ninjaRadioButtons.length; i++) {
            if (!ninjaRadioButtons[i].disabled) {
              // Select the first non-disabled radio button
              ninjaRadioButtons[i].checked = true;
              break;
            }
          }
        }

        // Check if the first radio button is selected and disabled
        if (cmakeRadioButtons[0].checked && cmakeRadioButtons[0].disabled) {
          // Find the first non-disabled radio button
          for (var i = 1; i < cmakeRadioButtons.length; i++) {
            if (!cmakeRadioButtons[i].disabled) {
              // Select the first non-disabled radio button
              cmakeRadioButtons[i].checked = true;
              break;
            }
          }
        }

        break;
      case CMD_SUBMIT_DENIED:
        submitted = false;
        break;
      case CMD_CREATE_FROM_EXAMPLE:
        if (window.toggleCreateFromExampleMode) {
          toggleCreateFromExampleMode(true);
        }
        break;
      case CMD_NOT_CREATE_FROM_EXAMPLE:
        if (window.toggleCreateFromExampleMode) {
          toggleCreateFromExampleMode(false, true);
        }
        break;
      default:
        console.error('Unknown command: ' + message.command);
        break;
    }
  }

  window.addEventListener("message", _onMessage);

  // add onclick event handlers to avoid inline handlers
  document.getElementById('btn-change-project-location').addEventListener('click', changeLocation);
  document.getElementById('btn-cancel').addEventListener('click', cancelBtnClick);
  document.getElementById('btn-advanced-options').addEventListener('click', function () {
    // get elements with class 'advanced-option' and toggle hidden
    const advancedOptions = document.getElementsByClassName('advanced-option');
    for (let i = 0; i < advancedOptions.length; i++) {
      advancedOptions[i].hidden = !advancedOptions[i].hidden;
    }
    const advancedOptions2 = document.getElementsByClassName('advanced-option-2');
    for (let i = 0; i < advancedOptions2.length; i++) {
      advancedOptions2[i].disabled = !advancedOptions2[i].disabled;
    }
    let hidden = advancedOptions[0].hidden;
    if (hidden) {
      document.getElementById('btn-advanced-options').innerText = "Show Advanced Options";
    } else {
      document.getElementById('btn-advanced-options').innerText = "Hide Advanced Options";
    }
  });
  document.getElementById('btn-create').addEventListener('click', submitBtnClick);
  const selectBoardTypeElement = document.getElementById('sel-board-type');
  if (selectBoardTypeElement) {
    selectBoardTypeElement.addEventListener('change', function (event) {
      try {
        // TODO: fix not very future proof for different model naming
        const isPicoWireless = selectBoardTypeElement.value.endsWith('w');

        if (!isPicoWireless) {
          navItemOnClick('nav-basic');
        }

        // hide pico wireless nav item
        document.getElementById('nav-pico-wireless').classList.toggle('hidden', !isPicoWireless);
        // hide pico wireless section
        document.getElementById('section-pico-wireless').hidden = !isPicoWireless;

        // reset selection
        if (!isPicoWireless) {
          // Check the first radio button (none)
          document.querySelectorAll('input[name="pico-wireless-radio"]')[0].checked = true;
        }

        const sdkVersion = document.getElementById('sel-pico-sdk').value;
        // send message to extension
        vscode.postMessage({
          command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
          value: sdkVersion.replace("v", "")
        });
      } catch { }
    });
  }
  document.getElementById('sel-pico-sdk').addEventListener('change', function () {
    const sdkVersion = document.getElementById('sel-pico-sdk').value;
    // send message to extension
    vscode.postMessage({
      command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
      value: sdkVersion.replace("v", "")
    });
  });
  document.getElementById('sel-riscv').addEventListener('change', function () {
    const sdkVersion = document.getElementById('sel-pico-sdk').value;
    // send message to extension
    vscode.postMessage({
      command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
      value: sdkVersion.replace("v", "")
    });
  });

  const ninjaVersionRadio = document.getElementsByName('ninja-version-radio');
  if (ninjaVersionRadio.length > 0)
    ninjaVersionRadio[0].checked = true;
  const cmakeVersionRadio = document.getElementsByName('cmake-version-radio');
  cmakeVersionRadio[0].checked = true;
  const pythonVersionRadio = document.getElementsByName('python-version-radio');
  if (pythonVersionRadio.length > 0)
    pythonVersionRadio[0].checked = true;

  const sdkVersion = document.getElementById('sel-pico-sdk').value;
  // send message to extension
  vscode.postMessage({
    command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
    value: sdkVersion.replace("v", "")
  });
}());
