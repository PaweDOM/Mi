// Pobiera kursy dla tickerów z prices-tickers.txt i zapisuje je do prices.json.
// Uruchamiane przez .github/workflows/prices.yml. Najpierw Yahoo Finance,
// a jeśli się nie uda — Stooq.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const priceKey = (t) => String(t).trim().toUpperCase().replace(/[.#$[\]/]/g, '_');

const tickers = [...new Set(
  readFileSync('prices-tickers.txt', 'utf8').split('\n')
    .map((l) => l.replace(/#.*/, '').trim().toUpperCase())
    .filter(Boolean)
)];

const old = existsSync('prices.json') ? JSON.parse(readFileSync('prices.json', 'utf8')) : {};
const out = {};

async function yahoo(ticker) {
  const sym = ticker.endsWith('.US') ? ticker.slice(0, -3) : ticker;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const meta = (await res.json())?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('brak ceny');
  let { regularMarketPrice: price, currency } = meta;
  if (currency === 'GBp') { price /= 100; currency = 'GBP'; }
  return { price, currency: currency || null };
}

async function stooq(ticker) {
  let sym = ticker.toLowerCase();
  if (sym.endsWith('.wa')) sym = sym.slice(0, -3);
  else if (!sym.includes('.')) sym += '.us';
  const res = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2c&h&e=csv`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lines = (await res.text()).trim().split('\n');
  const price = parseFloat(lines[1]?.split(',').pop());
  if (!(price > 0)) throw new Error('brak ceny');
  return { price, currency: null }; // waluta z ustawień pozycji w aplikacji
}

for (const ticker of tickers) {
  const key = priceKey(ticker);
  try {
    let r;
    try { r = await yahoo(ticker); } catch (e) {
      console.warn(`${ticker}: Yahoo nie zadziałało (${e.message}), próbuję Stooq`);
      r = await stooq(ticker);
    }
    out[key] = { ticker, price: r.price, currency: r.currency, at: Date.now() };
    console.log(`${ticker}: ${r.price} ${r.currency ?? ''}`);
  } catch (e) {
    console.error(`${ticker}: nie udało się pobrać (${e.message})`);
    if (old[key]) out[key] = old[key]; // zostaw ostatni znany kurs
  }
}

writeFileSync('prices.json', JSON.stringify(out, null, 2) + '\n');
