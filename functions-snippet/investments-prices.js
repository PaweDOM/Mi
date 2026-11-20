// =====================================================================
// Fundusz → Inwestycje: funkcja do DOPISANIA do Twojego istniejącego
// pliku functions/index.js (tego, w którym jest checkAndSendReminders).
//
// NIE wdrażaj tego folderu osobno: `firebase deploy` z innego folderu
// usunąłby Twoje obecne funkcje. Skopiuj wszystko poniżej linii
// „KOPIUJ OD TEGO MIEJSCA” na koniec functions/index.js.
//
// updateInvestmentPrices: co godzinę pobiera kursy ETF-ów i akcji
// z Yahoo Finance i zapisuje je w bazie pod /prices. Nie wysyła żadnych
// powiadomień. Bez niej kurs można wpisać ręcznie w aplikacji.
//
// Wymaga Node 18 lub nowszego (wbudowane fetch). Jeśli Twój index.js
// używa `import` zamiast `require`, zamień dwie linie require na:
//   import { onSchedule } from "firebase-functions/v2/scheduler";
//   import admin from "firebase-admin";
// i usuń `exports.` → zostaw `export const`.
// =====================================================================

// ----- KOPIUJ OD TEGO MIEJSCA -----

const { onSchedule: onScheduleInv } = require("firebase-functions/v2/scheduler");
const adminInv = require("firebase-admin"); // initializeApp() masz już wyżej w pliku


function invPriceKey(ticker) {
  return String(ticker || "").trim().toUpperCase().replace(/[.#$[\]/]/g, "_");
}

async function fetchYahooPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (household app)" } });
  if (!res.ok) throw new Error(`Yahoo ${ticker}: HTTP ${res.status}`);
  const data = await res.json();
  const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error(`Yahoo ${ticker}: brak ceny`);
  return { price: meta.regularMarketPrice, currency: meta.currency || null };
}

exports.updateInvestmentPrices = onScheduleInv(
  { schedule: "every 60 minutes", timeZone: "Europe/Warsaw" },
  async () => {
    const db = adminInv.database();
    const snap = await db.ref("investments").get();
    const items = snap.exists() ? Object.values(snap.val()) : [];
    const tickers = [...new Set(items.filter((i) => i.kind !== "bond" && i.ticker).map((i) => i.ticker.trim().toUpperCase()))];
    for (const ticker of tickers) {
      try {
        const { price, currency } = await fetchYahooPrice(ticker);
        await db.ref(`prices/${invPriceKey(ticker)}`).set({ ticker, price, currency, at: Date.now() });
      } catch (e) {
        console.error("Price update failed", ticker, e.message);
      }
    }
  }
);
