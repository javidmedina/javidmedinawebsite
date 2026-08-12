export function initNav(): void {
  const nav = document.getElementById('nav');

  function onScroll(): void {
    if (!nav) return;
    nav.classList.toggle('nav--scrolled', window.scrollY > 20);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  const hamburger = document.getElementById('navHamburger');
  const mobileNav = document.getElementById('navMobile');
  const mobileLinks = document.querySelectorAll<HTMLAnchorElement>('.nav__mobile a');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const open = mobileNav.classList.toggle('nav__mobile--open');
      hamburger.classList.toggle('nav__hamburger--open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    mobileLinks.forEach((link) => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('nav__mobile--open');
        hamburger.classList.remove('nav__hamburger--open');
        document.body.style.overflow = '';
      });
    });
  }

  const anchorLinks = document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');
  anchorLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  const tooltipCtas = document.querySelectorAll<HTMLElement>('.marquee__tooltip-cta[data-scroll-to]');
  tooltipCtas.forEach((cta) => {
    cta.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = cta.getAttribute('data-scroll-to');
      if (!targetId) return;
      const target = document.querySelector(`#${targetId}`);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}
