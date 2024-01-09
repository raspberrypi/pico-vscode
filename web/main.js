"use strict";

const CMD_CHANGE_LOCATION = 'changeLocation';
const CMD_SUBMIT = 'submit';
const CMD_CANCEL = 'cancel';
const CMD_SET_THEME = 'setTheme';
const CMD_ERROR = 'error';
const CMD_SUBMIT_DENIED = 'submitDenied';

var submitted = false;
var isPicoWireless = false;

(function () {
  const vscode = acquireVsCodeApi();

  const oldState = vscode.getState();

  console.log("oldState", oldState);

  // needed so a element isn't hidden behind the navbar on scroll
  const navbarOffsetHeight = document.getElementById('top-navbar').offsetHeight;

  // returns true if project name input is valid
  function projectNameFormValidation(projectNameElement) {
    const projectNameError = document.getElementById('inp-project-name-error');
    const projectName = projectNameElement.value;

    var invalidChars = /[\/:*?"<>|]/;
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

    // get all values of inputs
    const projectNameElement = document.getElementById('inp-project-name');
    const projectName = projectNameElement.value;
    if (!projectNameFormValidation(projectNameElement)) {
      submitted = false;
      return;
    }

    // already stored in the extension, readonly
    //const projectLocation = document.getElementById('inp-project-location').value;

    // get board type
    const boardType = document.getElementById('sel-board-type').value;

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

    // features
    const spiFeature = document.getElementById('spi-features-cblist').checked;
    const pioFeature = document.getElementById('pio-features-cblist').checked;
    const i2cFeature = document.getElementById('i2c-features-cblist').checked;
    const dmaFeature = document.getElementById('dma-features-cblist').checked;
    const hwwatchdogFeature = document.getElementById('hwwatchdog-features-cblist').checked;
    const hwclocksFeature = document.getElementById('hwclocks-features-cblist').checked;
    const hwinterpolationFeature = document.getElementById('hwinterpolation-features-cblist').checked;
    const hwtimerFeature = document.getElementById('hwtimer-features-cblist').checked;

    // get stdio support
    const uartStdioSupport = document.getElementById('uart-stdio-support-cblist').checked;
    const usbStdioSupport = document.getElementById('usb-stdio-support-cblist').checked;

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

    // debugger selection
    const debuggerRadio = document.getElementsByName('debugger-radio');
    let debuggerSelection = null;
    for (let i = 0; i < debuggerRadio.length; i++) {
      if (debuggerRadio[i].checked) {
        debuggerSelection = debuggerRadio[i].value;
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
        addExamplesCodeGen: addExamplesCodeGen,
        runFromRamCodeGen: runFromRamCodeGen,
        cppCodeGen: cppCodeGen,
        cppRttiCodeGen: cppRttiCodeGen,
        cppExceptionsCodeGen: cppExceptionsCodeGen,

        // debugger selection
        debuggerSelection: debuggerSelection
      }
    });
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
      case CMD_SUBMIT_DENIED:
        submitted = false;
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
  document.getElementById('btn-create').addEventListener('click', submitBtnClick);
  const selectBoardTypeElement = document.getElementById('sel-board-type');
  if (selectBoardTypeElement) {
    document.getElementById('sel-board-type').addEventListener('change', function () {
      const isPicoWireless = selectBoardTypeElement.value === "pico-w";

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
    });
  }

  const ninjaVersionRadio = document.getElementsByName('ninja-version-radio');
  if (ninjaVersionRadio.length > 0)
    ninjaVersionRadio[0].checked = true;
  const cmakeVersionRadio = document.getElementsByName('cmake-version-radio');
  cmakeVersionRadio[0].checked = true;
  const pythonVersionRadio = document.getElementsByName('python-version-radio');
  if (pythonVersionRadio.length > 0)
    pythonVersionRadio[0].checked = true;
}());
