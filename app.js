import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set as dbSet,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQqsm2QzuZykRlngOsRmr--IeTGTynZCY",
  authDomain: "payment-reminders-d9e7f.firebaseapp.com",
  databaseURL: "https://payment-reminders-d9e7f-default-rtdb.firebaseio.com",
  projectId: "payment-reminders-d9e7f",
  storageBucket: "payment-reminders-d9e7f.firebasestorage.app",
  messagingSenderId: "57500988928",
  appId: "1:57500988928:web:77894f486bcc48f66acae5",
};

// The app uses one shared household account rather than per-person accounts.
// This email is just an identifier for that one Firebase Auth user — it
// doesn't need to be a real inbox. Create it once in Firebase console →
// Authentication → Users, with whatever password you choose there.
const HOUSEHOLD_EMAIL = "household@payment-reminders.local";

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);
const paymentsRef = ref(db, "payments");
const paidStatusRef = ref(db, "paidStatus");

setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.error('Failed to set auth persistence', e);
});

(function () {
  const NOTIFIED_KEY = 'payment-reminders:lastNotified';
  const BANNER_DISMISSED_KEY = 'payment-reminders:notifBannerDismissed';

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const totalEl = document.getElementById('total');
  const form = document.getElementById('form');
  const addBtn = document.getElementById('add-btn');
  const fName = document.getElementById('f-name');
  const fAmount = document.getElementById('f-amount');
  const fNotes = document.getElementById('f-notes');
  const fPerson = document.getElementById('f-person');
  const fFrequency = document.getElementById('f-frequency');
  const fLead = document.getElementById('f-lead');
  const fError = document.getElementById('f-error');
  const fSave = document.getElementById('f-save');
  const fCancel = document.getElementById('f-cancel');
  const banner = document.getElementById('notif-banner');
  const notifEnable = document.getElementById('notif-enable');
  const notifDismiss = document.getElementById('notif-dismiss');
  const filterChipsEl = document.getElementById('filter-chips');
  const syncStatusEl = document.getElementById('sync-status');
  const loginScreen = document.getElementById('login-screen');
  const appRoot = document.getElementById('app-root');
  const loginPassword = document.getElementById('login-password');
  const loginSubmit = document.getElementById('login-submit');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const PEOPLE = ['Paweł', 'Marta', 'Ogólne'];
  let activeFilter = 'All';

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

  // Whether a payment (with its frequency and anchor month) falls due in a given year/month.
  function isDueInMonth(payment, year, month) {
    const interval = payment.frequency || 1;
    if (interval <= 1) return true;
    const now = new Date();
    const anchor = (payment.anchorYear ?? now.getFullYear()) * 12 + (payment.anchorMonth ?? now.getMonth());
    const target = year * 12 + month;
    const diff = target - anchor;
    return diff >= 0 && diff % interval === 0;
  }

  // Finds this payment's next due date (today or later), honoring its frequency.
  function nextOccurrence(payment) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    const today = new Date(year, month, now.getDate());
    for (let i = 0; i < 36; i++) {
      if (isDueInMonth(payment, year, month)) {
        const due = new Date(year, month, payment.day);
        if (due >= today) return due;
      }
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }
    return null;
  }

  function daysUntilPayment(payment) {
    const occ = nextOccurrence(payment);
    if (!occ) return 9999;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((occ - today) / 86400000);
  }

  function occurrenceKey(payment) {
    const occ = nextOccurrence(payment);
    return occ ? `${monthKey(occ)}:${payment.id}` : `${monthKey()}:${payment.id}`;
  }

  function personTagClass(person) {
    if (person === 'Paweł') return 'tag-pawel';
    if (person === 'Marta') return 'tag-marta';
    return 'tag-ogolne';
  }

  function fmt(n) {
    return Number(n).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Persistence ---
  //
  // payments and paidStatus live in Firebase Realtime Database and sync
  // live between anyone with this site open. lastNotified and the banner
  // dismissal are per-device UI bookkeeping and stay in localStorage.

  function paymentsToObj(arr) {
    const obj = {};
    arr.forEach((p) => { obj[p.id] = p; });
    return obj;
  }

  function objToArray(obj) {
    return obj ? Object.values(obj) : [];
  }

  let firebaseReady = { payments: false, paidStatus: false };
  let listenersAttached = false;

  function markConnected() {
    if (firebaseReady.payments && firebaseReady.paidStatus) {
      syncStatusEl.textContent = 'Live — synced with anyone who has this site open';
      syncStatusEl.className = 'sync-note live';
    }
  }

  function attachDataListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    onValue(
      paymentsRef,
      (snapshot) => {
        payments = objToArray(snapshot.val());
        firebaseReady.payments = true;
        markConnected();
        render();
        if (!calendarView.classList.contains('hidden')) renderCalendar();
        checkAndNotify();
      },
      (error) => {
        console.error('Firebase payments read failed', error);
        syncStatusEl.textContent = 'Could not connect to shared storage — check your connection.';
        syncStatusEl.className = 'sync-note error';
      }
    );

    onValue(
      paidStatusRef,
      (snapshot) => {
        paidStatus = snapshot.val() || {};
        firebaseReady.paidStatus = true;
        markConnected();
        render();
        if (!calendarView.classList.contains('hidden')) renderCalendar();
      },
      (error) => {
        console.error('Firebase paidStatus read failed', error);
        syncStatusEl.textContent = 'Could not connect to shared storage — check your connection.';
        syncStatusEl.className = 'sync-note error';
      }
    );
  }

  async function savePayments() {
    try {
      await dbSet(paymentsRef, paymentsToObj(payments));
    } catch (e) {
      console.error('Failed to save payments', e);
      syncStatusEl.textContent = 'Save failed — check your connection and try again.';
      syncStatusEl.className = 'sync-note error';
    }
  }

  async function savePaidStatus() {
    try {
      await dbSet(paidStatusRef, paidStatus);
    } catch (e) {
      console.error('Failed to save paid status', e);
      syncStatusEl.textContent = 'Save failed — check your connection and try again.';
      syncStatusEl.className = 'sync-note error';
    }
  }

  function loadLocalOnly() {
    try {
      lastNotified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    } catch (e) {
      lastNotified = {};
    }
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

  // --- Filter chips (by person) ---

  function buildFilterChips() {
    filterChipsEl.innerHTML = '';
    ['All', ...PEOPLE].forEach((label) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (activeFilter === label ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => {
        activeFilter = label;
        buildFilterChips();
        render();
        if (!calendarView.classList.contains('hidden')) renderCalendar();
      });
      filterChipsEl.appendChild(chip);
    });
  }

  function filteredPayments() {
    if (activeFilter === 'All') return payments;
    return payments.filter((p) => (p.person || 'Ogólne') === activeFilter);
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

      filteredPayments()
        .filter((p) => p.day === day && isDueInMonth(p, year, month))
        .forEach((p) => {
          const paidKey = `${key}:${p.id}`;
          const isPaid = !!paidStatus[paidKey];
          let cls = 'muted';
          if (isPaid) {
            cls = 'success';
          } else if (isCurrentMonth) {
            const d = daysUntilPayment(p);
            if (d <= 0) cls = 'danger';
            else if (d <= (p.daysBefore ?? 5)) cls = 'warning';
          }
          const pill = document.createElement('span');
          pill.className = `cal-pill ${cls}`;
          pill.textContent = p.name;
          pill.title = `${p.name} — ${fmt(p.amount)} — ${p.person || 'Ogólne'}${p.notes ? ' — ' + p.notes : ''}`;
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
    const todayStr = new Date().toDateString();
    let changed = false;

    payments.forEach((p) => {
      const paidKey = occurrenceKey(p);
      if (paidStatus[paidKey]) return;

      const d = daysUntilPayment(p);
      const leadTime = p.daysBefore ?? 2;
      const notifKey = `${paidKey}:notified`;

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
    const key = occurrenceKey(payment);
    if (paidStatus[key]) return { label: 'Paid', cls: 'success' };
    const d = daysUntilPayment(payment);
    if (d <= 0) return { label: d === 0 ? 'Due today' : 'Overdue', cls: 'danger' };
    if (d <= (payment.daysBefore ?? 5)) return { label: `Due in ${d} day${d === 1 ? '' : 's'}`, cls: 'warning' };
    return { label: `Due in ${d} days`, cls: 'muted' };
  }

  function render() {
    listEl.innerHTML = '';
    const visible = filteredPayments();
    emptyEl.classList.toggle('hidden', visible.length !== 0);

    let total = 0;
    const sorted = [...visible].sort((a, b) => daysUntilPayment(a) - daysUntilPayment(b));

    sorted.forEach((p) => {
      total += Number(p.amount);
      const st = statusFor(p);
      const isPaid = st.cls === 'success';
      const person = p.person || 'Ogólne';
      const freqLabel = (p.frequency || 1) > 1 ? `every ${p.frequency} months` : 'monthly';

      const row = document.createElement('div');
      row.className = 'payment-row';
      row.innerHTML = `
        <div class="payment-top">
          <div>
            <p class="payment-name">${escapeHtml(p.name)}</p>
            <p class="payment-detail">${fmt(p.amount)} · due day ${p.day} · ${freqLabel}</p>
            ${p.notes ? `<p class="payment-notes">${escapeHtml(p.notes)}</p>` : ''}
            <span class="person-tag ${personTagClass(person)}">${escapeHtml(person)}</span>
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

    // Total reflects only payments due this calendar month (bi-monthly bills
    // not due this month aren't counted toward "this month's total").
    total = visible.reduce((sum, p) => {
      const now = new Date();
      return isDueInMonth(p, now.getFullYear(), now.getMonth()) ? sum + Number(p.amount) : sum;
    }, 0);
    totalEl.textContent = fmt(total);

    listEl.querySelectorAll('.pay-btn').forEach((btn) => btn.addEventListener('click', () => togglePaid(btn.dataset.id)));
    listEl.querySelectorAll('.del-btn').forEach((btn) => btn.addEventListener('click', () => deletePayment(btn.dataset.id)));
    listEl.querySelectorAll('.edit-btn').forEach((btn) => btn.addEventListener('click', () => editPayment(btn.dataset.id)));
  }

  function togglePaid(id) {
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;
    const key = occurrenceKey(payment);
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
    fNotes.value = p.notes || '';
    fPerson.value = p.person || 'Ogólne';
    fFrequency.value = String(p.frequency || 1);
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
    fNotes.value = '';
    fPerson.value = 'Ogólne';
    fFrequency.value = '1';
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
    const notes = fNotes.value.trim();
    const day = selectedDay;
    const lead = parseInt(fLead.value || '2', 10);
    const person = fPerson.value;
    const frequency = parseInt(fFrequency.value, 10) || 1;

    if (!name || isNaN(amount) || amount < 0 || !day) {
      fError.textContent = 'Enter a name, a valid amount, and pick a due day on the calendar above.';
      fError.classList.remove('hidden');
      return;
    }
    fError.classList.add('hidden');

    if (editingId) {
      payments = payments.map((p) => {
        if (p.id !== editingId) return p;
        const next = { ...p, name, amount, day, daysBefore: lead, person, frequency, notes };
        // If the frequency changed on an existing bill, re-anchor to the
        // current month so "every 2 months" starts counting from now.
        if ((p.frequency || 1) !== frequency) {
          const now = new Date();
          next.anchorYear = now.getFullYear();
          next.anchorMonth = now.getMonth();
        }
        return next;
      });
    } else {
      const now = new Date();
      payments.push({
        id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7),
        name,
        amount,
        day,
        daysBefore: isNaN(lead) ? 2 : lead,
        person,
        frequency,
        notes,
        anchorYear: now.getFullYear(),
        anchorMonth: now.getMonth(),
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

  // --- Login / logout ---

  function showApp() {
    loginScreen.classList.add('hidden');
    appRoot.classList.remove('hidden');
  }

  function showLogin() {
    appRoot.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginPassword.value = '';
    loginError.classList.add('hidden');
    loginPassword.focus();
  }

  async function attemptLogin() {
    const password = loginPassword.value;
    if (!password) {
      loginError.textContent = 'Enter the household password.';
      loginError.classList.remove('hidden');
      return;
    }
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Logging in…';
    try {
      await signInWithEmailAndPassword(auth, HOUSEHOLD_EMAIL, password);
      loginError.classList.add('hidden');
    } catch (e) {
      console.error('Login failed', e);
      loginError.textContent = 'Incorrect password. Try again.';
      loginError.classList.remove('hidden');
    }
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Log in';
  }

  loginSubmit.addEventListener('click', attemptLogin);
  loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Sign out failed', e);
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      showApp();
      attachDataListeners();
    } else {
      showLogin();
    }
  });

  function init() {
    loadLocalOnly();
    buildDayPicker();
    buildFilterChips();
    updateNotifBanner();
    setInterval(checkAndNotify, 60 * 60 * 1000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        // Non-fatal: app still works fully without the service worker.
      });
    }
  }

  init();
})();
