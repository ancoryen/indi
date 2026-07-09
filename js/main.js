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
    window.location.href = `mailto:hello@indizilla.com?subject=${subject}&body=${body}`;
    const note = document.getElementById('form-note');
    if (note) {
      note.textContent = 'Your email app should open with everything filled in. If it doesn’t, write to hello@indizilla.com — we reply within one business day.';
      note.hidden = false;
    }
  });
}
