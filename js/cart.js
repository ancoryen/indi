// Indizilla platform — à la carte page.
// Individual services; clubbing package-overlapping services costs a combination
// premium, and the nearest package is recommended — upsell only, never downgrade.

(async () => {
  await DB.init(); // loads the Supabase session/cache in remote mode; instant in demo mode
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CART_KEY = 'indizilla_cart';

  // Individual services only — packages are recommended, not listed.
  const catalog = DB.SERVICES.filter(s => !s.id.startsWith('tier-'));

  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
  cart = cart.filter(id => DB.SERVICES.some(s => s.id === id));

  function persist() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

  function renderCatalog() {
    $('alacarte-list').innerHTML = catalog.map(s => `
      <div class="alacarte-item">
        <div>
          <div class="ai-name">${esc(s.name)}</div>
          <div class="ai-price">${DB.inr(s.price)}${s.monthly ? '/month' : ''} · starts from</div>
        </div>
        <button class="btn-mini ${cart.includes(s.id) ? '' : 'primary'}" data-svc="${s.id}" type="button">
          ${cart.includes(s.id) ? 'Remove' : 'Add'}
        </button>
      </div>`).join('');
  }

  function renderSummary() {
    const q = DB.cartQuote(cart);

    $('cart-lines').innerHTML = q.items.length
      ? q.items.map(i => `<div class="sum-line"><span>${esc(i.name)}${i.monthly ? ' <span style="color:var(--text-muted); font-size:12px;">/mo</span>' : ''}</span><strong>${DB.inr(i.price)}</strong></div>`).join('')
      : '<p style="font-size:14px; color:var(--text-muted);">Nothing selected yet.</p>';

    $('cart-totals').hidden = !q.items.length;
    $('ct-subtotal').textContent = DB.inr(q.subtotal);
    $('ct-premium-row').hidden = q.premium <= 0;
    $('ct-premium').textContent = '+' + DB.inr(q.premium);
    $('ct-total').textContent = DB.inr(q.total);
    $('cart-pay').textContent = 'Pay ' + DB.inr(q.total);

    // Upsell — only ever recommends the package, never removing services.
    const rec = q.recommendation;
    $('upsell').hidden = !rec;
    if (rec) {
      $('up-title').textContent = 'Better together: ' + rec.pkg.name;
      const extras = rec.extras.length ? ' Plus it adds: ' + rec.extras.join(', ') + '.' : '';
      $('up-body').textContent =
        rec.pkg.name + ' already includes ' + rec.coveredNames.join(', ') +
        ' — with no combination pricing.' + extras;
      $('up-save').textContent = rec.savings > 0
        ? 'Save ' + DB.inr(rec.savings) + ' — ' + DB.inr(rec.pkg.price) + (rec.pkg.monthly ? '/month' : '') + ' total'
        : DB.inr(rec.pkg.price) + (rec.pkg.monthly ? '/month' : '') + ' for everything above and more';
      $('up-switch').dataset.pkg = rec.pkg.id;
    }
    return q;
  }

  function renderAll() { renderCatalog(); return renderSummary(); }

  $('alacarte-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-svc]');
    if (!btn) return;
    const id = btn.dataset.svc;
    cart = cart.includes(id) ? cart.filter(x => x !== id) : cart.concat(id);
    persist();
    renderAll();
  });

  $('premium-why').addEventListener('click', () => {
    const note = $('premium-note');
    note.hidden = !note.hidden;
  });

  $('up-switch').addEventListener('click', (e) => {
    cart = [e.target.dataset.pkg];
    persist();
    renderAll();
  });

  $('cart-pay').addEventListener('click', () => {
    const q = renderSummary();
    if (!q.items.length) return;

    const user = DB.getSession();
    if (!user) { window.location.href = 'login.html?next=cart.html'; return; }

    const isPackage = q.items.length === 1 && q.items[0].id.startsWith('tier-');
    const name = isPackage ? q.items[0].name : 'À la carte: ' + q.items.map(i => i.name).join(' + ');
    const serviceId = isPackage ? q.items[0].id : 'cart';

    Payments.pay({
      amount: q.total,
      description: name,
      user,
      onSuccess: async ({ paymentId, method }) => {
        await DB.createOrder({
          userId: user.id, serviceId, serviceName: name,
          amount: q.total, discount: 0, couponCode: null,
          creditsUsed: 0, payable: q.total, paymentId, method
        });
        cart = [];
        persist();
        window.location.href = 'dashboard.html';
      }
    });
  });

  renderAll();
})();
