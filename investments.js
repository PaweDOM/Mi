// ============================= FUNDUSZ → INWESTYCJE =============================
//
// ETF-y, akcje i obligacje skarbowe. Dane w Firebase:
//
//   investments/<id>   — jedna pozycja:
//     ETF / akcja: { id, kind: 'etf'|'stock', ticker, name, desc, currency,
//                    lots: { <lotId>: { id, date, units, spentPln } },
//                    manualPrice: { price, at } | null }
//     obligacja:   { id, kind: 'bond', bondType, purchaseDate, count,
//                    rates: [procent w 1. roku, w 2. roku, ...], margin }
//
//   prices/<klucz>     — aktualne kursy zapisywane przez funkcję Firebase
//                        (functions-snippet/investments-prices.js):
//                        { ticker, price, currency, at }
//
// Kwoty "wydano" są zawsze w złotówkach. Kurs EUR/USD → PLN bierzemy z NBP
// (ten sam, który już ładuje Skarbiec).

export const ETF_PRESETS = [
  { ticker: 'VWCE.DE', name: 'FTSE All-World', desc: 'Vanguard, UCITS, ACC, EUR', currency: 'EUR' },
  { ticker: 'SXR8.DE', name: 'S&P 500', desc: 'iShares, UCITS, ACC, EUR', currency: 'EUR' },
  { ticker: 'SXRV.DE', name: 'NASDAQ 100', desc: 'iShares, UCITS, ACC, EUR', currency: 'EUR' },
];

// months: czas do wykupu; mode: jak liczą się odsetki;
// indexed: od 2. roku procent = inflacja + marża (trzeba go co rok wpisać).
export const BOND_TYPES = {
  OTS: { label: 'OTS, 3-miesięczne', months: 3, mode: 'maturity', indexed: false },
  ROR: { label: 'ROR, roczne', months: 12, mode: 'monthly', indexed: false },
  DOR: { label: 'DOR, 2-letnie', months: 24, mode: 'monthly', indexed: false },
  TOS: { label: 'TOS, 3-letnie', months: 36, mode: 'capitalize', indexed: false },
  COI: { label: 'COI, 4-letnie', months: 48, mode: 'yearly', indexed: true },
  EDO: { label: 'EDO, 10-letnie', months: 120, mode: 'capitalize', indexed: true },
  ROS: { label: 'ROS, 6-letnie rodzinne', months: 72, mode: 'capitalize', indexed: true },
  ROD: { label: 'ROD, 12-letnie rodzinne', months: 144, mode: 'capitalize', indexed: true },
};

const CURRENCY_SIGN = { EUR: '€', USD: '$', PLN: 'zł' };
const BOND_NOMINAL = 100;
const DAY = 24 * 60 * 60 * 1000;

// ---------- helpers (exported for tests) ----------

