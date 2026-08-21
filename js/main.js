// Indizilla — shared behaviour. Small on purpose: every interaction must improve usability.

// Mobile nav
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// Theme switch — explicit, visible, persisted (never silent auto-detect)
document.querySelectorAll('.theme-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'dark' ? '#14161A' : '#FAFAF8';
    try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
  });
});

// Animated browser-frame demos — the device from the Research page, made
// generic. Any .demo-frame[data-demo] gets autoplay with a pause toggle,
// stillness under prefers-reduced-motion, and an off-screen pause. (The
// Research hero demo keeps its own binder in research.js and no attribute,
// so nothing double-binds.)
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.demo-frame[data-demo]').forEach(function (frame) {
    var panels = frame.querySelectorAll('.demo-panel');
    var toggle = frame.querySelector('.demo-toggle');
    if (panels.length < 2) return;
    var i = 0, timer = null, playing = false, userPaused = false;
    function show(n) {
      panels.forEach(function (p, idx) { p.classList.toggle('is-active', idx === n); });
      i = n;
    }
    function play() {
      if (timer) clearInterval(timer);
      timer = setInterval(function () { show((i + 1) % panels.length); }, 3200);
      playing = true;
      if (toggle) { toggle.textContent = 'Pause'; toggle.setAttribute('aria-label', 'Pause preview'); }
    }
    function pause() {
      if (timer) { clearInterval(timer); timer = null; }
      playing = false;
      if (toggle) { toggle.textContent = 'Play'; toggle.setAttribute('aria-label', 'Play preview'); }
    }
    if (toggle) toggle.addEventListener('click', function () {
      userPaused = playing;            // pausing by hand sticks; playing clears it
      playing ? pause() : play();
    });
    // Below-the-fold demos start when they arrive on screen and stop when they
    // leave — but a hand-paused demo stays paused, whatever scrolls by.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting && playing) pause();
          else if (e.isIntersecting && !playing && !userPaused && !reduce) play();
        });
      }, { threshold: 0.25 }).observe(frame);
      show(0);   // the observer starts playback when the frame shows up
    } else {
      show(0);
      if (!reduce) play();
    }
  });
})();

// The header market button shows the active currency's symbol. geo.js has
// already initialised by the time this runs (script order), and a market
// change reloads the page, so setting it once here is enough.
document.querySelectorAll('.market-btn .mb-sym').forEach((el) => {
  if (window.Geo && Geo.market) el.textContent = Geo.market.sym;
});

// Reveal on scroll (skipped for reduced motion — CSS shows content by default there)
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// Contact form → prefilled email (no backend required; swap for a form service later)
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(contactForm);
    const lines = [];
    for (const [key, value] of data.entries()) {
      if (String(value).trim() !== '') lines.push(`${key}: ${value}`);
    }
    const subject = encodeURIComponent(`New enquiry — ${data.get('Business') || data.get('Name') || 'Indizilla website'}`);
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href = `mailto:hi@indizilla.com?subject=${subject}&body=${body}`;
    const note = document.getElementById('form-note');
    if (note) {
      note.textContent = 'Your email app should open with everything filled in. If it doesn’t, write to hi@indizilla.com — we reply within one business day.';
      note.hidden = false;
    }
  });
}
