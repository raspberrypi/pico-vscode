class State {
  // data state properties
  projectName;
  projectLocation;
  boardType;
  selectedSDK;
  selectedToolchain;
  ninjaMode;
  // ninjaPath; setting the path of a file input is not supported
  ninjaVersion;
  cmakeMode;
  // cmakePath; setting the path of a file input is not supported
  cmakeVersion;
  uartStdioSupport;
  usbStdioSupport;
  spiFeature;
  pioFeature;
  i2cFeature;
  dmaFeature;
  hwwatchdogFeature;
  hwclocksFeature;
  hwinterpolationFeature;
  hwtimerFeature;
  picoWirelessSelection;
  runFromRamCodeGen;
  entryProjectNameCodeGen;
  cppCodeGen;
  cppRttiCodeGen;
  cppExceptionsCodeGen;
  selRiscv;
  debuggerSelection;
  useCMakeTools;

  // special ui only state
  uiShowAdvancedOptions;
  isImportProject;
  forceFromExample;
  manuallyFromExample;

  constructor() { }
}

function restoreState(state) {
  console.debug("[raspbery-pi-pico - new project panel - state] Restoring state from previous session");
  // load state
  if (state.projectName) {
    document.getElementById('inp-project-name').value = state.projectName;
  }
  // redundant, as this property is managed by the extension
  /*if (state.projectLocation) {
    document.getElementById('inp-project-location').value = state.projectLocation;
  }*/
  // TODO: currently must be restorted before board type because otherwise 
  // the change of board type would trigger the change listener sending version bundle message
  // this would undisable the pico2 board type and it does not get disabled again in the loading
  // So maybe restore the board type disable state after restoring the state to avaoid these conflicts
  if (state.selectedSDK) {
    document.getElementById('sel-pico-sdk').value = state.selectedSDK;
  }
  if (state.boardType) {
    document.getElementById('sel-board-type').value = state.boardType;
    // trigger change event to update the ui based on the selected board
    document.getElementById('sel-board-type').dispatchEvent(new Event('change'));
  }
  if (state.selectedToolchain) {
    document.getElementById('sel-toolchain').value = state.selectedToolchain;
  }
  if (state.ninjaVersion) {
    document.getElementById('sel-ninja').value = state.ninjaVersion;
  }
  if (state.cmakeVersion) {
    document.getElementById('sel-cmake').value = state.cmakeVersion;
  }

  /* setting the path of a file input is not supported
  if (state.ninjaPath !== undefined) {
    document.getElementById('ninja-path-executable').value = state.ninjaPath;
  }

  if (state.cmakePath !== undefined) {
    document.getElementById('cmake-path-executable').value = state.cmakePath;
  }
  */

  if (state.uartStdioSupport !== undefined) {
    document.getElementById('uart-stdio-support-cblist').checked = state.uartStdioSupport;
  }

  if (state.usbStdioSupport !== undefined) {
    document.getElementById('usb-stdio-support-cblist').checked = state.usbStdioSupport;
  }

  if (state.spiFeature !== undefined) {
    document.getElementById('spi-features-cblist').checked = state.spiFeature;
  }

  if (state.pioFeature !== undefined) {
    document.getElementById('pio-features-cblist').checked = state.pioFeature;
  }

  if (state.i2cFeature !== undefined) {
    document.getElementById('i2c-features-cblist').checked = state.i2cFeature;
  }

  if (state.dmaFeature !== undefined) {
    document.getElementById('dma-features-cblist').checked = state.dmaFeature;
  }

  if (state.hwwatchdogFeature !== undefined) {
    document.getElementById('hwwatchdog-features-cblist').checked = state.hwwatchdogFeature;
  }

  if (state.hwclocksFeature !== undefined) {
    document.getElementById('hwclocks-features-cblist').checked = state.hwclocksFeature;
  }

  if (state.hwinterpolationFeature !== undefined) {
    document.getElementById('hwinterpolation-features-cblist').checked = state.hwinterpolationFeature;
  }

  if (state.hwtimerFeature !== undefined) {
    document.getElementById('hwtimer-features-cblist').checked = state.hwtimerFeature;
  }

  if (state.runFromRamCodeGen !== undefined) {
    document.getElementById('run-from-ram-code-gen-cblist').checked = state.runFromRamCodeGen;
  }

  if (state.entryProjectNameCodeGen !== undefined) {
    document.getElementById('entry-project-name-code-gen-cblist').checked = state.entryProjectNameCodeGen;
  }

  if (state.cppCodeGen !== undefined) {
    document.getElementById('cpp-code-gen-cblist').checked = state.cppCodeGen;
  }

  if (state.cppRttiCodeGen !== undefined) {
    document.getElementById('cpp-rtti-code-gen-cblist').checked = state.cppRttiCodeGen;
  }

  if (state.cppExceptionsCodeGen !== undefined) {
    document.getElementById('cpp-exceptions-code-gen-cblist').checked = state.cppExceptionsCodeGen;
  }

  if (state.picoWirelessSelection !== undefined) {
    document.getElementById('pico-wireless-radio-none').checked = state.picoWirelessSelection == 0;
    document.getElementById('pico-wireless-radio-led').checked = state.picoWirelessSelection == 1;
    document.getElementById('pico-wireless-radio-pool').checked = state.picoWirelessSelection == 2;
    document.getElementById('pico-wireless-radio-background').checked = state.picoWirelessSelection == 3;
  }
  // instead of setting debug-probe if selection is undefined or 0, 
  // first check so the default can be controlled in the html
  if (state.debuggerSelection !== undefined) {
    document.getElementById('debugger-radio-debug-probe').checked = state.debuggerSelection == 0;
    document.getElementById('debugger-radio-swd').checked = state.debuggerSelection == 1;
  }

  if (state.useCMakeTools !== undefined) {
    document.getElementById('use-cmake-tools-cb').checked = state.useCMakeTools;
  }

  // instead of setting ninja-radio-default-version if selection is undefined or 0, 
  // first check so the default can be controlled in the html 
  if (state.ninjaMode !== undefined) {
    const ninjaDefaultVersionRadio = document.getElementById('ninja-radio-default-version');
    if (ninjaDefaultVersionRadio) {
      ninjaDefaultVersionRadio.checked = state.ninjaMode == 0;
    }
    const ninjaSystemVersionRadio = document.getElementById('ninja-radio-system-version');
    // not available in the DOM is system ninja is not available
    if (ninjaSystemVersionRadio) {
      ninjaSystemVersionRadio.checked = state.ninjaMode == 1;
    }
    document.getElementById('ninja-radio-select-version').checked = state.ninjaMode == 2;
    document.getElementById('ninja-radio-path-executable').checked = state.ninjaMode == 3;
  }

  if (state.cmakeMode !== undefined) {
    const cmakeDefaultVersionRadio = document.getElementById('cmake-radio-default-version');
    if (cmakeDefaultVersionRadio) {
      cmakeDefaultVersionRadio.checked = state.cmakeMode == 0;
    }
    const cmakeSystemVersionRadio = document.getElementById('cmake-radio-system-version');
    // not available in the DOM is system cmake is not available
    if (cmakeSystemVersionRadio) {
      cmakeSystemVersionRadio.checked = state.cmakeMode == 1;
    }
    document.getElementById('cmake-radio-select-version').checked = state.cmakeMode == 2;
    document.getElementById('cmake-radio-path-executable').checked = state.cmakeMode == 3;
  }

  if (state.selRiscv !== undefined) {
    const selRiscv = document.getElementById('sel-riscv');
    if (selRiscv) {
      selRiscv.checked = state.selRiscv;
    }
  }

  // ui state
  if (state.uiShowAdvancedOptions) {
    document.getElementById('btn-advanced-options').click();
  }
  if (!forceCreateFromExample && !doProjectImport && state.manuallyFromExample) {
    console.debug("[raspbery-pi-pico - new project panel - state] Manually triggering create from example");

    // will crash the webview to set it on disable and click create from example
    /*const pni = document.getElementById('inp-project-name');
    if (pni) {
      // disable it for user input
      //pni.disabled = true;
    }*/
    setTimeout(() => {
      document.getElementById('btn-create-from-example').click();
      // now reenter the name like a user so on keyup event is triggered at the end
      const pni = document.getElementById('inp-project-name');
      if (pni) {
        //pni.disabled = false;
        pni.value = state.projectName;
        if (state.projectName.length > 0) {
          const key = state.projectName[0];
          const keyUpEvent = new KeyboardEvent('keyup', { key: key, code: `Key${key.toUpperCase()}`, bubbles: true });
          pni.dispatchEvent(keyUpEvent);
          // send enter key down event
          const enterKeyEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
          pni.dispatchEvent(enterKeyEvent);
        }
      }
    }, 1500);
  }
}

