"use strict";

const SELECTED_ITEM_BG_CLASS = 'bg-slate-500';
const SELECTED_ITEM_BG_OPACITY_CLASS = 'bg-opacity-50';
const SELECTED_ITEM_BG_CLASS_DARK = 'dark:bg-slate-600';
var isExampleSelected = false;
var clickOutsideSuggestionsListenerAdded = false;

function navItemOnClick(itemId) {
  // needed so a element isn't hidden behind the navbar on scroll
  const navbarOffsetHeight = document.getElementById('top-navbar').offsetHeight;

  // remove the SELECTED_ITEM_BG_CLASS class from all nav items
  const navItems = document.getElementsByClassName('nav-item');
  const ovNavItems = document.getElementsByClassName("overlay-item");
  [...navItems, ...ovNavItems].forEach(element => {
    element.classList.remove(SELECTED_ITEM_BG_CLASS);
    element.classList.remove(SELECTED_ITEM_BG_OPACITY_CLASS);
    element.classList.remove(SELECTED_ITEM_BG_CLASS_DARK);
  });

  const item = document.getElementById(itemId);
  item.classList.add(SELECTED_ITEM_BG_CLASS);
  item.classList.add(SELECTED_ITEM_BG_OPACITY_CLASS);
  item.classList.add(SELECTED_ITEM_BG_CLASS_DARK);
  const otherItemsId = itemId.includes('ov-') ? itemId.replace('ov-', '') : 'ov-' + itemId;
  const otherItem = document.getElementById(otherItemsId);
  otherItem.classList.add(SELECTED_ITEM_BG_CLASS);
  otherItem.classList.add(SELECTED_ITEM_BG_OPACITY_CLASS);
  otherItem.classList.add(SELECTED_ITEM_BG_CLASS_DARK);

  switch (itemId) {
    case "ov-nav-basic":
    case "nav-basic":
      // navigate to top
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      break;

    case "ov-nav-features":
    case "nav-features":
      //document.getElementById("section-features").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-features").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;

    case "ov-nav-stdio":
    case "nav-stdio":
      //document.getElementById("section-stdio").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-stdio").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;

    case "ov-nav-pico-wireless":
    case "nav-pico-wireless":
      // document.getElementById("section-pico-wireless").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-pico-wireless").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;

    case "ov-nav-code-gen":
    case "nav-code-gen":
      // document.getElementById("section-code-gen").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-code-gen").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;

    case "ov-nav-debugger":
    case "nav-debugger":
      // document.getElementById("section-debugger").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-debugger").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;
    default:
      break;
  }
}

window.hideCustomInputs = function (divs, disable) {
  divs.forEach(div => {
    //const inputAndSelects = div.querySelectorAll('input, select');
    /*inputAndSelects.forEach(inputOrSelect => {
      inputOrSelect.disabled = disable;
    });*/
    if (disable) {
      div.classList.add('hidden');
    } else {
      div.classList.remove('hidden');
    }
  });
};

