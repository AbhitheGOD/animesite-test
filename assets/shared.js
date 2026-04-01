/* ─────────────────────────────────────────────────────────────────────────────
   AniScout shared.js — page transitions, hamburger nav, scroll reveal.
   Loaded by every page, placed just before </body>.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Page Transitions ──────────────────────────────────────────────────────────
(function initPageTransitions() {
  // Fade the page in on first load
  document.body.style.opacity = '0';
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.body.style.transition = 'opacity 0.28s ease';
      document.body.style.opacity = '1';
    });
  });

  // Intercept internal link clicks and fade out before navigation
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');

    // Skip: no href, hash-only, external, mailto/tel/javascript, new tab, modifier keys
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('mailto') ||
      href.startsWith('tel') ||
      href.startsWith('javascript') ||
      link.target === '_blank' ||
      link.hasAttribute('data-no-transition') ||
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
    ) return;

    e.preventDefault();
    document.body.style.transition = 'opacity 0.18s ease';
    document.body.style.opacity = '0';
    const dest = href;
    setTimeout(function () { window.location.href = dest; }, 200);
  });
})();

// ── Mobile Nav Hamburger ──────────────────────────────────────────────────────
(function initHamburger() {
  const hamburger = document.getElementById('hamburger-btn');
  const mobileMenu = document.getElementById('mobile-nav-menu');
  if (!hamburger || !mobileMenu) return;

  function openMenu() {
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileMenu.style.display = 'block';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { mobileMenu.classList.add('open'); });
    });
  }

  function closeMenu() {
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileMenu.classList.remove('open');
    setTimeout(function () {
      if (!mobileMenu.classList.contains('open')) mobileMenu.style.display = 'none';
    }, 280);
  }

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    mobileMenu.classList.contains('open') ? closeMenu() : openMenu();
  });

  document.addEventListener('click', function (e) {
    if (
      mobileMenu.classList.contains('open') &&
      !mobileMenu.contains(e.target) &&
      !hamburger.contains(e.target)
    ) closeMenu();
  });

  mobileMenu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });
  mobileMenu.querySelectorAll('button.mob-nav-item').forEach(function (btn) {
    btn.addEventListener('click', closeMenu);
  });
})();

// ── Scroll Reveal (pages without their own IntersectionObserver) ──────────────
(function initScrollReveal() {
  // index.html manages its own observer — skip it there
  if (document.querySelector('meta[name="page-reveal"][content="native"]')) return;

  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  els.forEach(function (el) { obs.observe(el); });
})();
