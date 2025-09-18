"use strict";

const CMD_CHANGE_LOCATION = "changeLocation";
const CMD_SUBMIT = "submit";
const CMD_CANCEL = "cancel";
const CMD_SET_THEME = "setTheme";
const CMD_ERROR = "error";
const CMD_SUBMIT_DENIED = "submitDenied";

var submitted = false;
var previousTemplate = "simple";
var previousGpioState = false;

(function () {
  const vscode = acquireVsCodeApi();

  // CMake version selection handling
  {
    const modeEl = document.getElementById('cmake-mode');
    const systemRow = document.getElementById('cmake-secondary-system');
    const latestRow = document.getElementById('cmake-secondary-latest');
    const selectRow = document.getElementById('cmake-secondary-select');
    const customRow = document.getElementById('cmake-secondary-custom');

    const fileInput = document.getElementById('cmake-path-executable');
    const fileLabel = document.getElementById('cmake-file-label');
    const fileBox = document.getElementById('cmake-filebox');

    // Optional: show the exact latest version, if you have it
    const latestValEl = document.getElementById('cmake-latest-val');
    if (latestValEl && typeof window.latestCmakeVersion === 'string') {
      latestValEl.textContent = `: ${window.latestCmakeVersion}`;
    }

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

    // In your toggleSection(), also reflect disabled state on the label
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
      toggleSection(systemRow, mode === 'system');
      toggleSection(latestRow, mode === 'latest' || mode === 'default');
      toggleSection(selectRow, mode === 'select');
      toggleSection(customRow, mode === 'custom');
    }

    // TODO: add state saving/loading via state.js
    // modeEl.value = window.savedCmakeMode ?? modeEl.value;

    modeEl.addEventListener('change', e => setMode(e.target.value));
    setMode(modeEl.value);
  }

  {
    const templateSelector = document.getElementById("sel-template");
    const gpioCheckbox = document.getElementById("gpio-features-cblist");
    if (templateSelector) {
      templateSelector.addEventListener("change", function (event) {
        try {
          const template = templateSelector.value;

          if (gpioCheckbox) {
            if (template === "blinky") {
              previousGpioState = gpioCheckbox.checked;
              gpioCheckbox.checked = true;
              gpioCheckbox.disabled = true;
            } else if (previousTemplate === "blinky") {
              gpioCheckbox.checked = previousGpioState;
              gpioCheckbox.disabled = false;
            }
          }

          previousTemplate = template;
        } catch (error) {
          console.error("[raspberry-pi-pico - new zephyr pico project] Error handling template change:", error);
        }
      });
    }
  }

  // needed so a element isn't hidden behind the navbar on scroll
  const navbarOffsetHeight = document.getElementById("top-navbar").offsetHeight;

  // returns true if project name input is valid
  function projectNameFormValidation(projectNameElement) {
    if (typeof examples !== "undefined") {
      return true;
    }

    const projectNameError = document.getElementById("inp-project-name-error");
    const projectName = projectNameElement.value;

    var invalidChars = /[\/:*?"<>| ]/;
    // check for reserved names in Windows
    var reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
    if (
      projectName.trim().length == 0 ||
      invalidChars.test(projectName) ||
      reservedNames.test(projectName)
    ) {
      projectNameError.hidden = false;
      //projectNameElement.scrollIntoView({ behavior: "smooth" });
      window.scrollTo({
        top: projectNameElement.offsetTop - navbarOffsetHeight,
        behavior: "smooth",
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
      value: null,
    });
  };

  window.cancelBtnClick = () => {
    // close webview
    vscode.postMessage({
      command: CMD_CANCEL,
      value: null,
    });
  };

  window.submitBtnClick = () => {
    // get all values of inputs
    const projectNameElement = document.getElementById("inp-project-name");

    const projectName = projectNameElement.value;
    if (
      projectName !== undefined &&
      !projectNameFormValidation(projectNameElement)
    ) {
      submitted = false;
      return;
    }

    // selected python version
    const pythonVersionRadio = document.getElementsByName(
      "python-version-radio"
    );
    let pythonMode = null;
    let pythonPath = null;
    for (let i = 0; i < pythonVersionRadio.length; i++) {
      if (pythonVersionRadio[i].checked) {
        pythonMode = Number(pythonVersionRadio[i].value);
        break;
      }
    }
    if (pythonVersionRadio.length == 0) {
      // default to python mode 0 == python ext version
      pythonMode = 0;
    }

    // if python version is null or not a number, smaller than 0 or bigger than 3, set it to 0
    if (
      pythonMode === null ||
      isNaN(pythonMode) ||
      pythonMode < 0 ||
      pythonMode > 3
    ) {
      pythonMode = 0;
      console.debug("Invalid python version value: " + pythonMode.toString());
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select a valid python version.",
      });
      submitted = false;

      return;
    }

    // if (pythonMode === 0) {
    //   const pyenvKnownSel = document.getElementById("sel-pyenv-known");
    //   pythonPath = pyenvKnownSel.value;
    // } else if (pythonMode === 2) {
    //   const files = document.getElementById("python-path-executable").files;

    //   if (files.length == 1) {
    //     pythonPath = files[0].name;
    //   } else {
    //     console.debug("Please select a valid python executable file");
    //     vscode.postMessage({
    //       command: CMD_ERROR,
    //       value: "Please select a valid python executable file.",
    //     });
    //     submitted = false;

    //     return;
    //   }
    // }

    // Get console mode
    const consoleRadio = document.getElementsByName("console-radio");
    let consoleSelection = null;
    for (let i = 0; i < consoleRadio.length; i++) {
      if (consoleRadio[i].checked) {
        consoleSelection = consoleRadio[i].value;

        break;
      }
    }

    if (
      consoleSelection === null ||
      !(consoleSelection === "UART" || consoleSelection === "USB")
    ) {
      consoleSelection = 0;
      console.debug("Invalid console selection value: " + consoleSelection);
      vscode.postMessage({
        command: CMD_ERROR,
        value: `Please select a valid console, got: ${consoleSelection}`,
      });
      submitted = false;
      return;
    }

    const spiFeature = document.getElementById("spi-features-cblist").checked;
    const i2cFeature = document.getElementById("i2c-features-cblist").checked;
    const gpioFeature = document.getElementById("gpio-features-cblist").checked;
    const wifiFeature = document.getElementById("wifi-features-cblist").checked;
    const sensorFeature = document.getElementById(
      "sensor-features-cblist"
    ).checked;
    const shellFeature = document.getElementById(
      "shell-features-cblist"
    ).checked;

    // --- CMake: collect values from the new controls ---
    let cmakeMode = null;      // numeric contract: 0..4
    let cmakePath = null;      // string | null
    let cmakeVersion = null;   // string | null

    const cmakeModeSel = document.getElementById('cmake-mode');
    const selCmake = document.getElementById('sel-cmake');                    // shown in "select" mode
    const cmakeFileInp = document.getElementById('cmake-path-executable');    // shown in "custom" mode
    const latestCmakeVersion = document.getElementById('cmake-latest-label'); // get latest version

    // Fallback to "latest" if the select isn't there for some reason
    const cmakeModeStr = (cmakeModeSel?.value || 'latest');

    // Map string modes -> numeric API
    // 0 = default bundle, 1 = system, 2 = select version, 3 = custom path, 4 = latest
    switch (cmakeModeStr) {
      // default to latest
      case 'default': cmakeMode = 4; break;
      case 'system': cmakeMode = 1; break;
      case 'select': cmakeMode = 2; break;
      case 'custom': cmakeMode = 3; break;
      case 'latest': cmakeMode = 4; break;
      default:
        console.debug('Invalid cmake mode string: ' + cmakeModeStr);
        vscode.postMessage({
          command: CMD_ERROR,
          value: `Please select a valid CMake mode (got: ${cmakeModeStr}).`
        });
        submitted = false;
        return;
    }

    // Validate + collect per-mode extras
    if (cmakeMode === 4) {
      if (!latestCmakeVersion) {

      }
      cmakeVersion = latestCmakeVersion.textContent.trim();
    } else if (cmakeMode === 2) {
      // specific version chosen from dropdown
      if (!selCmake || !selCmake.value) {
        vscode.postMessage({
          command: CMD_ERROR,
          value: 'Please select a CMake version.'
        });
        submitted = false;
        return;
      }
      cmakeVersion = selCmake.value;
    } else if (cmakeMode === 3) {
      // custom executable file
      const files = cmakeFileInp?.files || [];
      if (files.length !== 1) {
        console.debug('Please select a valid CMake executable file');
        vscode.postMessage({
          command: CMD_ERROR,
          value: 'Please select a valid CMake executable file.'
        });
        submitted = false;
        return;
      }

      cmakePath = files[0].name;
    }

    // Final sanity check: numeric range 1..4
    if (cmakeMode === null || isNaN(cmakeMode) || cmakeMode < 1 || cmakeMode > 4) {
      console.debug('Invalid cmake version value: ' + cmakeMode);
      vscode.postMessage({
        command: CMD_ERROR,
        value: 'Please select a valid CMake version.'
      });
      submitted = false;
      return;
    }
    // --- end CMake block ---

    /* Catch silly users who spam the submit button */
    if (submitted) {
      console.error("already submitted");
      return;
    }
    submitted = true;

    //post all data values to the extension
    vscode.postMessage({
      command: CMD_SUBMIT,
      value: {
        projectName: projectName,
        pythonMode: Number(pythonMode),
        pythonPath: pythonPath,
        console: consoleSelection,
        boardType: document.getElementById("sel-board-type").value,
        spiFeature: spiFeature,
        i2cFeature: i2cFeature,
        gpioFeature: gpioFeature,
        wifiFeature: wifiFeature,
        sensorFeature: sensorFeature,
        shellFeature: shellFeature,
        cmakeMode: Number(cmakeMode),
        cmakePath: cmakePath,
        cmakeVersion: cmakeVersion,
        projectBase: document.getElementById("sel-template").value,
      },
    });
  };

  function _onMessage(event) {
    // JSON data sent from the extension
    const message = event.data;

    switch (message.command) {
      case CMD_CHANGE_LOCATION:
        // update UI
        document.getElementById("inp-project-location").value = message.value;
        break;
      case CMD_SET_THEME:
        console.log("set theme", message.theme);
        // update UI
        if (message.theme == "dark") {
          // explicitly choose dark mode
          localStorage.theme = "dark";
          document.body.classList.add("dark");
        } else if (message.theme == "light") {
          document.body.classList.remove("dark");
          // explicitly choose light mode
          localStorage.theme = "light";
        }
        break;
      case CMD_SUBMIT_DENIED:
        submitted = false;
        break;
      default:
        console.error("Unknown command: " + message.command);
        break;
    }
  }

  window.addEventListener("message", _onMessage);

  // add onclick event handlers to avoid inline handlers
  document
    .getElementById("btn-change-project-location")
    .addEventListener("click", changeLocation);
  document
    .getElementById("btn-cancel")
    .addEventListener("click", cancelBtnClick);
  document
    .getElementById("btn-create")
    .addEventListener("click", submitBtnClick);

  document
    .getElementById("inp-project-name")
    .addEventListener("input", function () {
      const projName = document.getElementById("inp-project-name").value;
      console.log(`${projName} is now`);
      // TODO: future examples stuff (maybe)
    });

  const pythonVersionRadio = document.getElementsByName("python-version-radio");
  if (pythonVersionRadio.length > 0) pythonVersionRadio[0].checked = true;
})();
