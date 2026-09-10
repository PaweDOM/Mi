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
  const fLead = document.getElementById('f-lead');
  const fError = document.getElementById('f-error');
  const fSave = document.getElementById('f-save');
  const fCancel = document.getElementById('f-cancel');
  const banner = document.getElementById('notif-banner');
  const notifEnable = document.getElementById('notif-enable');
  const notifDismiss = document.getElementById('notif-dismiss');

  const tabList = document.getElementById('tab-list');
  const tabCalendar = document.getElementById('tab-calendar');
  const listView = document.getElementById('list-view');
  const calendarView = document.getElementById('calendar-view');
  const dayPicker = document.getElementById('day-picker');
  const dayPickerSelected = document.getElementById('day-picker-selected');
  const calGrid = document.getElementById('cal-grid');
  const calMonthLabel = document.getElementById('cal-month-label');
  const calPrev = document.getElementById('cal-prev');
  const calNext = document.getElementById('cal-next');

  let payments = [];
  let paidStatus = {};
  let lastNotified = {};
  let editingId = null;
  let selectedDay = null;
  let calCursor = new Date(); // month currently shown in the calendar view

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

  // --- Day picker (grid of 1-31 for choosing a due day) ---

  function buildDayPicker() {
    dayPicker.innerHTML = '';
    for (let d = 1; d <= 31; d++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = d;
      btn.dataset.day = d;
      btn.addEventListener('click', () => selectDay(d));
      dayPicker.appendChild(btn);
    }
  }

  function selectDay(d) {
    selectedDay = d;
    dayPickerSelected.textContent = d;
    dayPicker.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('selected', Number(btn.dataset.day) === d);
    });
  }

  // --- Tabs ---

  function showListView() {
    tabList.classList.add('active');
    tabCalendar.classList.remove('active');
    listView.classList.remove('hidden');
    calendarView.classList.add('hidden');
  }

  function showCalendarView() {
    tabCalendar.classList.add('active');
    tabList.classList.remove('active');
    calendarView.classList.remove('hidden');
    listView.classList.add('hidden');
    renderCalendar();
  }

  tabList.addEventListener('click', showListView);
  tabCalendar.addEventListener('click', showCalendarView);

  // --- Calendar month view ---

  function renderCalendar() {
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    calMonthLabel.textContent = calCursor.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });

    calGrid.innerHTML = '';
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dowNames.forEach((name) => {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = name;
      calGrid.appendChild(el);
    });

    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const key = monthKey(new Date(year, month, 1));

    for (let i = 0; i < firstDow; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell empty';
      calGrid.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      if (isCurrentMonth && today.getDate() === day) cell.classList.add('today');

      const dateEl = document.createElement('p');
      dateEl.className = 'cal-date';
      dateEl.textContent = day;
      cell.appendChild(dateEl);

      payments
        .filter((p) => p.day === day)
        .forEach((p) => {
          const paidKey = `${key}:${p.id}`;
          const isPaid = !!paidStatus[paidKey];
          let cls = 'muted';
          if (isPaid) {
            cls = 'success';
          } else if (isCurrentMonth) {
            const d = daysUntil(p.day);
            if (d <= 0) cls = 'danger';
            else if (d <= (p.daysBefore ?? 5)) cls = 'warning';
          }
          const pill = document.createElement('span');
          pill.className = `cal-pill ${cls}`;
          pill.textContent = p.name;
          pill.title = `${p.name} — ${fmt(p.amount)}`;
          cell.appendChild(pill);
        });

      calGrid.appendChild(cell);
    }
  }

  calPrev.addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
  });

  calNext.addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
  });

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
    if (!calendarView.classList.contains('hidden')) renderCalendar();
  }

  function deletePayment(id) {
    payments = payments.filter((p) => p.id !== id);
    savePayments();
    render();
    if (!calendarView.classList.contains('hidden')) renderCalendar();
  }

  function editPayment(id) {
    const p = payments.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    fName.value = p.name;
    fAmount.value = p.amount;
    selectDay(p.day);
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
    selectedDay = null;
    dayPickerSelected.textContent = 'none';
    dayPicker.querySelectorAll('button').forEach((btn) => btn.classList.remove('selected'));
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
    const day = selectedDay;
    const lead = parseInt(fLead.value || '2', 10);

    if (!name || isNaN(amount) || amount < 0 || !day) {
      fError.textContent = 'Enter a name, a valid amount, and pick a due day on the calendar above.';
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
    if (!calendarView.classList.contains('hidden')) renderCalendar();
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
    buildDayPicker();
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
