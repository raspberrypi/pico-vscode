"use strict";

const CMD_CHANGE_LOCATION = 'changeLocation';
const CMD_SUBMIT = 'submit';
const CMD_CANCEL = 'cancel';
const CMD_SET_THEME = 'setTheme';
const CMD_ERROR = 'error';
const CMD_SUBMIT_DENIED = 'submitDenied';

var submitted = false;

(function () {
  const vscode = acquireVsCodeApi();

  // Python version selection handling
  {
    const modeEl = document.getElementById('python-mode');
    const selectRow = document.getElementById('python-secondary-known');
    const systemRow = document.getElementById('python-secondary-system');
    const customRow = document.getElementById('python-secondary-custom');

    const fileInput = document.getElementById('python-path-executable');
    const fileLabel = document.getElementById('python-file-label');
    const fileBox = document.getElementById('python-filebox');

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
      const label = el.querySelector('#python-filebox');
      if (label) {
        label.setAttribute('aria-disabled', String(!show));
        label.classList.toggle('pointer-events-none', !show);
        label.classList.toggle('opacity-60', !show);
      }
    }

    function setMode(mode) {
      toggleSection(selectRow, mode === 'known');
      toggleSection(systemRow, mode === 'system');
      toggleSection(customRow, mode === 'custom');
    }

    // TODO: add state saving/loading via state.js
    // modeEl.value = window.savedPythoneMode ?? modeEl.value;

    modeEl.addEventListener('change', e => setMode(e.target.value));
    setMode(modeEl.value);
  }

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

    // get all values of inputs
    const projectNameElement = document.getElementById('inp-project-name');
    // if is project import then the project name element will not be rendered and does not exist in the DOM
    const projectName = projectNameElement.value;
    if (projectName !== undefined && !projectNameFormValidation(projectNameElement)) {
      submitted = false;
      return;
    }

    let pythonMode = null;      // numeric contract: 0..2
    let pythonPath = null;      // string | null

    // selected python version
    const pythonModeSel = document.getElementById('python-mode');
    const selPython = document.getElementById('sel-pyenv-known');                    // shown in "select" mode
    const pythonFileInp = document.getElementById('python-path-executable');    // shown in "custom" mode

    const pythonModeStr = (pythonModeSel?.value || 'custom');

    switch (pythonModeStr) {
      case 'known': pythonMode = 0; break;
      case 'system': pythonMode = 1; break;
      case 'custom': pythonMode = 2; break;
      default:
        console.debug('Invalid python mode string: ' + pythonModeStr);
        vscode.postMessage({
          command: CMD_ERROR,
          value: `Please select a valid Python mode (got: ${pythonModeStr}).`
        });
        submitted = false;
        return;
    }

    if (pythonMode === 0) {
      pythonPath = selPython.value;
    } else if (pythonMode === 2) {
      const files = pythonFileInp.files;

      if (files.length == 1) {
        pythonPath = files[0].name;
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

    //post all data values to the extension
    vscode.postMessage({
      command: CMD_SUBMIT,
      value: {
        projectName: projectName,
        pythonMode: pythonMode,
        pythonPath: pythonPath
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

  document.getElementById('inp-project-name').addEventListener('input', function () {
    const projName = document.getElementById('inp-project-name').value;
    // TODO: future examples stuff (maybe)
  });

  const pythonVersionRadio = document.getElementsByName('python-version-radio');
  if (pythonVersionRadio.length > 0)
    pythonVersionRadio[0].checked = true;
}());
