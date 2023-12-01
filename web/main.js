"use strict";

const CMD_CHANGE_LOCATION = 'changeLocation';
const CMD_SUBMIT = 'submit';
const CMD_CANCEL = 'cancel';
const CMD_SET_THEME = 'setTheme';

var submitted = false;
var isPicoWireless = false;

(function () {
  const vscode = acquireVsCodeApi();

  const oldState = vscode.getState();

  console.log("oldState", oldState);

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
    const projectName = document.getElementById('inp-project-name').value;
    // already stored in the extension, readonly
    //const projectLocation = document.getElementById('inp-project-location').value;

    // get board type
    const boardType = document.getElementById('sel-board-type').value;

    // selected sdk
    const selectedSDK = document.getElementById('sel-pico-sdk').value;
    // selected toolchain
    const selectedToolchain = document.getElementById('sel-toolchain').value;
    // selected ninja version
    const selectedNinja = document.getElementById('sel-ninja').value;

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
    }

    //post all data values to the extension
    vscode.postMessage({
      command: CMD_SUBMIT,
      value: {
        projectName: projectName,
        boardType: boardType,
        selectedSDK: selectedSDK,
        selectedToolchain: selectedToolchain,
        selectedNinja: selectedNinja,

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

      const radioButtons = document.querySelectorAll('input[name="pico-wireless-radio"]');

      // Disable all radio buttons
      Array.prototype.forEach.call(radioButtons, function (radioButton) {
        radioButton.disabled = !isPicoWireless;
      });

      // reset selection
      if (!isPicoWireless) {
        // Check the first radio button (none)
        radioButtons[0].checked = true;
      }
    });
  }
}());
