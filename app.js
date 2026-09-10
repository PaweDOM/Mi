(function () {
  const STORAGE_KEY = 'payment-reminders:payments';
  const PAID_KEY = 'payment-reminders:paidStatus';
  const NOTIFIED_KEY = 'payment-reminders:lastNotified';
  const BANNER_DISMISSED_KEY = 'payment-reminders:notifBannerDismissed';

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const totalEl = document.getElementById('total');
  const form = document.getElementById('form');
  const addBtn = document.getElementById('add-btn');
  const fName = document.getElementById('f-name');
  const fAmount = document.getElementById('f-amount');
  const fDay = document.getElementById('f-day');
  const fLead = document.getElementById('f-lead');
  const fError = document.getElementById('f-error');
  const fSave = document.getElementById('f-save');
  const fCancel = document.getElementById('f-cancel');
  const banner = document.getElementById('notif-banner');
  const notifEnable = document.getElementById('notif-enable');
  const notifDismiss = document.getElementById('notif-dismiss');

  let payments = [];
  let paidStatus = {};
  let lastNotified = {};
  let editingId = null;

  function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${date.getMonth() + 1}`;
  }

  function daysUntil(day) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let due = new Date(y, m, day);
    const today = new Date(y, m, now.getDate());
    if (due < today) due = new Date(y, m + 1, day);
    return Math.round((due - today) / 86400000);
  }

  function fmt(n) {
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Persistence ---

  function load() {
    try {
      payments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      payments = [];
    }
    try {
      paidStatus = JSON.parse(localStorage.getItem(PAID_KEY) || '{}');
    } catch (e) {
      paidStatus = {};
    }
    try {
      lastNotified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    } catch (e) {
      lastNotified = {};
    }
  }

  function savePayments() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
  }
  function savePaidStatus() {
    localStorage.setItem(PAID_KEY, JSON.stringify(paidStatus));
  }
  function saveLastNotified() {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(lastNotified));
  }

  // --- Notifications ---

  function updateNotifBanner() {
    const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === '1';
    const supported = 'Notification' in window;
    const show = supported && Notification.permission === 'default' && !dismissed;
    banner.classList.toggle('hidden', !show);
  }

  notifEnable.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    updateNotifBanner();
  });

  notifDismiss.addEventListener('click', () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, '1');
    updateNotifBanner();
  });

  function checkAndNotify() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const key = monthKey();
    const todayStr = new Date().toDateString();
    let changed = false;

    payments.forEach((p) => {
      const paidKey = `${key}:${p.id}`;
      if (paidStatus[paidKey]) return;

      const d = daysUntil(p.day);
      const leadTime = p.daysBefore ?? 2;
      const notifKey = `${p.id}:${key}`;

      if (d <= leadTime && lastNotified[notifKey] !== todayStr) {
        const label = d <= 0 ? (d === 0 ? 'is due today' : 'is overdue') : `is due in ${d} day${d === 1 ? '' : 's'}`;
        new Notification(p.name, { body: `${fmt(p.amount)} ${label}.` });
        lastNotified[notifKey] = todayStr;
        changed = true;
      }
    });

    if (changed) saveLastNotified();
  }

  // --- Status / rendering ---

  function statusFor(payment) {
    const key = `${monthKey()}:${payment.id}`;
    if (paidStatus[key]) return { label: 'Paid this month', cls: 'success' };
    const d = daysUntil(payment.day);
    if (d < 0) return { label: 'Overdue', cls: 'danger' };
    if (d === 0) return { label: 'Due today', cls: 'danger' };
    if (d <= (payment.daysBefore ?? 5)) return { label: `Due in ${d} day${d === 1 ? '' : 's'}`, cls: 'warning' };
    return { label: `Due in ${d} days`, cls: 'muted' };
  }

  function render() {
    listEl.innerHTML = '';
    emptyEl.classList.toggle('hidden', payments.length !== 0);

    let total = 0;
    const sorted = [...payments].sort((a, b) => daysUntil(a.day) - daysUntil(b.day));

    sorted.forEach((p) => {
      total += Number(p.amount);
      const st = statusFor(p);
      const isPaid = st.cls === 'success';

      const row = document.createElement('div');
      row.className = 'payment-row';
      row.innerHTML = `
        <div class="payment-top">
          <div>
            <p class="payment-name">${escapeHtml(p.name)}</p>
            <p class="payment-detail">${fmt(p.amount)} · due day ${p.day}</p>
          </div>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div class="payment-actions">
          <div class="action-btns">
            <button class="edit-btn" data-id="${p.id}">Edit</button>
            <button class="del-btn" data-id="${p.id}">Delete</button>
          </div>
          <button class="pay-btn" data-id="${p.id}">${isPaid ? 'Mark unpaid' : 'Mark paid'}</button>
        </div>
      `;
      listEl.appendChild(row);
    });

    totalEl.textContent = fmt(total);

    listEl.querySelectorAll('.pay-btn').forEach((btn) => btn.addEventListener('click', () => togglePaid(btn.dataset.id)));
    listEl.querySelectorAll('.del-btn').forEach((btn) => btn.addEventListener('click', () => deletePayment(btn.dataset.id)));
    listEl.querySelectorAll('.edit-btn').forEach((btn) => btn.addEventListener('click', () => editPayment(btn.dataset.id)));
  }

  function togglePaid(id) {
    const key = `${monthKey()}:${id}`;
    paidStatus[key] = !paidStatus[key];
    savePaidStatus();
    render();
  }

  function deletePayment(id) {
    payments = payments.filter((p) => p.id !== id);
    savePayments();
    render();
  }

  function editPayment(id) {
    const p = payments.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    fName.value = p.name;
    fAmount.value = p.amount;
    fDay.value = p.day;
    fLead.value = p.daysBefore ?? 2;
    fError.classList.add('hidden');
    form.classList.remove('hidden');
    fSave.textContent = 'Save changes';
    fName.focus();
  }

  function resetForm() {
    editingId = null;
    fName.value = '';
    fAmount.value = '';
    fDay.value = '';
    fLead.value = '2';
    fError.classList.add('hidden');
    fSave.textContent = 'Save';
  }

  addBtn.addEventListener('click', () => {
    const willShow = form.classList.contains('hidden');
    if (willShow) resetForm();
    form.classList.toggle('hidden');
    if (willShow) fName.focus();
  });

  fCancel.addEventListener('click', () => {
    form.classList.add('hidden');
    resetForm();
  });

  fSave.addEventListener('click', () => {
    const name = fName.value.trim();
    const amount = parseFloat(fAmount.value);
    const day = parseInt(fDay.value, 10);
    const lead = parseInt(fLead.value || '2', 10);

    if (!name || isNaN(amount) || amount < 0 || isNaN(day) || day < 1 || day > 31) {
      fError.textContent = 'Enter a name, a valid amount, and a due day between 1 and 31.';
      fError.classList.remove('hidden');
      return;
    }
    fError.classList.add('hidden');

    if (editingId) {
      payments = payments.map((p) => (p.id === editingId ? { ...p, name, amount, day, daysBefore: lead } : p));
    } else {
      payments.push({
        id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7),
        name,
        amount,
        day,
        daysBefore: isNaN(lead) ? 2 : lead,
      });
    }

    form.classList.add('hidden');
    resetForm();
    savePayments();
    render();
    checkAndNotify();
  });

  // Re-check for due reminders whenever the tab regains focus,
  // so it stays reasonably fresh without needing a server.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      render();
      checkAndNotify();
    }
  });

  function init() {
    load();
    updateNotifBanner();
    render();
    checkAndNotify();
    setInterval(checkAndNotify, 60 * 60 * 1000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        // Non-fatal: app still works fully without the service worker.
      });
    }
  }

  init();
})();