function setupStateSystem(vscode) {
  document.addEventListener('DOMContentLoaded', function () {
    const oldState = vscode.getState();
    const oldStateIsImportProject = oldState && oldState.isImportProject;
    const oldStateForceFromExample = oldState && oldState.forceFromExample;
    const state = oldState || new State();
    state.isImportProject = doProjectImport;
    state.forceFromExample = forceCreateFromExample;

    // restore state
    if (oldState !== null) {
      restoreState(state);
    }

    if (((state.forceFromExample || state.isImportProject) && oldState === null)
      || (oldState !== null && oldStateIsImportProject !== state.isImportProject)
      || (oldState !== null && oldStateForceFromExample !== state.forceFromExample)) {
      // call set state
      vscode.setState(state);
    }

    if (!state.forceFromExample && !state.isImportProject) {
      document.getElementById("btn-create-from-example").addEventListener("click", function () {
        state.manuallyFromExample = true;
        vscode.setState(state);
      });
    }

    // add on change event to all inputs to save state
    document.querySelectorAll('input[type="text"]').forEach(input => {
      input.addEventListener('change', function () {
        const id = input.id;
        switch (id) {
          case "inp-project-name":
            state.projectName = input.value;
            break;
          // redundant, as this property is managed by the extension
          /*case "inp-project-location":
            state.projectLocation = input.value;
            break;*/
        }
        vscode.setState(state);
      });
    });
    // add on change event to all selects to save state
    document.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', function () {
        switch (select.id) {
          case "sel-board-type":
            state.boardType = select.value;
            break;
          case "sel-pico-sdk":
            state.selectedSDK = select.value;
            break;
          case "sel-toolchain":
            state.selectedToolchain = select.value;
            break;
          case "sel-ninja":
            state.ninjaVersion = select.value;
            break;
          case "sel-cmake":
            state.cmakeVersion = select.value;
            break;
        }
        vscode.setState(state);
      });
    });
    // add to radio buttons
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', function () {
        switch (radio.name) {
          case "ninja-version-radio":
            switch (radio.id) {
              case "ninja-radio-default-version":
                state.ninjaMode = parseInt(radio.value);
                break;
              case "ninja-radio-system-version":
                state.ninjaMode = parseInt(radio.value);
                break;
              case "ninja-radio-select-version":
                state.ninjaMode = parseInt(radio.value);
                break;
              case "ninja-radio-path-executable":
                state.ninjaMode = parseInt(radio.value);
                break;
            }
            break;
          case "cmake-version-radio":
            switch (radio.id) {
              case "cmake-radio-default-version":
                state.cmakeMode = parseInt(radio.value);
                break;
              case "cmake-radio-system-version":
                state.cmakeMode = parseInt(radio.value);
                break;
              case "cmake-radio-select-version":
                state.cmakeMode = parseInt(radio.value);
                break;
              case "cmake-radio-path-executable":
                state.cmakeMode = parseInt(radio.value);
                break;
            }
            break;
          case "pico-wireless-radio":
            switch (radio.id) {
              case "pico-wireless-radio-none":
                state.picoWirelessSelection = parseInt(radio.value);
                break;
              case "pico-wireless-radio-led":
                state.picoWirelessSelection = parseInt(radio.value);
                break;
              case "pico-wireless-radio-pool":
                state.picoWirelessSelection = parseInt(radio.value);
                break;
              case "pico-wireless-radio-background":
                state.picoWirelessSelection = parseInt(radio.value);
                break;
            }
            break;
          case "debugger-radio":
            switch (radio.id) {
              case "debugger-radio-debug-probe":
                state.debuggerSelection = parseInt(radio.value);
                break;
              case "debugger-radio-swd":
                state.debuggerSelection = parseInt(radio.value);
                break;
            }
            break;
        }
        vscode.setState(state);
      });
    });
    // add on change event to all checkboxes to save state
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', function () {
        switch (checkbox.id) {
          case "spi-features-cblist":
            state.spiFeature = checkbox.checked;
            break;
          case "pio-features-cblist":
            state.pioFeature = checkbox.checked;
            break;
          case "i2c-features-cblist":
            state.i2cFeature = checkbox.checked;
            break;
          case "dma-features-cblist":
            state.dmaFeature = checkbox.checked;
            break;
          case "hwwatchdog-features-cblist":
            state.hwwatchdogFeature = checkbox.checked;
            break;
          case "hwclocks-features-cblist":
            state.hwclocksFeature = checkbox.checked;
            break;
          case "hwinterpolation-features-cblist":
            state.hwinterpolationFeature = checkbox.checked;
            break;
          case "hwtimer-features-cblist":
            state.hwtimerFeature = checkbox.checked;
            break;
          case "uart-stdio-support-cblist":
            state.uartStdioSupport = checkbox.checked;
            break;
          case "usb-stdio-support-cblist":
            state.usbStdioSupport = checkbox.checked;
            break;
          case "run-from-ram-code-gen-cblist":
            state.runFromRamCodeGen = checkbox.checked;
            break;
          case "entry-project-name-code-gen-cblist":
            state.entryProjectNameCodeGen = checkbox.checked;
            break;
          case "cpp-code-gen-cblist":
            state.cppCodeGen = checkbox.checked;
            break;
          case "cpp-rtti-code-gen-cblist":
            state.cppRttiCodeGen = checkbox.checked;
            break;
          case "cpp-exceptions-code-gen-cblist":
            state.cppExceptionsCodeGen = checkbox.checked;
            break;
          case "sel-riscv":
            state.selRiscv = checkbox.checked;
            break;
          case "use-cmake-tools-cb":
            state.useCMakeTools = checkbox.checked;
            break;
        }

        vscode.setState(state);
      });
    });

    /* setting the path of a file input is not supported
    document.querySelectorAll('input[type="file"]').forEach(file => {
      file.addEventListener('change', function () {
        switch (file.id) {
          case "ninja-path-executable":
            state.ninjaPath = file.files[0].name;
            break;
          case "cmake-path-executable":
            state.cmakePath = file.files[0].name;
            break;
        }
  
        vscode.setState(state);
      });
    });
    */

    // ui only state watch
    document.getElementById('btn-advanced-options').addEventListener('click', function () {
      // TODO: maybe synchronize with the advanced options value expected in main.js
      state.uiShowAdvancedOptions = state.uiShowAdvancedOptions === undefined ? true : !state.uiShowAdvancedOptions;
      vscode.setState(state);
    });
  });
}

// export { setupStateSystem, State };
