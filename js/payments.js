// Indizilla platform — payments via Razorpay Checkout.
// Simulates payment when no key is configured in js/config.js.

window.Payments = (() => {
  const cfg = window.INDIZILLA_CONFIG || {};
  let loading = null;

  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load Razorpay'));
      document.head.appendChild(s);
    });
    return loading;
  }

  // amount in INR (whole rupees)
  function pay({ amount, description, user, onSuccess, onFailure }) {
    if (amount <= 0) {
      onSuccess({ paymentId: 'credits_' + Date.now(), method: 'credits' });
      return;
    }

    if (!cfg.razorpayKeyId) {
      const ok = window.confirm(
        'Demo payment gateway.\n(Live Razorpay checkout activates once razorpayKeyId is set in js/config.js.)\n\n' +
        'Simulate paying ' + DB.inr(amount) + ' for:\n' + description + '?'
      );
      if (ok) onSuccess({ paymentId: 'demo_pay_' + Date.now(), method: 'razorpay-demo' });
      else if (onFailure) onFailure(new Error('Payment cancelled'));
      return;
    }

    loadRazorpay().then(() => {
      const rzp = new Razorpay({
        key: cfg.razorpayKeyId,
        amount: Math.round(amount * 100), // paise
        currency: 'INR',
        name: 'Indizilla',
        description,
        prefill: { name: user.name || '', email: user.email || '' },
        theme: { color: '#DAFE31' },
        handler: (resp) => onSuccess({ paymentId: resp.razorpay_payment_id, method: 'razorpay' }),
        modal: { ondismiss: () => onFailure && onFailure(new Error('Payment cancelled')) }
      });
      rzp.open();
    }).catch((err) => onFailure && onFailure(err));
  }

  return { pay };
})();
