"use strict";

const SELECTED_ITEM_BG_CLASS = 'bg-slate-600';

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
};