// Polski format liczb ZAWSZE z odstępem tysięcy (toLocaleString w pl-PL
// nie grupuje liczb 4-cyfrowych, przez co „3154,00” stało obok „37 165,22”).
export function formatPl(n, digits = 2, trimZeros = false) {
  const num = Number(n);
  if (!isFinite(num)) return '—';
  let s = Math.abs(num).toFixed(digits);
  if (trimZeros && s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return (num < 0 && Number(s) !== 0 ? '-' : '') + grouped + (dec ? ',' + dec : '');
}

export function priceKey(ticker) {
  return String(ticker || '').trim().toUpperCase().replace(/[.#$[\]/]/g, '_');
}

export function parseNum(v) {
  if (v == null) return NaN;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  if (s === '') return NaN;
  return Number(s);
}

export function parseIso(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMonths(date, n) {
  const y = date.getFullYear();
  const m = date.getMonth() + n;
  const target = new Date(y, m, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthsElapsed(start, today) {
  let n = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (addMonths(start, n) > startOfDay(today)) n -= 1;
  return Math.max(0, n);
}

export function normRates(rates) {
  if (!rates) return [];
  if (Array.isArray(rates)) return rates.map((r) => (r == null || r === '' ? null : Number(r)));
  // Firebase zwraca rzadką tablicę jako obiekt { "0": 5.6, "2": 4.1 }
  const out = [];
  Object.keys(rates).forEach((k) => { out[Number(k)] = rates[k] == null ? null : Number(rates[k]); });
  for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
  return out;
}

// Stan jednej pozycji obligacji na dany dzień. Wartości dla wszystkich sztuk.
// Szacunek bez podatku Belki; odsetki w okresie naliczane liniowo.
export function bondState(bond, today = new Date()) {
  const t = BOND_TYPES[bond.bondType];
  const count = Number(bond.count) || 0;
  const rates = normRates(bond.rates);
  const start = parseIso(bond.purchaseDate);
  const maturity = addMonths(start, t.months);
  const now = startOfDay(today);
  const end = now < maturity ? now : maturity;
  const matured = now >= maturity;

  const rateFor = (i) => {
    for (let k = Math.min(i, rates.length - 1); k >= 0; k--) {
      if (rates[k] != null && !isNaN(rates[k])) return rates[k];
    }
    return 0;
  };

  let value = BOND_NOMINAL;
  let earned = 0;

  if (t.mode === 'maturity') {
    const r = rateFor(0);
    const frac = Math.max(0, daysBetween(start, end)) / Math.max(1, daysBetween(start, maturity));
    earned = BOND_NOMINAL * (r / 100) * (t.months / 12) * frac;
    value = BOND_NOMINAL + earned;
  } else {
    let base = BOND_NOMINAL;
    let accrued = 0;
    for (let i = 0; ; i++) {
      const pStart = addMonths(start, 12 * i);
      if (pStart >= end) break;
      const pEndRaw = addMonths(start, 12 * (i + 1));
      const pEnd = pEndRaw < maturity ? pEndRaw : maturity;
      const r = rateFor(i) / 100;
      const full = end >= pEnd;
      const frac = full ? 1 : daysBetween(pStart, end) / Math.max(1, daysBetween(pStart, pEnd));
      if (t.mode === 'capitalize') {
        if (full) base *= 1 + r;
        else accrued = base * r * frac;
      } else {
        // yearly (COI) i monthly (ROR/DOR): odsetki są wypłacane, nominał stały
        earned += BOND_NOMINAL * r * frac;
      }
    }
    if (t.mode === 'capitalize') {
      value = base + accrued;
      earned = value - BOND_NOMINAL;
    } else if (matured) {
      value = BOND_NOMINAL;
    } else if (t.mode === 'yearly') {
      const i = Math.floor(monthsElapsed(start, end) / 12);
      const pStart = addMonths(start, 12 * i);
      const pEnd = addMonths(start, 12 * (i + 1));
      value = BOND_NOMINAL + BOND_NOMINAL * (rateFor(i) / 100) * daysBetween(pStart, end) / Math.max(1, daysBetween(pStart, pEnd));
    } else {
      const m = monthsElapsed(start, end);
      const mStart = addMonths(start, m);
      const i = Math.floor(m / 12);
      value = BOND_NOMINAL + BOND_NOMINAL * (rateFor(i) / 100) * daysBetween(mStart, end) / 365;
    }
  }

  const periodIndex = t.mode === 'maturity' ? 0 : Math.floor(monthsElapsed(start, end) / 12);
  const needsRate = t.indexed && !matured && periodIndex >= 1 && (rates[periodIndex] == null || isNaN(rates[periodIndex]));
  const nextChangeRaw = addMonths(start, 12 * (periodIndex + 1));
  const nextChange = t.mode !== 'maturity' && t.indexed && nextChangeRaw < maturity ? nextChangeRaw : null;

  return {
    type: t,
    count,
    paid: BOND_NOMINAL * count,
    value: value * count,
    earned: earned * count,
    currentRate: rateFor(periodIndex),
    periodIndex,
    periodStart: addMonths(start, 12 * periodIndex),
    needsRate,
    nextChange,
    maturity,
    matured,
  };
}

export function holdingTotals(h) {
  const lots = h.lots ? Object.values(h.lots) : [];
  let units = 0;
  let spent = 0;
  lots.forEach((l) => { units += Number(l.units) || 0; spent += Number(l.spentPln) || 0; });
  return { lots, units, spent };
}

// ---------- UI ----------

export function createInvestments(deps) {
  const {
    db, ref, onValue, dbSet, container, getRates, fmt, escapeHtml,
    onTotalChange, onSyncError,
  } = deps;

  const investmentsRef = ref(db, 'investments');
  const pricesRef = ref(db, 'prices');

  let items = [];
  let prices = {};
  let expandedId = null;
  let formKind = 'etf';
  let listening = false;

  const pl = (n, digits = 2) => formatPl(n, digits);
  const plUnits = (n) => formatPl(n, 6, true);
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pl(Math.abs(n));
  const signedPct = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pl(Math.abs(n), 1) + '%';
  const dateLong = (d) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateShort = (d) => d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const newId = (p) => p + Date.now() + Math.random().toString(36).slice(2, 7);

  container.innerHTML = `
    <div id="inv-rate-banner" class="banner hidden"></div>
    <div class="inv-toolbar">
      <p id="inv-asof" class="inv-asof"></p>
      <button id="inv-add-btn" class="primary">Dodaj</button>
    </div>

    <div id="inv-form" class="form hidden">
      <div class="seg" id="inv-kind-picker">
        <button type="button" data-kind="etf">ETF</button>
        <button type="button" data-kind="stock">Akcja</button>
        <button type="button" data-kind="bond">Obligacja</button>
      </div>

      <div id="inv-etf-fields">
        <label class="field-label" for="inv-preset">Fundusz</label>
        <select id="inv-preset" class="select">
          ${ETF_PRESETS.map((p, i) => `<option value="${i}">${escapeHtml(p.name)} (${p.ticker})</option>`).join('')}
          <option value="other">Inny ETF…</option>
        </select>
      </div>

      <div id="inv-custom-fields" class="hidden">
        <div class="row">
          <div class="col">
            <label class="field-label" for="inv-ticker">Ticker</label>
            <input type="text" id="inv-ticker" placeholder="np. PZU.WA" autocapitalize="characters" />
          </div>
          <div class="col">
            <label class="field-label" for="inv-currency">Waluta notowań</label>
            <select id="inv-currency" class="select">
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <label class="field-label" for="inv-name">Nazwa</label>
        <input type="text" id="inv-name" placeholder="np. PZU" />
        <label class="field-label" for="inv-desc">Opis (opcjonalnie)</label>
        <input type="text" id="inv-desc" placeholder="np. GPW, PLN" />
        <p class="hint">Ticker jak na Yahoo Finance: akcje z GPW z końcówką .WA (np. PKN.WA), z Xetry .DE.</p>
      </div>

      <div id="inv-lot-fields">
        <div class="row">
          <div class="col">
            <label class="field-label" for="inv-units">Jednostki</label>
            <input type="text" id="inv-units" inputmode="decimal" placeholder="np. 0,5421" />
          </div>
          <div class="col">
            <label class="field-label" for="inv-spent">Zapłacono (zł)</label>
            <input type="text" id="inv-spent" inputmode="decimal" placeholder="np. 300,00" />
          </div>
        </div>
        <label class="field-label" for="inv-date">Data zakupu</label>
        <input type="date" id="inv-date" />
      </div>

      <div id="inv-bond-fields" class="hidden">
        <label class="field-label" for="inv-bond-type">Rodzaj</label>
        <select id="inv-bond-type" class="select">
          ${Object.keys(BOND_TYPES).map((k) => `<option value="${k}"${k === 'EDO' ? ' selected' : ''}>${BOND_TYPES[k].label}</option>`).join('')}
        </select>
        <div class="row">
          <div class="col">
            <label class="field-label" for="inv-bond-count">Liczba (1 szt. = 100 zł)</label>
            <input type="text" id="inv-bond-count" inputmode="numeric" placeholder="np. 50" />
          </div>
          <div class="col">
            <label class="field-label" for="inv-bond-date">Data zakupu</label>
            <input type="date" id="inv-bond-date" />
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label class="field-label" for="inv-bond-rate">Procent w 1. okresie</label>
            <input type="text" id="inv-bond-rate" inputmode="decimal" placeholder="np. 5,60" />
          </div>
          <div class="col" id="inv-bond-margin-col">
            <label class="field-label" for="inv-bond-margin">Marża ponad inflację</label>
            <input type="text" id="inv-bond-margin" inputmode="decimal" placeholder="np. 1,50" />
          </div>
        </div>
      </div>

      <p id="inv-error" class="error hidden"></p>
      <div class="row end">
        <button id="inv-cancel" type="button">Anuluj</button>
        <button id="inv-save" type="button" class="primary">Zapisz</button>
      </div>
    </div>

    <div id="inv-table" class="ledger hidden"></div>
    <p id="inv-empty" class="empty hidden">Nie masz jeszcze inwestycji. Dodaj pierwszy zakup przyciskiem „Dodaj”.</p>
    <p id="inv-fx" class="inv-fx"></p>
  `;

  const $ = (id) => container.querySelector('#' + id);
  const el = {
    banner: $('inv-rate-banner'), asof: $('inv-asof'), addBtn: $('inv-add-btn'), form: $('inv-form'),
    kindPicker: $('inv-kind-picker'), etfFields: $('inv-etf-fields'), preset: $('inv-preset'),
    customFields: $('inv-custom-fields'), ticker: $('inv-ticker'), currency: $('inv-currency'),
    name: $('inv-name'), desc: $('inv-desc'), lotFields: $('inv-lot-fields'), units: $('inv-units'),
    spent: $('inv-spent'), date: $('inv-date'), bondFields: $('inv-bond-fields'), bondType: $('inv-bond-type'),
    bondCount: $('inv-bond-count'), bondDate: $('inv-bond-date'), bondRate: $('inv-bond-rate'),
    bondMarginCol: $('inv-bond-margin-col'), bondMargin: $('inv-bond-margin'), error: $('inv-error'),
    cancel: $('inv-cancel'), save: $('inv-save'), table: $('inv-table'), empty: $('inv-empty'), fx: $('inv-fx'),
  };

  // ---------- persistence ----------

  function attach() {
    if (listening) return;
    listening = true;
    onValue(investmentsRef, (snap) => {
      const v = snap.val();
      items = v ? Object.values(v) : [];
      render();
    }, (e) => { console.error('Firebase investments read failed', e); onSyncError && onSyncError(); });
    onValue(pricesRef, (snap) => {
      prices = snap.val() || {};
      render();
    }, (e) => { console.error('Firebase prices read failed', e); });
  }

  async function save() {
    const obj = {};
    items.forEach((i) => { obj[i.id] = i; });
    try {
      await dbSet(investmentsRef, obj);
    } catch (e) {
      console.error('Failed to save investments', e);
      onSyncError && onSyncError();
    }
  }

  // ---------- valuation ----------

  function fxToPln(currency) {
    if (!currency || currency === 'PLN') return 1;
    const r = getRates() || {};
    if (currency === 'EUR') return r.eurPln || null;
    if (currency === 'USD') return r.usdPln || null;
    return null;
  }

  function priceInfo(h) {
    const p = prices[priceKey(h.ticker)];
    if (p && typeof p.price === 'number') return { price: p.price, currency: p.currency || h.currency, at: p.at, source: 'auto' };
    if (h.manualPrice && typeof h.manualPrice.price === 'number') return { price: h.manualPrice.price, currency: h.currency, at: h.manualPrice.at, source: 'manual' };
    return null;
  }

  function valueHolding(h) {
    const t = holdingTotals(h);
    const pi = priceInfo(h);
    const fx = pi ? fxToPln(pi.currency) : null;
    const value = pi && fx ? t.units * pi.price * fx : null;
    return { ...t, pi, fx, value };
  }

  function computeAll() {
    const today = new Date();
    let total = 0;
    let spent = 0;
    let missing = false;
    const groups = { etf: [], stock: [], bond: [] };
    items.forEach((h) => {
      if (h.kind === 'bond') {
        if (!BOND_TYPES[h.bondType]) return;
        const st = bondState(h, today);
        groups.bond.push({ h, st });
        total += st.value;
        spent += st.paid;
      } else {
        const v = valueHolding(h);
        (groups[h.kind] || groups.etf).push({ h, v });
        if (v.value == null) { if (v.units > 0) missing = true; return; }
        total += v.value;
        spent += v.spent;
      }
    });
    groups.etf.sort((a, b) => (b.v.value || 0) - (a.v.value || 0));
    groups.stock.sort((a, b) => (b.v.value || 0) - (a.v.value || 0));
    groups.bond.sort((a, b) => a.h.purchaseDate.localeCompare(b.h.purchaseDate));
    return { total, spent, gain: total - spent, missing, groups };
  }

  // ---------- render ----------

  function gainHtml(value, spent) {
    if (value == null || !spent) return '';
    const g = value - spent;
    const cls = g > 0 ? 'pos' : g < 0 ? 'neg' : '';
    return `<span class="num ledger-gain ${cls}">${signed(g)} (${signedPct((g / spent) * 100)})</span>`;
  }

  function holdingRow(h, v) {
    const cur = CURRENCY_SIGN[h.currency] || h.currency;
    const priceTxt = v.pi
      ? `kurs ${pl(v.pi.price)} ${CURRENCY_SIGN[v.pi.currency] || v.pi.currency}${v.pi.source === 'manual' ? ', ręcznie' : ''}`
      : 'brak kursu';
    const unitsTxt = h.kind === 'stock' ? `${plUnits(v.units)} szt.` : plUnits(v.units);
    const sub = [h.ticker, h.desc].filter(Boolean).join(', ');
    const open = expandedId === h.id;
    return `
      <div class="ledger-item${open ? ' open' : ''}">
        <button class="ledger-row" data-toggle="${h.id}" aria-expanded="${open}">
          <span class="ledger-main">
            <span class="ledger-title">${escapeHtml(h.name || h.ticker)}</span>
            <span class="ledger-sub">${escapeHtml(sub)}</span>
            <span class="ledger-faint num">(wydano ${pl(v.spent)} zł, ${priceTxt})</span>
          </span>
          <span class="ledger-qty num">${unitsTxt}</span>
          <span class="ledger-val">
            <span class="num ledger-amount">${v.value != null ? pl(v.value) : '—'}</span>
            ${gainHtml(v.value, v.spent)}
          </span>
        </button>
        ${open ? holdingDetail(h, v, cur) : ''}
      </div>`;
  }

  function holdingDetail(h, v, cur) {
    const lots = [...v.lots].sort((a, b) => b.date.localeCompare(a.date));
    const avg = v.units ? v.spent / v.units : 0;
    return `
      <div class="ledger-detail">
        <dl class="kv">
          <div><dt>Średnio za jednostkę</dt><dd class="num">${pl(avg)} zł</dd></div>
          ${v.pi && v.fx ? `<div><dt>Cena teraz</dt><dd class="num">${pl(v.pi.price * v.fx)} zł${v.pi.currency !== 'PLN' ? ` <span class="faint">(${pl(v.pi.price)} ${CURRENCY_SIGN[v.pi.currency] || ''} po ${pl(v.fx, 4)})</span>` : ''}</dd></div>` : ''}
        </dl>
        <p class="detail-heading">Zakupy</p>
        <div class="lots">
          ${lots.length ? lots.map((l) => `
            <div class="lot">
              <div>
                <p class="lot-date">${dateLong(parseIso(l.date))}</p>
                <p class="faint num">(${pl(l.units ? l.spentPln / l.units : 0)} zł za jednostkę)</p>
              </div>
              <div class="lot-right">
                <p class="num lot-units">${plUnits(l.units)} j.</p>
                <p class="num faint">${pl(l.spentPln)} zł</p>
              </div>
              <button class="link-danger" data-del-lot="${h.id}|${l.id}" aria-label="Usuń zakup z ${dateShort(parseIso(l.date))}">Usuń</button>
            </div>`).join('') : '<p class="faint">Brak zakupów.</p>'}
        </div>
        <p class="detail-heading">Nowy zakup</p>
        <div class="row">
          <div class="col"><label class="field-label" for="lot-units-${h.id}">Jednostki</label><input type="text" inputmode="decimal" id="lot-units-${h.id}" placeholder="np. 0,5421" /></div>
          <div class="col"><label class="field-label" for="lot-spent-${h.id}">Zapłacono (zł)</label><input type="text" inputmode="decimal" id="lot-spent-${h.id}" placeholder="np. 300,00" /></div>
        </div>
        <label class="field-label" for="lot-date-${h.id}">Data zakupu</label>
        <input type="date" id="lot-date-${h.id}" value="${toIso(new Date())}" />
        <p class="error hidden" id="lot-error-${h.id}"></p>
        <div class="row end"><button class="primary" data-add-lot="${h.id}">Dodaj zakup</button></div>

        <p class="detail-heading">Cena ręcznie</p>
        <p class="hint">Używana tylko, gdy nie ma kursu pobranego automatycznie.</p>
        <div class="row manual-row">
          <input type="text" inputmode="decimal" id="manual-price-${h.id}" placeholder="cena w ${escapeHtml(h.currency)}" value="${h.manualPrice ? String(h.manualPrice.price).replace('.', ',') : ''}" />
          <button data-manual-price="${h.id}">Zapisz cenę</button>
        </div>
        <div class="row end"><button class="link-danger" data-del-item="${h.id}">Usuń całą pozycję</button></div>
      </div>`;
  }

  function bondRow(h, st) {
    const open = expandedId === h.id;
    const marginTxt = st.type.indexed && h.margin != null && h.margin !== '' ? `inflacja + ${pl(h.margin)}%, ` : '';
    const status = st.matured
      ? `<span class="ledger-flag ok">Wykupione ${dateShort(st.maturity)}</span>`
      : st.needsRate
        ? `<span class="ledger-flag warn">Wpisz procent od ${dateShort(st.periodStart)}</span>`
        : st.nextChange
          ? `<span class="ledger-faint">Nowy procent od ${dateShort(st.nextChange)}</span>`
          : '';
    return `
      <div class="ledger-item${open ? ' open' : ''}">
        <button class="ledger-row" data-toggle="${h.id}" aria-expanded="${open}">
          <span class="ledger-main">
            <span class="ledger-title">${escapeHtml(st.type.label)}</span>
            <span class="ledger-sub">${marginTxt}wykup ${dateShort(st.maturity)}</span>
            <span class="ledger-faint num">(wpłacono ${pl(st.paid)} zł, ${pl(st.currentRate)}% w tym okresie)</span>
            ${status}
          </span>
          <span class="ledger-qty num">${st.count} szt.</span>
          <span class="ledger-val">
            <span class="num ledger-amount">${pl(st.value)}</span>
            ${st.earned ? `<span class="num ledger-gain ${st.earned > 0 ? 'pos' : 'neg'}">${signed(st.earned)} (${signedPct((st.earned / st.paid) * 100)})</span>` : ''}
          </span>
        </button>
        ${open ? bondDetail(h, st) : ''}
      </div>`;
  }

  function bondDetail(h, st) {
    const rates = normRates(h.rates);
    const lastIdx = st.type.mode === 'maturity' ? 0 : Math.min(st.periodIndex, Math.ceil(st.type.months / 12) - 1);
    const start = parseIso(h.purchaseDate);
    let rows = '';
    for (let i = 0; i <= lastIdx; i++) {
      const from = addMonths(start, 12 * i);
      const val = rates[i] != null ? String(rates[i]).replace('.', ',') : '';
      rows += `
        <div class="rate-row">
          <label class="field-label" for="rate-${h.id}-${i}">${st.type.mode === 'maturity' ? 'Oprocentowanie' : `Rok ${i + 1} (od ${dateShort(from)})`}</label>
          <input type="text" inputmode="decimal" id="rate-${h.id}-${i}" data-rate-idx="${i}" value="${val}" placeholder="np. ${i === 0 ? '5,60' : '6,10'}" />
        </div>`;
    }
    const payoutNote = st.type.mode === 'yearly'
      ? 'Odsetki COI są wypłacane co rok na konto, więc wartość to 100 zł za sztukę plus odsetki z bieżącego roku. Zysk obejmuje też odsetki już wypłacone.'
      : st.type.mode === 'monthly'
        ? 'Odsetki są wypłacane co miesiąc. Jeśli procent się zmienił, wpisz go dla właściwego roku.'
        : '';
    return `
      <div class="ledger-detail">
        <dl class="kv">
          <div><dt>Zakup</dt><dd>${dateLong(start)}</dd></div>
          <div><dt>Wykup</dt><dd>${dateLong(st.maturity)}</dd></div>
          <div><dt>Odsetki do dziś</dt><dd class="num">${pl(st.earned)} zł</dd></div>
        </dl>
        <p class="hint">Wartość szacunkowa, przed podatkiem Belki i bez opłaty za wcześniejszy wykup.${payoutNote ? ' ' + payoutNote : ''}</p>
        <p class="detail-heading">Oprocentowanie</p>
        ${st.type.indexed && h.margin != null ? `<p class="hint">Od 2. roku: inflacja z GUS + marża ${pl(h.margin)}%. Dokładny procent zobaczysz na koncie obligacji.</p>` : ''}
        <div class="rates" data-rates-for="${h.id}">${rows}</div>
        <p class="error hidden" id="rate-error-${h.id}"></p>
        <div class="row end"><button class="primary" data-save-rates="${h.id}">Zapisz oprocentowanie</button></div>
        <div class="row end"><button class="link-danger" data-del-item="${h.id}">Usuń obligacje</button></div>
      </div>`;
  }

  function groupHtml(title, total, rowsHtml) {
    if (!rowsHtml) return '';
    return `
      <div class="ledger-group">
        <p>${title}</p><p class="num">${pl(total)} zł</p>
      </div>
      ${rowsHtml}`;
  }

  function render() {
    const c = computeAll();
    onTotalChange && onTotalChange({ total: c.total, spent: c.spent, gain: c.gain });

    const etfRows = c.groups.etf.map(({ h, v }) => holdingRow(h, v)).join('');
    const stockRows = c.groups.stock.map(({ h, v }) => holdingRow(h, v)).join('');
    const bondRows = c.groups.bond.map(({ h, st }) => bondRow(h, st)).join('');
    const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

    const html = groupHtml('ETF', sum(c.groups.etf, (x) => x.v.value), etfRows)
      + groupHtml('Akcje', sum(c.groups.stock, (x) => x.v.value), stockRows)
      + groupHtml('Obligacje skarbowe', sum(c.groups.bond, (x) => x.st.value), bondRows);

    el.empty.classList.toggle('hidden', items.length !== 0);
    el.table.classList.toggle('hidden', items.length === 0);
    el.table.innerHTML = items.length ? `
      <div class="ledger-head"><p>Walor</p><p>Liczba</p><p>Wartość</p></div>
      ${html}` : '';

    // kiedy kursy
    const ats = items.filter((h) => h.kind !== 'bond')
      .map((h) => prices[priceKey(h.ticker)] && prices[priceKey(h.ticker)].at)
      .filter(Boolean);
    if (ats.length) {
      const oldest = new Date(Math.min(...ats));
      el.asof.textContent = `Kursy z ${oldest.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}, ${oldest.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      el.asof.textContent = items.some((h) => h.kind !== 'bond') ? 'Brak kursów automatycznych' : '';
    }
    const r = getRates() || {};
    el.fx.textContent = r.eurPln ? `Kurs EUR/PLN ${pl(r.eurPln, 4)} (NBP)${c.missing ? '. Niektóre pozycje bez kursu nie są wliczone do sumy.' : ''}` : (c.missing ? 'Niektóre pozycje bez kursu nie są wliczone do sumy.' : '');

    // obligacje do aktualizacji
    const needing = c.groups.bond.filter((x) => x.st.needsRate);
    el.banner.classList.toggle('hidden', needing.length === 0);
    if (needing.length) {
      el.banner.textContent = `Wpisz nowe oprocentowanie: ${needing.map((x) => `${x.h.bondType} (od ${dateShort(x.st.periodStart)})`).join(', ')}. Znajdziesz je na koncie obligacji, a tutaj stuknij w wiersz.`;
    }

    wireTable();
  }

  function showErr(node, msg) {
    if (!node) return;
    node.textContent = msg;
    node.classList.remove('hidden');
  }

  function wireTable() {
    el.table.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      expandedId = expandedId === b.dataset.toggle ? null : b.dataset.toggle;
      render();
    }));
    el.table.querySelectorAll('[data-del-lot]').forEach((b) => b.addEventListener('click', () => {
      const [hid, lid] = b.dataset.delLot.split('|');
      const h = items.find((x) => x.id === hid);
      if (!h || !h.lots) return;
      if (!confirm('Usunąć ten zakup?')) return;
      delete h.lots[lid];
      render(); save();
    }));
    el.table.querySelectorAll('[data-add-lot]').forEach((b) => b.addEventListener('click', () => {
      const hid = b.dataset.addLot;
      const h = items.find((x) => x.id === hid);
      const units = parseNum(container.querySelector(`#lot-units-${hid}`).value);
      const spent = parseNum(container.querySelector(`#lot-spent-${hid}`).value);
      const date = container.querySelector(`#lot-date-${hid}`).value;
      const err = container.querySelector(`#lot-error-${hid}`);
      if (!(units > 0)) return showErr(err, 'Wpisz liczbę jednostek, np. 0,5421.');
      if (!(spent >= 0)) return showErr(err, 'Wpisz kwotę w złotych, np. 300,00.');
      if (!date) return showErr(err, 'Wybierz datę zakupu.');
      const lid = newId('lot');
      h.lots = h.lots || {};
      h.lots[lid] = { id: lid, date, units, spentPln: spent };
      render(); save();
    }));
    el.table.querySelectorAll('[data-manual-price]').forEach((b) => b.addEventListener('click', () => {
      const hid = b.dataset.manualPrice;
      const h = items.find((x) => x.id === hid);
      const raw = container.querySelector(`#manual-price-${hid}`).value;
      const price = parseNum(raw);
      h.manualPrice = raw.trim() === '' ? null : (price > 0 ? { price, at: Date.now() } : h.manualPrice);
      render(); save();
    }));
    el.table.querySelectorAll('[data-save-rates]').forEach((b) => b.addEventListener('click', () => {
      const hid = b.dataset.saveRates;
      const h = items.find((x) => x.id === hid);
      const rates = normRates(h.rates);
      let bad = false;
      container.querySelectorAll(`[data-rates-for="${hid}"] [data-rate-idx]`).forEach((inp) => {
        const i = Number(inp.dataset.rateIdx);
        const v = inp.value.trim();
        if (v === '') { rates[i] = null; return; }
        const n = parseNum(v);
        if (isNaN(n) || n < 0 || n > 50) { bad = true; return; }
        rates[i] = n;
      });
      if (bad) return showErr(container.querySelector(`#rate-error-${hid}`), 'Wpisz procent jako liczbę, np. 5,60.');
      if (rates[0] == null) return showErr(container.querySelector(`#rate-error-${hid}`), 'Procent w 1. roku jest wymagany.');
      for (let i = 0; i < rates.length; i++) if (rates[i] === undefined) rates[i] = null;
      h.rates = rates;
      render(); save();
    }));
    el.table.querySelectorAll('[data-del-item]').forEach((b) => b.addEventListener('click', () => {
      const hid = b.dataset.delItem;
      const h = items.find((x) => x.id === hid);
      const label = h.kind === 'bond' ? `obligacje ${h.bondType}` : (h.name || h.ticker);
      if (!confirm(`Usunąć ${label} razem z historią zakupów?`)) return;
      items = items.filter((x) => x.id !== hid);
      expandedId = null;
      render(); save();
    }));
  }

  // ---------- add form ----------

  function setKind(kind) {
    formKind = kind;
    el.kindPicker.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', b.dataset.kind === kind));
    el.etfFields.classList.toggle('hidden', kind !== 'etf');
    el.customFields.classList.toggle('hidden', !(kind === 'stock' || (kind === 'etf' && el.preset.value === 'other')));
    el.lotFields.classList.toggle('hidden', kind === 'bond');
    el.bondFields.classList.toggle('hidden', kind !== 'bond');
    if (kind === 'stock') {
      el.currency.value = 'PLN';
      el.ticker.placeholder = 'np. PZU.WA';
      el.name.placeholder = 'np. PZU';
      el.desc.placeholder = 'np. GPW, PLN';
    } else {
      el.currency.value = 'EUR';
      el.ticker.placeholder = 'np. EUNL.DE';
      el.name.placeholder = 'np. MSCI World';
      el.desc.placeholder = 'np. iShares, UCITS, ACC, EUR';
    }
    updateMargin();
  }

  function updateMargin() {
    const t = BOND_TYPES[el.bondType.value];
    el.bondMarginCol.classList.toggle('hidden', !t.indexed);
  }

  function resetForm() {
    el.error.classList.add('hidden');
    [el.ticker, el.name, el.desc, el.units, el.spent, el.bondCount, el.bondRate, el.bondMargin].forEach((i) => { i.value = ''; });
    el.preset.value = '0';
    el.bondType.value = 'EDO';
    el.date.value = toIso(new Date());
    el.bondDate.value = toIso(new Date());
    setKind('etf');
  }

  el.kindPicker.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind)));
  el.preset.addEventListener('change', () => setKind('etf'));
  el.bondType.addEventListener('change', updateMargin);
  el.addBtn.addEventListener('click', () => {
    const show = el.form.classList.contains('hidden');
    if (show) resetForm();
    el.form.classList.toggle('hidden');
  });
  el.cancel.addEventListener('click', () => { el.form.classList.add('hidden'); });

  el.save.addEventListener('click', () => {
    const err = (m) => showErr(el.error, m);
    el.error.classList.add('hidden');

    if (formKind === 'bond') {
      const count = parseInt(String(el.bondCount.value).replace(/\s/g, ''), 10);
      const rate = parseNum(el.bondRate.value);
      const margin = parseNum(el.bondMargin.value);
      const t = BOND_TYPES[el.bondType.value];
      if (!(count > 0)) return err('Wpisz liczbę obligacji, np. 50.');
      if (!el.bondDate.value) return err('Wybierz datę zakupu.');
      if (isNaN(rate) || rate < 0) return err('Wpisz oprocentowanie w 1. okresie, np. 5,60.');
      if (t.indexed && isNaN(margin)) return err('Wpisz marżę, np. 1,50. Jest w warunkach emisji.');
      items.push({
        id: newId('bd'), kind: 'bond', bondType: el.bondType.value, purchaseDate: el.bondDate.value,
        count, rates: [rate], margin: t.indexed ? margin : null,
      });
    } else {
      let meta;
      if (formKind === 'etf' && el.preset.value !== 'other') {
        meta = ETF_PRESETS[Number(el.preset.value)];
      } else {
        const ticker = el.ticker.value.trim().toUpperCase();
        if (!ticker) return err('Wpisz ticker, np. PZU.WA.');
        meta = { ticker, name: el.name.value.trim() || ticker, desc: el.desc.value.trim(), currency: el.currency.value };
      }
      const units = parseNum(el.units.value);
      const spent = parseNum(el.spent.value);
      if (!(units > 0)) return err('Wpisz liczbę jednostek, np. 0,5421.');
      if (!(spent >= 0)) return err('Wpisz kwotę w złotych, np. 300,00.');
      if (!el.date.value) return err('Wybierz datę zakupu.');
      const lid = newId('lot');
      const lot = { id: lid, date: el.date.value, units, spentPln: spent };
      const existing = items.find((x) => x.kind !== 'bond' && priceKey(x.ticker) === priceKey(meta.ticker));
      if (existing) {
        existing.lots = existing.lots || {};
        existing.lots[lid] = lot;
      } else {
        items.push({
          id: newId('iv'), kind: formKind, ticker: meta.ticker, name: meta.name, desc: meta.desc || '',
          currency: meta.currency, lots: { [lid]: lot }, manualPrice: null,
        });
      }
    }
    el.form.classList.add('hidden');
    render(); save();
  });

  resetForm();

  return { attach, render };
}
