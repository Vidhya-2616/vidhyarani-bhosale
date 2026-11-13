/* CP Banner: mobile menu toggle (vanilla JS, no dependencies).
   Uses event delegation on the document, so it keeps working after the
   theme editor reloads the section. */
(function () {
  'use strict';

  var OPEN_CLASS = 'is-open';
  var MOBILE_QUERY = window.matchMedia('(max-width: 749px)');

  function setOpen(menu, open) {
    var toggle = menu.querySelector('[data-cp-menu-toggle]');
    menu.classList.toggle(OPEN_CLASS, open);
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  function closeAll(returnFocus) {
    var menus = document.querySelectorAll('[data-cp-menu].' + OPEN_CLASS);
    for (var i = 0; i < menus.length; i++) {
      setOpen(menus[i], false);
      if (returnFocus) {
        var toggle = menus[i].querySelector('[data-cp-menu-toggle]');
        if (toggle) toggle.focus();
      }
    }
  }

  // Toggle on hamburger / X click; close when clicking outside the menu
  document.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-cp-menu-toggle]');

    if (toggle) {
      var menu = toggle.closest('[data-cp-menu]');
      setOpen(menu, !menu.classList.contains(OPEN_CLASS));
      return;
    }

    var openMenus = document.querySelectorAll('[data-cp-menu].' + OPEN_CLASS);
    for (var i = 0; i < openMenus.length; i++) {
      if (!openMenus[i].contains(event.target)) {
        setOpen(openMenus[i], false);
      }
    }
  });

  // Escape closes the menu and returns focus to the toggle
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeAll(true);
    }
  });

  // Reset when the viewport grows past the mobile breakpoint
  var onBreakpointChange = function (event) {
    if (!event.matches) closeAll(false);
  };

  if (MOBILE_QUERY.addEventListener) {
    MOBILE_QUERY.addEventListener('change', onBreakpointChange);
  } else if (MOBILE_QUERY.addListener) {
    MOBILE_QUERY.addListener(onBreakpointChange);
  }
})();