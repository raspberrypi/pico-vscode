"use strict";

const CMD_CHANGE_LOCATION = "changeLocation";
const CMD_SUBMIT = "submit";
const CMD_CANCEL = "cancel";
const CMD_SET_THEME = "setTheme";
const CMD_ERROR = "error";
const CMD_SUBMIT_DENIED = "submitDenied";

var submitted = false;

(function () {
  const vscode = acquireVsCodeApi();

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
    /* Catch silly users who spam the submit button */
    if (submitted) {
      console.error("already submitted");
      return;
    }
    submitted = true;

    // get all values of inputs
    const projectNameElement = document.getElementById("inp-project-name");
    // if is project import then the project name element will not be rendered and does not exist in the DOM
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

    const cmakeVersionRadio = document.getElementsByName("cmake-version-radio");
    let cmakeMode = null;
    let cmakePath = null;
    let cmakeVersion = null;
    for (let i = 0; i < cmakeVersionRadio.length; i++) {
      if (cmakeVersionRadio[i].checked) {
        cmakeMode = Number(cmakeVersionRadio[i].value);
        break;
      }
    }
    if (cmakeVersionRadio.length === 0) {
      // default to cmake mode 1 == System version
      cmakeMode = 1;
    }

    // if cmake version is null or not a number, smaller than 0 or bigger than 3, set it to 0
    if (
      cmakeMode === null ||
      isNaN(cmakeMode) ||
      cmakeMode < 0 ||
      cmakeMode > 4
    ) {
      // TODO: first check if default is supported
      cmakeMode = 0;
      console.debug("Invalid cmake version value: " + cmakeMode.toString());
      vscode.postMessage({
        command: CMD_ERROR,
        value: "Please select a valid cmake version.",
      });
      submitted = false;

      return;
    }
    if (cmakeMode === 2) {
      cmakeVersion = document.getElementById("sel-cmake").value;
    } else if (cmakeMode == 3) {
      const files = document.getElementById("cmake-path-executable").files;

      if (files.length === 1) {
        cmakePath = files[0].name;
      } else {
        console.debug("Please select a valid cmake executable file");
        vscode.postMessage({
          command: CMD_ERROR,
          value: "Please select a valid cmake executable file.",
        });
        submitted = false;

        return;
      }
    }

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