window.toggleCreateFromExampleMode = function (forceOn, forceOff) {
  const createFromExampleBtn = document.getElementById('btn-create-from-example');
  const projectNameInput = document.getElementById('inp-project-name');
  var isExampleMode = createFromExampleBtn ? createFromExampleBtn.getAttribute('data-example-mode') === 'true' : true;
  const projectOptionsDivs = document.querySelectorAll('.project-options');
  const examplesList = document.getElementById('examples-list');
  const projectNameGrid = document.getElementById('project-name-grid');
  const projectNameDropdownButton = document.getElementById('project-name-dropdown-button');
  const defaultBoardTypeOption = document.getElementById('sel-default');

  if (isExampleMode && (forceOn === undefined || !forceOn) && (forceOff === undefined || forceOff)) {
    if (createFromExampleBtn) {
      createFromExampleBtn.setAttribute('data-example-mode', 'false');
      createFromExampleBtn.innerText = 'Example';
      // add md:grid-cols-2 from projectNameGrid
      projectNameGrid.classList.add('md:grid-cols-2');
      // hide dropdown button
      projectNameDropdownButton.classList.add('hidden');
      // crashes the webview
      //projectNameInput.required = true;
    }

    if (defaultBoardTypeOption) {
      defaultBoardTypeOption.hidden = true;
      defaultBoardTypeOption.disabled = true;

      // if selected switch selection to first not hidden option
      if (defaultBoardTypeOption.selected) {
        const boardTypeSelector = document.getElementById('sel-board-type');

        if (boardTypeSelector) {
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
      }
    }

    if (projectNameInput) {
      // old datalist approach: projectNameInput.setAttribute('list', undefined);
      // remove keyup event listener from projectNameInput if it exists
      if (window.projectNameInputOnKeyup) {
        projectNameInput.removeEventListener('keyup', window.projectNameInputOnKeyup);
      }
      projectNameInput.setAttribute('placeholder', 'Project name');
    }

    if (projectOptionsDivs) {
      hideCustomInputs(projectOptionsDivs, false);
    }
  } else if (forceOff === undefined || !forceOff) {
    if (createFromExampleBtn) {
      createFromExampleBtn.setAttribute('data-example-mode', 'true');
      createFromExampleBtn.innerText = 'Custom';
      // remove md:grid-cols-2 from projectNameGrid
      projectNameGrid.classList.remove('md:grid-cols-2');
      // show dropdown button
      projectNameDropdownButton.classList.remove('hidden');

      // crashes the webview
      // projectName required has issues with the suggestions
      //projectNameInput.required = false;
    }

    if (projectNameInput && examplesList && typeof examples !== 'undefined') {
      // clear input to avoid crashing the webview
      projectNameInput.value = '';

      //projectNameInput.setAttribute('list', "examples-list");
      projectNameInput.setAttribute('placeholder', 'Select an example');

      if (defaultBoardTypeOption) {
        defaultBoardTypeOption.hidden = false;
        defaultBoardTypeOption.disabled = false;
        defaultBoardTypeOption.selected = true;
      }

      window.removeExampleItems = window.removeExampleItems || function () {
        if (examplesList !== null) {
          // clear ul
          examplesList.innerHTML = '';
        }
      };

      window.examplesListSelect = window.examplesListSelect || function (exampleName) {
        projectNameInput.value = exampleName;
        // Create and dispatch an input event, for the input event listener to be triggered
        projectNameInput.dispatchEvent(new Event('input', {
          bubbles: true,
          cancelable: true,
        }));
        removeExampleItems();
      };

      window.removeClickOutsideSuggestionsListener = window.removeClickOutsideSuggestionsListener || function () {
        document.body.removeEventListener('click', handleOutsideSuggestionsClick);
        clickOutsideSuggestionsListenerAdded = false;
      }

      window.handleOutsideSuggestionsClick = window.handleOutsideSuggestionsClick || function (event) {
        // check if the clicked element is not inside the examplesList
        if (!examplesList.contains(event.target) && event.target !== projectNameDropdownButton) {
          // click occurred outside the suggestions "popup" so remove the suggestions
          removeExampleItems();
          removeClickOutsideSuggestionsListener();
        }
      };

      window.projectNameInputOnKeyup = window.projectNameInputOnKeyup || function (e) {
        removeExampleItems();

        if (!clickOutsideSuggestionsListenerAdded) {
          clickOutsideSuggestionsListenerAdded = true;

          // add on click event listener to 
          document.body.addEventListener('click', handleOutsideSuggestionsClick);
        }

        const isInputEmpty = projectNameInput.value === "";
        for (let i of Object.keys(examples).sort()) {
          // startsWith was to strict for the examples name format we use
          if (isInputEmpty || i.toLowerCase().includes(projectNameInput.value.toLowerCase())) {
            // create li element
            let listItem = document.createElement("li");
            // one common class name
            listItem.classList.add("examples-list-suggestion");
            listItem.style.cursor = "pointer";
            // listItem.setAttribute("onclick", "examplesListSelect('" + i + "')");
            // added as event listener because of content security policy
            listItem.addEventListener("click", (event) => {
              event.stopPropagation();
              removeClickOutsideSuggestionsListener();
              examplesListSelect(i);
            });

            // display matched part as bold text
            // this is for .startsWith selector above 
            //let word = isInputEmpty ? "" : "<b>" + i.substr(0, projectNameInput.value.length) + "</b>";
            //word += i.substr(projectNameInput.value.length);
            // this is for .includes selector above
            const startIndex = isInputEmpty ? 0 : i.indexOf(projectNameInput.value);
            let word = isInputEmpty ? "" : i.substring(0, startIndex);
            word += isInputEmpty ? "" : "<b>" + i.substring(startIndex, startIndex + projectNameInput.value.length) + "</b>";
            word += i.substring(startIndex + projectNameInput.value.length);

            // set value of li elemetn
            listItem.innerHTML = word;
            examplesList.appendChild(listItem);
          }
        }
      };

      projectNameDropdownButton.addEventListener('click', (event) => {
        // without this the webview crashes if project name input contains any text
        event.preventDefault();

        if (examplesList.childNodes.length === 0) {
          // this is required to prevent the outside suggestions listener to fire after it has been
          // added below
          event.stopPropagation();
          projectNameInputOnKeyup(event);
        } else {
          removeExampleItems();
        }
      });

      projectNameInput.addEventListener('keyup', projectNameInputOnKeyup);
    }

    if (projectOptionsDivs) {
      hideCustomInputs(projectOptionsDivs, true);
    }
  }
};

//run navItemOnClick after page loaded
window.onload = function () {
  // pre-select the first nav item
  const navItems = document.getElementsByClassName('nav-item') ?? [];
  const ovNavItems = document.getElementsByClassName('overlay-item');
  Array.prototype.forEach.call([...navItems, ...ovNavItems], item => {
    item.addEventListener('click', function () {
      navItemOnClick(item.id);
    });
  });
  navItemOnClick(navItems[0].id);

  const projectNameInput = document.getElementById('inp-project-name');
  const createFromExampleBtn = document.getElementById('btn-create-from-example');

  if (projectNameInput) {
    projectNameInput.addEventListener('input', function () {
      var isExampleMode = createFromExampleBtn ? createFromExampleBtn.getAttribute('data-example-mode') === 'true' : true;
      if (!isExampleMode) {
        isExampleSelected = false;
        return;
      }

      //const examplesList = document.getElementById('examples-list');
      //const exampleOptions = Array.from(examplesList.options).map(option => option.value);

      const inputValue = projectNameInput.value;
      const isValueInOptions = Object.keys(examples).includes(inputValue);

      if (isValueInOptions) {
        // example selected
        isExampleSelected = true;
      } else {
        // No example selected
        isExampleSelected = false;
      }
    });
  }

  if (createFromExampleBtn) {
    createFromExampleBtn.addEventListener('click', function () {
      toggleCreateFromExampleMode();
    });
  }

  if (forceCreateFromExample !== undefined && forceCreateFromExample) {
    if (createFromExampleBtn) {
      // display: none; example btn
      createFromExampleBtn.classList.add('hidden');
    }
    toggleCreateFromExampleMode(true);
  } else {
    // hide if not force from example
    const defaultBoardTypeOption = document.getElementById('sel-default');
    if (defaultBoardTypeOption) {
      defaultBoardTypeOption.hidden = true;
      defaultBoardTypeOption.disabled = true;
    }
  }

  // TODO: maybe can remove if sel-pico2 disable is moved into state restore
  const sdkSelector = document.getElementById('sel-pico-sdk');
  if (sdkSelector) {
    if (parseInt(sdkSelector.value.split(".")[0]) < 2) {
      const selPico2 = document.getElementById('sel-pico2');
      if (selPico2) {
        selPico2.disabled = true;
      }
    }
  }

  const burgerMenu = document.getElementById("burger-menu");
  const navOverlay = document.getElementById("nav-overlay");

  function toggleOverlay() {
    navOverlay.classList.toggle("hidden");
  }

  function closeOverlay(e) {
    if (!navOverlay.contains(e.target) && e.target !== burgerMenu) {
      navOverlay.classList.add("hidden");
    }
  }

  burgerMenu.addEventListener("click", toggleOverlay);
  window.addEventListener("click", closeOverlay);

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 1024) {
      navOverlay.classList.add("hidden");
    }
  });
};
