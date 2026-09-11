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
const pantryRef = ref(db, "pantry");
const trashRef = ref(db, "trash");

setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.error('Failed to set auth persistence', e);
});

(function () {
  const NOTIFIED_KEY = 'payment-reminders:lastNotified';
  const TRASH_NOTIFIED_KEY = 'payment-reminders:trashLastNotified';
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

  // --- Section nav ---
  const navPayments = document.getElementById('nav-payments');
  const navPantry = document.getElementById('nav-pantry');
  const navTrash = document.getElementById('nav-trash');
  const sectionPayments = document.getElementById('section-payments');
  const sectionPantry = document.getElementById('section-pantry');
  const sectionTrash = document.getElementById('section-trash');

  // --- Pantry (Składzik) elements ---
  const pantryListEl = document.getElementById('pantry-list');
  const pantryEmptyEl = document.getElementById('pantry-empty');
  const pantryCountEl = document.getElementById('pantry-count');
  const pantryForm = document.getElementById('pantry-form');
  const pantryAddBtn = document.getElementById('pantry-add-btn');
  const pName = document.getElementById('p-name');
  const pAmount = document.getElementById('p-amount');
  const pUnit = document.getElementById('p-unit');
  const pantryError = document.getElementById('pantry-error');
  const pantrySave = document.getElementById('pantry-save');
  const pantryCancel = document.getElementById('pantry-cancel');
  const pantryTabList = document.getElementById('pantry-tab-list');
  const pantryTabOverview = document.getElementById('pantry-tab-overview');
  const pantryListView = document.getElementById('pantry-list-view');
  const pantryOverviewView = document.getElementById('pantry-overview-view');
  const pantryOverviewList = document.getElementById('pantry-overview-list');
  const pantryOverviewEmpty = document.getElementById('pantry-overview-empty');

  // --- Trash (Wywóz śmieci) elements ---
  const trashListEl = document.getElementById('trash-list');
  const trashEmptyEl = document.getElementById('trash-empty');
  const trashNextEl = document.getElementById('trash-next');
  const trashForm = document.getElementById('trash-form');
  const trashAddBtn = document.getElementById('trash-add-btn');
  const trashDateInput = document.getElementById('trash-date');
  const trashError = document.getElementById('trash-error');
  const trashSave = document.getElementById('trash-save');
  const trashCancel = document.getElementById('trash-cancel');
  const trashTypePicker = document.getElementById('trash-type-picker');
  const trashTabList = document.getElementById('trash-tab-list');
  const trashTabCalendar = document.getElementById('trash-tab-calendar');
  const trashListView = document.getElementById('trash-list-view');
  const trashCalendarView = document.getElementById('trash-calendar-view');
  const trashCalGrid = document.getElementById('trash-cal-grid');
  const trashCalMonthLabel = document.getElementById('trash-cal-month-label');
  const trashCalPrev = document.getElementById('trash-cal-prev');
  const trashCalNext = document.getElementById('trash-cal-next');
  const trashNotifBanner = document.getElementById('trash-notif-banner');
  const trashNotifEnable = document.getElementById('trash-notif-enable');
  const trashNotifDismiss = document.getElementById('trash-notif-dismiss');

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
  let trashLastNotified = {};
  let editingId = null;
  let selectedDay = null;
  let calCursor = new Date(); // month currently shown in the calendar view

  // --- Section nav (Płatności / Składzik / Wywóz śmieci) ---

  function showSection(name) {
    sectionPayments.classList.toggle('hidden', name !== 'payments');
    sectionPantry.classList.toggle('hidden', name !== 'pantry');
    sectionTrash.classList.toggle('hidden', name !== 'trash');
    navPayments.classList.toggle('active', name === 'payments');
    navPantry.classList.toggle('active', name === 'pantry');
    navTrash.classList.toggle('active', name === 'trash');
    if (name === 'pantry') renderPantry();
    if (name === 'trash') {
      renderTrashList();
      if (!trashCalendarView.classList.contains('hidden')) renderTrashCalendar();
    }
  }

  navPayments.addEventListener('click', () => showSection('payments'));
  navPantry.addEventListener('click', () => showSection('pantry'));
  navTrash.addEventListener('click', () => showSection('trash'));

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

  let pantryItems = [];
  let trashDates = [];

  let firebaseReady = { payments: false, paidStatus: false, pantry: false, trash: false };
  let listenersAttached = false;

  function markConnected() {
    if (firebaseReady.payments && firebaseReady.paidStatus && firebaseReady.pantry && firebaseReady.trash) {
      syncStatusEl.textContent = 'Na żywo — zsynchronizowane z każdym, kto ma otwartą tę stronę';
      syncStatusEl.className = 'sync-note live';
    }
  }

  function attachDataListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    onValue(
      pantryRef,
      (snapshot) => {
        pantryItems = objToArray(snapshot.val());
        firebaseReady.pantry = true;
        markConnected();
        if (!sectionPantry.classList.contains('hidden')) renderPantry();
      },
      (error) => {
        console.error('Firebase pantry read failed', error);
        syncStatusEl.textContent = 'Nie można połączyć się z pamięcią współdzieloną — sprawdź połączenie.';
        syncStatusEl.className = 'sync-note error';
      }
    );

    onValue(
      trashRef,
      (snapshot) => {
        trashDates = objToArray(snapshot.val());
        firebaseReady.trash = true;
        markConnected();
        renderTrashList();
        if (!trashCalendarView.classList.contains('hidden')) renderTrashCalendar();
        checkTrashNotify();
      },
      (error) => {
        console.error('Firebase trash read failed', error);
        syncStatusEl.textContent = 'Nie można połączyć się z pamięcią współdzieloną — sprawdź połączenie.';
        syncStatusEl.className = 'sync-note error';
      }
    );

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
        syncStatusEl.textContent = 'Nie można połączyć się z pamięcią współdzieloną — sprawdź połączenie.';
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
        syncStatusEl.textContent = 'Nie można połączyć się z pamięcią współdzieloną — sprawdź połączenie.';
        syncStatusEl.className = 'sync-note error';
      }
    );
  }

  async function savePayments() {
    try {
      await dbSet(paymentsRef, paymentsToObj(payments));
    } catch (e) {
      console.error('Failed to save payments', e);
      syncStatusEl.textContent = 'Zapis nie powiódł się — sprawdź połączenie i spróbuj ponownie.';
      syncStatusEl.className = 'sync-note error';
    }
  }

  async function savePaidStatus() {
    try {
      await dbSet(paidStatusRef, paidStatus);
    } catch (e) {
      console.error('Failed to save paid status', e);
      syncStatusEl.textContent = 'Zapis nie powiódł się — sprawdź połączenie i spróbuj ponownie.';
      syncStatusEl.className = 'sync-note error';
    }
  }

  async function savePantry() {
    try {
      await dbSet(pantryRef, paymentsToObj(pantryItems));
    } catch (e) {
      console.error('Failed to save pantry', e);
      syncStatusEl.textContent = 'Zapis nie powiódł się — sprawdź połączenie i spróbuj ponownie.';
      syncStatusEl.className = 'sync-note error';
    }
  }

  async function saveTrash() {
    try {
      await dbSet(trashRef, paymentsToObj(trashDates));
    } catch (e) {
      console.error('Failed to save trash dates', e);
      syncStatusEl.textContent = 'Zapis nie powiódł się — sprawdź połączenie i spróbuj ponownie.';
      syncStatusEl.className = 'sync-note error';
    }
  }

  function loadLocalOnly() {
    try {
      lastNotified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    } catch (e) {
      lastNotified = {};
    }
    try {
      trashLastNotified = JSON.parse(localStorage.getItem(TRASH_NOTIFIED_KEY) || '{}');
    } catch (e) {
      trashLastNotified = {};
    }
  }

  function saveLastNotified() {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(lastNotified));
  }

  function saveTrashLastNotified() {
    localStorage.setItem(TRASH_NOTIFIED_KEY, JSON.stringify(trashLastNotified));
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
      chip.textContent = label === 'All' ? 'Wszystkie' : label;
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
    calMonthLabel.textContent = calCursor.toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric',
    });

    calGrid.innerHTML = '';
    const dowNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
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
        const label = d <= 0 ? (d === 0 ? 'termin dziś' : 'zaległa płatność') : `termin za ${d} ${d === 1 ? 'dzień' : 'dni'}`;
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
    if (paidStatus[key]) return { label: 'Opłacone', cls: 'success' };
    const d = daysUntilPayment(payment);
    if (d <= 0) return { label: d === 0 ? 'Termin dziś' : 'Zaległe', cls: 'danger' };
    if (d <= (payment.daysBefore ?? 5)) return { label: `Termin za ${d} ${d === 1 ? 'dzień' : 'dni'}`, cls: 'warning' };
    return { label: `Termin za ${d} dni`, cls: 'muted' };
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
      const freqLabel = (p.frequency || 1) > 1 ? `co ${p.frequency} miesiące` : 'co miesiąc';

      const row = document.createElement('div');
      row.className = 'payment-row';
      row.innerHTML = `
        <div class="payment-top">
          <div>
            <p class="payment-name">${escapeHtml(p.name)}</p>
            <p class="payment-detail">${fmt(p.amount)} · dzień ${p.day} · ${freqLabel}</p>
            ${p.notes ? `<p class="payment-notes">${escapeHtml(p.notes)}</p>` : ''}
            <span class="person-tag ${personTagClass(person)}">${escapeHtml(person)}</span>
          </div>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div class="payment-actions">
          <div class="action-btns">
            <button class="edit-btn" data-id="${p.id}">Edytuj</button>
            <button class="del-btn" data-id="${p.id}">Usuń</button>
          </div>
          <button class="pay-btn" data-id="${p.id}">${isPaid ? 'Oznacz jako nieopłacone' : 'Oznacz jako opłacone'}</button>
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
    fSave.textContent = 'Zapisz zmiany';
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
    dayPickerSelected.textContent = 'brak';
    dayPicker.querySelectorAll('button').forEach((btn) => btn.classList.remove('selected'));
    fLead.value = '2';
    fError.classList.add('hidden');
    fSave.textContent = 'Zapisz';
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
      fError.textContent = 'Podaj nazwę, prawidłową kwotę i wybierz dzień płatności powyżej.';
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
      if (!sectionPantry.classList.contains('hidden')) renderPantry();
      if (!sectionTrash.classList.contains('hidden')) {
        renderTrashList();
        if (!trashCalendarView.classList.contains('hidden')) renderTrashCalendar();
      }
      checkTrashNotify();
    }
  });

  // ============================= SKŁADZIK (Pantry) =============================

  let editingPantryId = null;

  function pantryKey(name, unit) {
    return `${name.trim().toLowerCase()}|${(unit || '').trim().toLowerCase()}`;
  }

  function renderPantry() {
    pantryListEl.innerHTML = '';
    pantryCountEl.textContent = String(pantryItems.length);
    pantryEmptyEl.classList.toggle('hidden', pantryItems.length !== 0);

    const sorted = [...pantryItems].sort((a, b) => a.name.localeCompare(b.name, 'pl'));

    sorted.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'payment-row';
      row.innerHTML = `
        <div class="payment-top">
          <div>
            <p class="payment-name">${escapeHtml(item.name)}</p>
            <p class="payment-detail">${item.amount}${item.unit ? ' ' + escapeHtml(item.unit) : ''}</p>
          </div>
        </div>
        <div class="payment-actions">
          <div class="action-btns">
            <button class="pantry-edit-btn" data-id="${item.id}">Edytuj</button>
            <button class="pantry-del-btn" data-id="${item.id}">Usuń</button>
          </div>
        </div>
      `;
      pantryListEl.appendChild(row);
    });

    pantryListEl.querySelectorAll('.pantry-edit-btn').forEach((btn) =>
      btn.addEventListener('click', () => editPantryItem(btn.dataset.id))
    );
    pantryListEl.querySelectorAll('.pantry-del-btn').forEach((btn) =>
      btn.addEventListener('click', () => deletePantryItem(btn.dataset.id))
    );

    renderPantryOverview();
  }

  function renderPantryOverview() {
    pantryOverviewList.innerHTML = '';
    const groups = {};
    pantryItems.forEach((item) => {
      const key = pantryKey(item.name, item.unit);
      if (!groups[key]) groups[key] = { name: item.name, unit: item.unit, total: 0, count: 0 };
      groups[key].total += Number(item.amount) || 0;
      groups[key].count += 1;
    });

    const groupList = Object.values(groups).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    pantryOverviewEmpty.classList.toggle('hidden', groupList.length !== 0);

    groupList.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'payment-row';
      row.innerHTML = `
        <div class="payment-top">
          <div>
            <p class="payment-name">${escapeHtml(g.name)}</p>
            <p class="payment-detail">Razem: ${g.total}${g.unit ? ' ' + escapeHtml(g.unit) : ''} · ${g.count} ${g.count === 1 ? 'wpis' : 'wpisy'}</p>
          </div>
        </div>
      `;
      pantryOverviewList.appendChild(row);
    });
  }

  function editPantryItem(id) {
    const item = pantryItems.find((x) => x.id === id);
    if (!item) return;
    editingPantryId = id;
    pName.value = item.name;
    pAmount.value = item.amount;
    pUnit.value = item.unit || '';
    pantryError.classList.add('hidden');
    pantryForm.classList.remove('hidden');
    pantrySave.textContent = 'Zapisz zmiany';
    pName.focus();
  }

  function resetPantryForm() {
    editingPantryId = null;
    pName.value = '';
    pAmount.value = '';
    pUnit.value = '';
    pantryError.classList.add('hidden');
    pantrySave.textContent = 'Zapisz';
  }

  function deletePantryItem(id) {
    pantryItems = pantryItems.filter((p) => p.id !== id);
    renderPantry();
    savePantry();
  }

  pantryAddBtn.addEventListener('click', () => {
    const willShow = pantryForm.classList.contains('hidden');
    if (willShow) resetPantryForm();
    pantryForm.classList.toggle('hidden');
    if (willShow) pName.focus();
  });

  pantryCancel.addEventListener('click', () => {
    pantryForm.classList.add('hidden');
    resetPantryForm();
  });

  pantrySave.addEventListener('click', () => {
    const name = pName.value.trim();
    const amount = parseFloat(pAmount.value);
    const unit = pUnit.value.trim();

    if (!name || isNaN(amount) || amount < 0) {
      pantryError.textContent = 'Podaj nazwę produktu i prawidłową ilość.';
      pantryError.classList.remove('hidden');
      return;
    }
    pantryError.classList.add('hidden');

    if (editingPantryId) {
      pantryItems = pantryItems.map((p) => (p.id === editingPantryId ? { ...p, name, amount, unit } : p));
    } else {
      pantryItems.push({
        id: 'i' + Date.now() + Math.random().toString(36).slice(2, 7),
        name,
        amount,
        unit,
      });
    }

    pantryForm.classList.add('hidden');
    resetPantryForm();
    renderPantry();
    savePantry();
  });

  pantryTabList.addEventListener('click', () => {
    pantryTabList.classList.add('active');
    pantryTabOverview.classList.remove('active');
    pantryListView.classList.remove('hidden');
    pantryOverviewView.classList.add('hidden');
  });

  pantryTabOverview.addEventListener('click', () => {
    pantryTabOverview.classList.add('active');
    pantryTabList.classList.remove('active');
    pantryOverviewView.classList.remove('hidden');
    pantryListView.classList.add('hidden');
    renderPantryOverview();
  });

  // ============================= WYWÓZ ŚMIECI (Trash) =============================

  const TRASH_TYPES = {
    bio: { label: 'BIO', cls: 'bio' },
    zmieszane: { label: 'Zmieszane', cls: 'zmieszane' },
    segregowane: { label: 'Segregowane', cls: 'segregowane' },
  };

  let editingTrashId = null;
  let selectedTrashType = null;
  let trashCalCursor = new Date();

  function dateOnly(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseIsoDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function daysUntilDate(iso) {
    const today = dateOnly(new Date());
    const target = parseIsoDate(iso);
    return Math.round((target - today) / 86400000);
  }

  function buildTrashTypePicker() {
    trashTypePicker.querySelectorAll('.trash-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedTrashType = btn.dataset.type;
        trashTypePicker.querySelectorAll('.trash-type-btn').forEach((b) =>
          b.classList.toggle('selected', b.dataset.type === selectedTrashType)
        );
      });
    });
  }

  function upcomingTrashDates() {
    return trashDates.filter((t) => daysUntilDate(t.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderTrashList() {
    trashListEl.innerHTML = '';
    const upcoming = upcomingTrashDates();
    trashEmptyEl.classList.toggle('hidden', trashDates.length !== 0);

    if (upcoming.length > 0) {
      const next = upcoming[0];
      const d = daysUntilDate(next.date);
      const label = d === 0 ? 'dziś' : d === 1 ? 'jutro' : `za ${d} dni`;
      trashNextEl.textContent = `${TRASH_TYPES[next.type]?.label || next.type} — ${label}`;
    } else {
      trashNextEl.textContent = '—';
    }

    const allSorted = [...trashDates].sort((a, b) => a.date.localeCompare(b.date));

    allSorted.forEach((t) => {
      const d = daysUntilDate(t.date);
      const isPast = d < 0;
      const dateObj = parseIsoDate(t.date);
      const dateLabel = dateObj.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
      const typeInfo = TRASH_TYPES[t.type] || { label: t.type, cls: '' };

      const row = document.createElement('div');
      row.className = 'payment-row';
      row.style.opacity = isPast ? '0.5' : '1';
      row.innerHTML = `
        <div class="payment-top">
          <div>
            <p class="payment-name">${dateLabel}</p>
            <span class="trash-badge ${typeInfo.cls}">${typeInfo.label}</span>
          </div>
        </div>
        <div class="payment-actions">
          <div class="action-btns">
            <button class="trash-edit-btn" data-id="${t.id}">Edytuj</button>
            <button class="trash-del-btn" data-id="${t.id}">Usuń</button>
          </div>
        </div>
      `;
      trashListEl.appendChild(row);
    });

    trashListEl.querySelectorAll('.trash-edit-btn').forEach((btn) =>
      btn.addEventListener('click', () => editTrashDate(btn.dataset.id))
    );
    trashListEl.querySelectorAll('.trash-del-btn').forEach((btn) =>
      btn.addEventListener('click', () => deleteTrashDate(btn.dataset.id))
    );
  }

  function renderTrashCalendar() {
    const year = trashCalCursor.getFullYear();
    const month = trashCalCursor.getMonth();
    trashCalMonthLabel.textContent = trashCalCursor.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

    trashCalGrid.innerHTML = '';
    const dowNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
    dowNames.forEach((name) => {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = name;
      trashCalGrid.appendChild(el);
    });

    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    for (let i = 0; i < firstDow; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell empty';
      trashCalGrid.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      if (isCurrentMonth && today.getDate() === day) cell.classList.add('today');

      const dateEl = document.createElement('p');
      dateEl.className = 'cal-date';
      dateEl.textContent = day;
      cell.appendChild(dateEl);

      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      trashDates
        .filter((t) => t.date === iso)
        .forEach((t) => {
          const typeInfo = TRASH_TYPES[t.type] || { label: t.type, cls: '' };
          const pill = document.createElement('span');
          pill.className = `cal-pill trash-${typeInfo.cls}`;
          pill.textContent = typeInfo.label;
          cell.appendChild(pill);
        });

      trashCalGrid.appendChild(cell);
    }
  }

  trashCalPrev.addEventListener('click', () => {
    trashCalCursor = new Date(trashCalCursor.getFullYear(), trashCalCursor.getMonth() - 1, 1);
    renderTrashCalendar();
  });
  trashCalNext.addEventListener('click', () => {
    trashCalCursor = new Date(trashCalCursor.getFullYear(), trashCalCursor.getMonth() + 1, 1);
    renderTrashCalendar();
  });

  function editTrashDate(id) {
    const t = trashDates.find((x) => x.id === id);
    if (!t) return;
    editingTrashId = id;
    selectedTrashType = t.type;
    trashTypePicker.querySelectorAll('.trash-type-btn').forEach((b) =>
      b.classList.toggle('selected', b.dataset.type === t.type)
    );
    trashDateInput.value = t.date;
    trashError.classList.add('hidden');
    trashForm.classList.remove('hidden');
    trashSave.textContent = 'Zapisz zmiany';
  }

  function resetTrashForm() {
    editingTrashId = null;
    selectedTrashType = null;
    trashTypePicker.querySelectorAll('.trash-type-btn').forEach((b) => b.classList.remove('selected'));
    trashDateInput.value = '';
    trashError.classList.add('hidden');
    trashSave.textContent = 'Zapisz';
  }

  function deleteTrashDate(id) {
    trashDates = trashDates.filter((t) => t.id !== id);
    renderTrashList();
    if (!trashCalendarView.classList.contains('hidden')) renderTrashCalendar();
    saveTrash();
  }

  trashAddBtn.addEventListener('click', () => {
    const willShow = trashForm.classList.contains('hidden');
    if (willShow) resetTrashForm();
    trashForm.classList.toggle('hidden');
  });

  trashCancel.addEventListener('click', () => {
    trashForm.classList.add('hidden');
    resetTrashForm();
  });

  trashSave.addEventListener('click', () => {
    const type = selectedTrashType;
    const date = trashDateInput.value;

    if (!type || !date) {
      trashError.textContent = 'Wybierz typ i datę.';
      trashError.classList.remove('hidden');
      return;
    }
    trashError.classList.add('hidden');

    if (editingTrashId) {
      trashDates = trashDates.map((t) => (t.id === editingTrashId ? { ...t, type, date } : t));
    } else {
      trashDates.push({
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
        type,
        date,
      });
    }

    trashForm.classList.add('hidden');
    resetTrashForm();
    renderTrashList();
    if (!trashCalendarView.classList.contains('hidden')) renderTrashCalendar();
    saveTrash();
    checkTrashNotify();
  });

  trashTabList.addEventListener('click', () => {
    trashTabList.classList.add('active');
    trashTabCalendar.classList.remove('active');
    trashListView.classList.remove('hidden');
    trashCalendarView.classList.add('hidden');
  });

  trashTabCalendar.addEventListener('click', () => {
    trashTabCalendar.classList.add('active');
    trashTabList.classList.remove('active');
    trashCalendarView.classList.remove('hidden');
    trashListView.classList.add('hidden');
    renderTrashCalendar();
  });

  async function updateTrashNotifBanner() {
    const dismissed = localStorage.getItem('payment-reminders:trashBannerDismissed') === '1';
    const supported = 'Notification' in window;
    const show = supported && Notification.permission === 'default' && !dismissed;
    trashNotifBanner.classList.toggle('hidden', !show);
  }

  trashNotifEnable.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    updateNotifBanner();
    updateTrashNotifBanner();
  });

  trashNotifDismiss.addEventListener('click', () => {
    localStorage.setItem('payment-reminders:trashBannerDismissed', '1');
    updateTrashNotifBanner();
  });

  function checkTrashNotify() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const todayStr = new Date().toDateString();
    let changed = false;

    trashDates.forEach((t) => {
      const d = daysUntilDate(t.date);
      const notifKey = t.id;
      if (d === 1 && trashLastNotified[notifKey] !== todayStr) {
        const typeInfo = TRASH_TYPES[t.type] || { label: t.type };
        new Notification('Wywóz śmieci jutro', { body: `${typeInfo.label} — jutro jest dzień wywozu.` });
        trashLastNotified[notifKey] = todayStr;
        changed = true;
      }
    });

    if (changed) saveTrashLastNotified();
  }

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
      loginError.textContent = 'Wpisz hasło domowe.';
      loginError.classList.remove('hidden');
      return;
    }
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Logowanie…';
    try {
      await signInWithEmailAndPassword(auth, HOUSEHOLD_EMAIL, password);
      loginError.classList.add('hidden');
    } catch (e) {
      console.error('Login failed', e);
      loginError.textContent = 'Nieprawidłowe hasło. Spróbuj ponownie.';
      loginError.classList.remove('hidden');
    }
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Zaloguj się';
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
    buildTrashTypePicker();
    updateNotifBanner();
    updateTrashNotifBanner();
    setInterval(checkAndNotify, 60 * 60 * 1000);
    setInterval(checkTrashNotify, 60 * 60 * 1000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        // Non-fatal: app still works fully without the service worker.
      });
    }
  }

  init();
})();
