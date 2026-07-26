// Indizilla Research — marketing-page behaviours (no data layer needed here).
// Hero product demo (autoplay + pause), scroll-spy how-it-works, single-open FAQ.
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Animated hero demo ---- */
  var demo = document.getElementById('hero-demo');
  if (demo) {
    var panels = demo.querySelectorAll('.demo-panel');
    var toggle = demo.querySelector('.demo-toggle');
    var i = 0, timer = null, playing = !reduce;

    function show(n) {
      panels.forEach(function (p, idx) { p.classList.toggle('is-active', idx === n); });
      i = n;
    }
    function advance() { show((i + 1) % panels.length); }
    function play() {
      if (timer) clearInterval(timer);
      timer = setInterval(advance, 3200);
      playing = true; if (toggle) { toggle.textContent = 'Pause'; toggle.setAttribute('aria-label', 'Pause preview'); }
    }
    function pause() {
      if (timer) { clearInterval(timer); timer = null; }
      playing = false; if (toggle) { toggle.textContent = 'Play'; toggle.setAttribute('aria-label', 'Play preview'); }
    }
    if (toggle) toggle.addEventListener('click', function () { playing ? pause() : play(); });
    // Pause when off-screen to save cycles.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting && playing) pause();
          else if (e.isIntersecting && !playing && !reduce && !timer && document.hasFocus()) { /* leave paused if user paused */ }
        });
      }, { threshold: 0.25 }).observe(demo);
    }
    show(0);
    if (!reduce) play();
  }

  /* ---- Scroll-spy how-it-works ---- */
  var steps = document.querySelectorAll('.spy-step');
  var cards = document.querySelectorAll('.spy-card');
  if (steps.length && cards.length) {
    function activate(n) {
      steps.forEach(function (s) { s.classList.toggle('is-active', s.dataset.spy === n); });
      cards.forEach(function (c) { c.classList.toggle('is-active', c.dataset.spy === n); });
    }
    if ('IntersectionObserver' in window) {
      var spyObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) activate(e.target.dataset.spy); });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      steps.forEach(function (s) { spyObs.observe(s); });
    }
    // Click a step to focus it too.
    steps.forEach(function (s) { s.addEventListener('click', function () { activate(s.dataset.spy); }); });
  }

  /* ---- Single-open FAQ ---- */
  document.querySelectorAll('.faq-single').forEach(function (faq) {
    var items = faq.querySelectorAll('details');
    items.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open) items.forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
  });
})();
