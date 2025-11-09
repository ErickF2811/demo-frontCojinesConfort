const closeDrawer = (nav) => {
  const hamburger = nav.querySelector('.mobile-nav__hamburger');
  const drawer = nav.querySelector('.mobile-nav__drawer');
  const backdrop = nav.querySelector('.mobile-nav__backdrop');
  if (!hamburger || !drawer || !backdrop) {
    return;
  }
  hamburger.setAttribute('aria-expanded', 'false');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop.setAttribute('aria-hidden', 'true');
  nav.classList.remove('is-open');
  document.body.classList.remove('mobile-nav-open');
};

const openDrawer = (nav) => {
  const hamburger = nav.querySelector('.mobile-nav__hamburger');
  const drawer = nav.querySelector('.mobile-nav__drawer');
  const backdrop = nav.querySelector('.mobile-nav__backdrop');
  if (!hamburger || !drawer || !backdrop) {
    return;
  }
  hamburger.setAttribute('aria-expanded', 'true');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.setAttribute('aria-hidden', 'false');
  nav.classList.add('is-open');
  document.body.classList.add('mobile-nav-open');
};

const initMobileNav = (nav) => {
  const hamburger = nav.querySelector('.mobile-nav__hamburger');
  const drawer = nav.querySelector('.mobile-nav__drawer');
  const backdrop = nav.querySelector('.mobile-nav__backdrop');
  if (!hamburger || !drawer || !backdrop) {
    return;
  }

  hamburger.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = nav.classList.contains('is-open');
    document.querySelectorAll('.mobile-nav.is-open').forEach((openNav) => {
      if (openNav !== nav) {
        closeDrawer(openNav);
      }
    });
    if (isOpen) {
      closeDrawer(nav);
    } else {
      openDrawer(nav);
    }
  });

  backdrop.addEventListener('click', () => closeDrawer(nav));

  drawer.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeDrawer(nav));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      closeDrawer(nav);
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.mobile-nav').forEach((nav) => initMobileNav(nav));
});
