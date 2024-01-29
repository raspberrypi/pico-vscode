"use strict";

const SELECTED_ITEM_BG_CLASS = 'bg-slate-600';
var isExampleSelected = false;

function navItemOnClick(itemId) {
  // needed so a element isn't hidden behind the navbar on scroll
  const navbarOffsetHeight = document.getElementById('top-navbar').offsetHeight;

  // remove the SELECTED_ITEM_BG_CLASS class from all nav items
  const navItems = document.getElementsByClassName('nav-item');
  for (let i = 0; i < navItems.length; i++) {
    navItems[i].classList.remove(SELECTED_ITEM_BG_CLASS);
  }

  const item = document.getElementById(itemId);
  item.classList.add(SELECTED_ITEM_BG_CLASS);

  switch (itemId) {
    case "nav-basic":
      // navigate to top
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      break;
    case "nav-features":
      //document.getElementById("section-features").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-features").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;
    case "nav-stdio":
      //document.getElementById("section-stdio").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-stdio").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
    case "nav-pico-wireless":
      // document.getElementById("section-pico-wireless").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-pico-wireless").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;
    case "nav-code-gen":
      // document.getElementById("section-code-gen").scrollIntoView();
      window.scrollTo({
        top: document.getElementById("section-code-gen").offsetTop - navbarOffsetHeight,
        behavior: 'smooth'
      });
      break;
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

  if (isExampleMode && (forceOn === undefined || !forceOn) && (forceOff === undefined || forceOff)) {
    if (createFromExampleBtn) {
      createFromExampleBtn.setAttribute('data-example-mode', 'false');
      createFromExampleBtn.innerText = 'Example';
    }

    if (projectNameInput) {
      projectNameInput.setAttribute('list', undefined);
      projectNameInput.setAttribute('placeholder', 'Project name');
    }

    if (projectOptionsDivs) {
      hideCustomInputs(projectOptionsDivs, false);
    }
  } else if (forceOff === undefined || !forceOff) {
    if (createFromExampleBtn) {
      createFromExampleBtn.setAttribute('data-example-mode', 'true');
      createFromExampleBtn.innerText = 'Custom';
    }

    if (projectNameInput) {
      projectNameInput.setAttribute('list', "examples-list");
      projectNameInput.setAttribute('placeholder', 'Select example');
    }

    if (projectOptionsDivs) {
      hideCustomInputs(projectOptionsDivs, true);
    }
  }
};

//run navItemOnClick after page loaded
window.onload = function () {
  // pre-select the first nav item
  const navItems = document.getElementsByClassName('nav-item');
  Array.prototype.forEach.call(navItems, item => {
    item.addEventListener('click', function () {
      navItemOnClick(item.id);
    });
  });
  navItemOnClick(navItems[0].id);

  const projectNameInput = document.getElementById('inp-project-name');
  const createFromExampleBtn = document.getElementById('btn-create-from-example');

  projectNameInput.addEventListener('input', function () {
    var isExampleMode = createFromExampleBtn ? createFromExampleBtn.getAttribute('data-example-mode') === 'true' : true;
    if (!isExampleMode) {
      isExampleSelected = false;
      return;
    }

    const examplesList = document.getElementById('examples-list');
    const exampleOptions = Array.from(examplesList.options).map(option => option.value);

    const inputValue = projectNameInput.value;
    const isValueInOptions = exampleOptions.includes(inputValue);

    if (isValueInOptions) {
      // example selected
      isExampleSelected = true;
    } else {
      // No example selected
      isExampleSelected = false;
    }
  });

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
  }
};
