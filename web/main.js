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
const CMD_TEST_CREATE_PROJECT = 'testCreateProject';

var submitted = false;
var isPicoWireless = false;
var exampleSupportedBoards = [];

(function () {
  const vscode = acquireVsCodeApi();

  // CMake version selection handling
  {
    const modeEl = document.getElementById('cmake-mode');
    const defaultRow = document.getElementById('cmake-secondary-default');
    const systemRow = document.getElementById('cmake-secondary-system');
    const selectRow = document.getElementById('cmake-secondary-select');
    const customRow = document.getElementById('cmake-secondary-custom');

    const fileInput = document.getElementById('cmake-path-executable');
    const fileLabel = document.getElementById('cmake-file-label');
    const fileBox = document.getElementById('cmake-filebox');

    // Update label text when a file is chosen
    fileInput?.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileLabel.textContent = f ? f.name : 'No file selected';
    });

    // Make label keyboard-activatable (Enter/Space)
    fileBox?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });

    function toggleSection(el, show) {
      if (!el) return;
      el.classList.toggle('hidden', !show);
      el.querySelectorAll('input, select, button, textarea').forEach(ctrl => {
        ctrl.disabled = !show;
        ctrl.tabIndex = show ? 0 : -1;
      });
      // If this is the custom row, also toggle the label interactivity
      const label = el.querySelector('#cmake-filebox');
      if (label) {
        label.setAttribute('aria-disabled', String(!show));
        label.classList.toggle('pointer-events-none', !show);
        label.classList.toggle('opacity-60', !show);
      }
    }

    function setMode(mode) {
      toggleSection(defaultRow, mode === 'default');
      toggleSection(systemRow, mode === 'system');
      toggleSection(selectRow, mode === 'select');
      toggleSection(customRow, mode === 'custom');
    }

    // TODO: add state saving/loading via state.js
    // modeEl.value = window.savedCmakeMode ?? modeEl.value;

    modeEl.addEventListener('change', e => setMode(e.target.value));
    setMode(modeEl.value);
  }

  // Ninja version selection handling
  {
    const modeEl = document.getElementById('ninja-mode');
    const defaultRow = document.getElementById('ninja-secondary-default');
    const systemRow = document.getElementById('ninja-secondary-system');
    const selectRow = document.getElementById('ninja-secondary-select');
    const customRow = document.getElementById('ninja-secondary-custom');

    const fileInput = document.getElementById('ninja-path-executable');
    const fileLabel = document.getElementById('ninja-file-label');
    const fileBox = document.getElementById('ninja-filebox');

    // Update label text when a file is chosen
    fileInput?.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileLabel.textContent = f ? f.name : 'No file selected';
    });

    // Make label keyboard-activatable (Enter/Space)
    fileBox?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });

    function toggleSection(el, show) {
      if (!el) return;
      el.classList.toggle('hidden', !show);
      el.querySelectorAll('input, select, button, textarea').forEach(ctrl => {
        ctrl.disabled = !show;
        ctrl.tabIndex = show ? 0 : -1;
      });
      // If this is the custom row, also toggle the label interactivity
      const label = el.querySelector('#ninja-filebox');
      if (label) {
        label.setAttribute('aria-disabled', String(!show));
        label.classList.toggle('pointer-events-none', !show);
        label.classList.toggle('opacity-60', !show);
      }
    }

    function setMode(mode) {
      toggleSection(defaultRow, mode === 'default');
      toggleSection(systemRow, mode === 'system');
      toggleSection(selectRow, mode === 'select');
      toggleSection(customRow, mode === 'custom');
    }

    // TODO: add state saving/loading via state.js
    // modeEl.value = window.savedNinjaMode ?? modeEl.value;

    modeEl.addEventListener('change', e => setMode(e.target.value));
    setMode(modeEl.value);
  }

  // setup state for webview implemented in state.js
  setupStateSystem(vscode);

  // needed so a element isn't hidden behind the navbar on scroll
  const navbarOffsetHeight = document.getElementById('top-navbar').offsetHeight;

  // returns true if project name input is valid
  function projectNameFormValidation(projectNameElement) {
    // TODO: put into helper function
    const createFromExampleBtn = document.getElementById('btn-create-from-example');
    const isExampleMode = createFromExampleBtn ? createFromExampleBtn.getAttribute('data-example-mode') === 'true' : true;
    if (isExampleMode) {
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
    // selected picotool
    const selectedPicotool = document.getElementById('sel-picotool').value;

    // TODO: maybe move these duplicate sections for ninja and cmake into a generic helper function

    // --- Ninja: collect values from the new controls ---
    let ninjaMode = null;      // numeric contract: 0..4
    let ninjaPath = null;
    let ninjaVersion = null;   // string | null

    const ninjaModeSel = document.getElementById('ninja-mode');
    const selNinja = document.getElementById('sel-ninja');                    // shown in "select" mode
    const ninjaFileInp = document.getElementById('ninja-path-executable');    // shown in "custom" mode

    // Fallback to "custom" as it should be always available
    const ninjaModeStr = (ninjaModeSel?.value || 'custom');

    // Map string modes -> numeric API
    // 0 = default bundle, 1 = system, 2 = select version, 3 = custom path
    switch (ninjaModeStr) {
      case 'default': ninjaMode = 0; break;
      case 'system': ninjaMode = 1; break;
      case 'select': ninjaMode = 2; break;
      case 'custom': ninjaMode = 3; break;
      default:
        console.debug('Invalid ninja mode string: ' + ninjaModeStr);
        vscode.postMessage({
          command: CMD_ERROR,
          value: `Please select a valid Ninja mode (got: ${ninjaModeModeStr}).`
        });
        submitted = false;
        return;
    }

    if (ninjaMode === 2) {
      ninjaVersion = selNinja.value;
    } else if (ninjaMode == 3) {
      const files = ninjaFileInp.files;

      if (files.length === 1) {
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

    // --- CMake: collect values from the new controls ---
    let cmakeMode = null;      // numeric contract: 0..4
    let cmakePath = null;      // string | null
    let cmakeVersion = null;   // string | null

    const cmakeModeSel = document.getElementById('cmake-mode');
    const selCmake = document.getElementById('sel-cmake');                    // shown in "select" mode
    const cmakeFileInp = document.getElementById('cmake-path-executable');    // shown in "custom" mode

    // Fallback to "latest" if the select isn't there for some reason
    const cmakeModeStr = (cmakeModeSel?.value || 'default');

    // Map string modes -> numeric API
    // 0 = default bundle, 1 = system, 2 = select version, 3 = custom path
    switch (cmakeModeStr) {
      case 'default': cmakeMode = 0; break;
      case 'system': cmakeMode = 1; break;
      case 'select': cmakeMode = 2; break;
      case 'custom': cmakeMode = 3; break;
      default:
        console.debug('Invalid cmake mode string: ' + cmakeModeStr);
        vscode.postMessage({
          command: CMD_ERROR,
          value: `Please select a valid CMake mode (got: ${cmakeModeStr}).`
        });
        submitted = false;
        return;
    }

    if (cmakeMode === 2) {
      cmakeVersion = selCmake.value;
    } else if (cmakeMode == 3) {
      const files = cmakeFileInp.files;

      if (files.length === 1) {
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
    const useCmakeTools = document.getElementById('use-cmake-tools-cb').checked;

    if (doProjectImport) {
      vscode.postMessage({
        command: CMD_IMPORT_PROJECT,
        value: {
          selectedSDK: selectedSDK,
          selectedToolchain: selectedToolchain,
          selectedPicotool: selectedPicotool,
          ninjaMode: Number(ninjaMode),
          ninjaPath: ninjaPath,
          ninjaVersion: ninjaVersion,
          cmakeMode: Number(cmakeMode),
          cmakePath: cmakePath,
          cmakeVersion: cmakeVersion,

          // debugger selection
          debugger: 0,
          useCmakeTools
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
          selectedPicotool: selectedPicotool,
          ninjaMode: Number(ninjaMode),
          ninjaPath: ninjaPath,
          ninjaVersion: ninjaVersion,
          cmakeMode: Number(cmakeMode),
          cmakePath: cmakePath,
          cmakeVersion: cmakeVersion,

          // debugger selection
          debugger: debuggerSelection,
          useCmakeTools
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
    const uartFeature = document.getElementById('uart-example-features-cblist').checked;
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
    const runFromRAMCodeGen = document.getElementById('run-from-ram-code-gen-cblist').checked;
    const nameEntryPointProjectName = document.getElementById('entry-project-name-code-gen-cblist').checked;
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
        selectedPicotool: selectedPicotool,
        ninjaMode: Number(ninjaMode),
        ninjaPath: ninjaPath,
        ninjaVersion: ninjaVersion,
        cmakeMode: Number(cmakeMode),
        cmakePath: cmakePath,
        cmakeVersion: cmakeVersion,

        // features
        spiFeature: spiFeature,
        pioFeature: pioFeature,
        i2cFeature: i2cFeature,
        dmaFeature: dmaFeature,
        addUartExample: uartFeature,
        hwwatchdogFeature: hwwatchdogFeature,
        hwclocksFeature: hwclocksFeature,
        hwinterpolationFeature: hwinterpolationFeature,
        hwtimerFeature: hwtimerFeature,

        // stdio support
        uartStdioSupport: uartStdioSupport,
        usbStdioSupport: usbStdioSupport,

        picoWireless: picoWireless,

        // code-gen options
        runFromRAM: runFromRAMCodeGen,
        entryPointProjectName: nameEntryPointProjectName,
        cpp: cppCodeGen,
        cppRtti: cppRttiCodeGen,
        cppExceptions: cppExceptionsCodeGen,

        // debugger selection
        debugger: debuggerSelection,
        useCmakeTools
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
        console.log("[raspberry-pi-pico] Set theme mode to:", message.theme);

        // get riscv image
        const riscvIcon = document.getElementById('riscvIcon');

        // update UI
        if (message.theme == "dark") {
          // explicitly choose dark mode
          localStorage.theme = 'dark'
          document.body.classList.add('dark')
          if (riscvIcon) {
            // riscv toggle button concept
            /*if (riscvIcon.getAttribute('data-selected') === 'false') {
              riscvIcon.src = riscvWhiteSvgUri;
            } else {
              riscvIcon.src = riscvWhiteYellowSvgUri;
            }*/
            // set riscv icon variant to white
            riscvIcon.src = riscvWhiteSvgUri;
          }
        } else if (message.theme == "light") {
          document.body.classList.remove('dark')
          // explicitly choose light mode
          localStorage.theme = 'light'
          if (riscvIcon) {
            // riscv toggle button concept
            /*if (riscvIcon.getAttribute('data-selected') === 'false') {
              riscvIcon.src = riscvBlackSvgUri;
            } else {
              riscvIcon.src = riscvColorSvgUri;
            }*/
            // set riscv icon variant to black
            riscvIcon.src = riscvBlackSvgUri;
          }
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
          const toolchainSelector = document.getElementById("sel-toolchain");
          const useRiscv = document.getElementsByClassName('use-riscv');
          let selectedIndex = getIndexByValue(toolchainSelector, result.toolchainVersion);
          const optionBoardTypePico2 = document.getElementById("option-board-type-pico2");
          const optionBoardTypePico2W = document.getElementById("option-board-type-pico2_w");

          if (result.riscvToolchainVersion === "NONE") {
            if (optionBoardTypePico2) {
              optionBoardTypePico2.disabled = true
            }
            if (optionBoardTypePico2W) {
              optionBoardTypePico2W.disabled = true
            }
            const boardTypeSelector = document.getElementById('sel-board-type');

            if (boardTypeSelector && boardTypeSelector.value.includes("pico2")) {
              // first element could be hidden
              //document.getElementById('sel-board-type').selectedIndex = 0;

              // select first not hidden option
              for (let i = 0; i < boardTypeSelector.options.length; i++) {
                const option = boardTypeSelector.options[i];

                // Check if the option is not hidden
                if (option.style.display !== 'none' && option.hidden === false && option.disabled === false) {
                  boardTypeSelector.selectedIndex = i;
                  // Create a new change event
                  const event = new CustomEvent('change', { bubbles: true, detail: { doNotFireEvents: true } });
                  // Dispatch the event to trigger the change handler
                  boardTypeSelector.dispatchEvent(event);
                  break;
                }
              }
            }
          } else {
            if (optionBoardTypePico2 && (exampleSupportedBoards.length === 0 || exampleSupportedBoards.includes("pico2"))) {
              optionBoardTypePico2.disabled = false;
            }
            if (optionBoardTypePico2W && (exampleSupportedBoards.length === 0 || exampleSupportedBoards.includes("pico2_w"))) {
              optionBoardTypePico2W.disabled = false;
            }
          }

          if (!doProjectImport) {
            const board = document.getElementById('sel-board-type').value;
            const riscvSelected = document.getElementById('sel-riscv').checked;

            const riscvBoards = ["pico2", "pico2_w"]
            if (!riscvBoards.includes(board)) {
              // ui update to account for hidden elements
              const boardTypeRiscvGrid = document.getElementById("board-type-riscv-grid");
              // remove grid-cols-2 class
              boardTypeRiscvGrid.classList.remove("grid-cols-2");

              // hide elements
              for (let i = 0; i < useRiscv.length; i++) {
                useRiscv[i].hidden = true;
              }
            } else {
              // ui update to account for next unhidden elements
              const boardTypeRiscvGrid = document.getElementById("board-type-riscv-grid");
              // add grid-cols-2 class
              boardTypeRiscvGrid.classList.add("grid-cols-2");

              // show elements again
              for (let i = 0; i < useRiscv.length; i++) {
                useRiscv[i].hidden = false;
              }
              if (riscvSelected) {
                selectedIndex = getIndexByValue(toolchainSelector, result.riscvToolchainVersion);
              }
            }
          }

          if (selectedIndex !== -1) {
            toolchainSelector.selectedIndex = selectedIndex;
            // Create a new change event
            const event = new CustomEvent('change', { bubbles: true, detail: { doNotFireEvents: true } });
            // Dispatch the event to trigger the change handler
            toolchainSelector.dispatchEvent(event);
            console.debug("[raspberry-pi-pico] Updated selected toolchain with new default value", toolchainSelector.options[selectedIndex].value);
          } else {
            console.error("[raspberry-pi-pico] Could not find default toolchain version in versionBundle response!");
          }
        }

        if (result.result && "picotoolVersion" in result) {
          const picotoolSelector = document.getElementById("sel-picotool");
          const selectedIndex = getIndexByValue(picotoolSelector, result.picotoolVersion);

          if (selectedIndex !== -1) {
            picotoolSelector.selectedIndex = selectedIndex;
            // Create a new change event
            const event = new CustomEvent('change', { bubbles: true, detail: { doNotFireEvents: true } });
            // Dispatch the event to trigger the change handler
            picotoolSelector.dispatchEvent(event);
            console.debug("[raspberry-pi-pico] Updated selected picotool with new default value", picotoolSelector.options[selectedIndex].value);
          } else {
            console.error("[raspberry-pi-pico] Could not find default picotool version in versionBundle response!");
          }
        }

        // get all radio buttons with the specified names and select the first non-disabled option for each if the currently selected option is disabled
        // TODO: move in a helper function
        const ninjaRadioButtons = document.querySelectorAll('input[name="ninja-version-radio"]');
        const cmakeRadioButtons = document.querySelectorAll('input[name="cmake-version-radio"]');

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
      case CMD_TEST_CREATE_PROJECT:
        console.log("testCreateProject", message.value);
        if (message.value.cmakeTools !== undefined) {
          document.getElementById('use-cmake-tools-cb').checked = message.value.cmakeTools;
        }
        if (message.value.name) {
          document.getElementById('inp-project-name').value = message.value.name;
          document.getElementById('inp-project-name').dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (message.value.board) {
          const boardSels = document.querySelectorAll('[id^="option-board-type-"]');
          boardSels.forEach(e => { e.disabled = true });

          console.debug(`[raspberry-pi-pico - new pico project from example] Only enabling ${message.value.board}`);
          const option = document.getElementById(`option-board-type-${message.value.board}`);
          if (option) {
            option.disabled = false;
          }

          const boardTypeSelector = document.getElementById('sel-board-type');

          if (boardTypeSelector) {
            // first element could be hidden
            //document.getElementById('sel-board-type').selectedIndex = 0;

            // select first not hidden option
            for (let i = 0; i < boardTypeSelector.options.length; i++) {
              const option = boardTypeSelector.options[i];

              // Check if the option is not hidden
              if (option.style.display !== 'none' && option.hidden === false && option.disabled === false) {
                boardTypeSelector.selectedIndex = i;
                // Create a new change event
                const event = new CustomEvent('change', { bubbles: true, detail: { doNotFireEvents: false } });
                // Dispatch the event to trigger the change handler
                boardTypeSelector.dispatchEvent(event);
                break;
              }
            }
          }
        }
        document.getElementById('btn-create').click();
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

        const createFromExampleBtn = document.getElementById('btn-create-from-example');
        const isExampleMode = createFromExampleBtn ? createFromExampleBtn.getAttribute('data-example-mode') === 'true' : true;

        if (!isExampleMode) {
          // hide pico wireless nav item
          document.getElementById('nav-pico-wireless').classList.toggle('hidden', !isPicoWireless);
          // hide pico wireless section
          document.getElementById('section-pico-wireless').hidden = !isPicoWireless;

          // reset selection
          if (!isPicoWireless) {
            // Check the first radio button (none)
            document.querySelectorAll('input[name="pico-wireless-radio"]')[0].checked = true;
          }
        }

        // leave event empty to not retrigger cmd version bundle available test
        if (!event.detail || !event.detail.doNotFireEvents) {
          const sdkVersion = document.getElementById('sel-pico-sdk').value;
          // send message to extension
          vscode.postMessage({
            command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
            value: sdkVersion.replace("v", "")
          });
        }
      } catch (error) {
        console.error("[raspberry-pi-pico - new pico project] Error while changing board type", error);
      }
    });
  }
  document.getElementById('sel-pico-sdk').addEventListener('change', function (event) {
    if (event.detail && event.detail.doNotFireEvents) {
      return;
    }
    const sdkVersion = document.getElementById('sel-pico-sdk').value;
    // send message to extension
    vscode.postMessage({
      command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
      value: sdkVersion.replace("v", "")
    });
  });
  // used for riscv toggle button concept, also requires changes in the setTheme command receiver
  /*document.getElementById('riscvToggle').addEventListener('click', function () {
    const riscvIcon = document.getElementById('riscvIcon');
    const isSelected = riscvIcon.getAttribute('data-selected') === 'true';

    if (isSelected) {
      // Unselect (switch to black or white in dark mode)
      if (localStorage.theme === "dark") {
        riscvIcon.src = riscvWhiteSvgUri; // Dark mode
      } else {
        riscvIcon.src = riscvBlackSvgUri; // Light mode
      }
      riscvIcon.setAttribute('data-selected', 'false');
    } else {
      // Select (switch to color)
      if (localStorage.theme === "dark") {
        riscvIcon.src = riscvWhiteYellowSvgUri; // Dark mode
      } else {
        riscvIcon.src = riscvColorSvgUri; // Light mode
      }
      riscvIcon.setAttribute('data-selected', 'true');
    }
  });*/

  const selRiscV = document.getElementById('sel-riscv');
  if (selRiscV) {
    selRiscV.addEventListener('change', function (event) {
      if (event.detail && event.detail.doNotFireEvents) {
        return;
      }
      const sdkVersion = document.getElementById('sel-pico-sdk').value;
      // send message to extension
      vscode.postMessage({
        command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
        value: sdkVersion.replace("v", "")
      });
    });
  }

  const projectNameInput = document.getElementById('inp-project-name');
  if (projectNameInput) {
    projectNameInput.addEventListener('input', function () {
      if (typeof examples === 'undefined') {
        return;
      }
      const projName = document.getElementById('inp-project-name').value;

      if (!(Object.keys(examples).includes(projName))) {
        // TODO: maybe clear exampleSupportedBoards
        return;
      }
      console.debug("[raspberry-pi-pico - new pico project form example] Example selected:" + projName);

      // update available boards
      const example = examples[projName];
      exampleSupportedBoards = example.boards;
      const boardSels = document.querySelectorAll('[id^="option-board-type-"]');
      boardSels.forEach(e => { e.disabled = true });
      for (const board of exampleSupportedBoards) {
        console.debug(`[raspberry-pi-pico - new pico project from example] Example ${projName} supports ${board}`);
        const option = document.getElementById(`option-board-type-${board}`);
        if (option) {
          option.disabled = false;
        }
      }
      const boardTypeSelector = document.getElementById('sel-board-type');

      if (boardTypeSelector && !exampleSupportedBoards.includes(boardTypeSelector.value)) {
        // first element could be hidden
        //document.getElementById('sel-board-type').selectedIndex = 0;

        // select first not hidden option
        for (let i = 0; i < boardTypeSelector.options.length; i++) {
          const option = boardTypeSelector.options[i];

          // Check if the option is not hidden
          if (option.style.display !== 'none' && option.hidden === false && option.disabled === false) {
            boardTypeSelector.selectedIndex = i;
            // Create a new change event
            const event = new CustomEvent('change', { bubbles: true, detail: { doNotFireEvents: false } });
            // Dispatch the event to trigger the change handler
            boardTypeSelector.dispatchEvent(event);
            break;
          }
        }
      }
    });
  }

  const ninjaVersionRadio = document.getElementsByName('ninja-version-radio');
  if (ninjaVersionRadio.length > 0)
    ninjaVersionRadio[0].checked = true;
  const cmakeVersionRadio = document.getElementsByName('cmake-version-radio');
  if (cmakeVersionRadio.length > 0)
    cmakeVersionRadio[0].checked = true;

  const sdkVersion = document.getElementById('sel-pico-sdk').value;
  // send message to extension
  vscode.postMessage({
    command: CMD_VERSION_BUNDLE_AVAILABLE_TEST,
    value: sdkVersion.replace("v", "")
  });
}());
