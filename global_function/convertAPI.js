import { getToken } from './localStorage';
import { getCurrencyRates, saveCurrencyRates, getCurrencyUpdatedDate, saveCurrencyUpdatedDate, clearCurrencyCache} from './localStorage';

export const BASE_URL = 'http://dcs5604.com/ngjiale';

// ExchangeRate-API key
const CURRENCY_API = '901ab17792a2e3a41d9e8f7a';
const API_WEB = 'https://v6.exchangerate-api.com/v6';

// Helper: 'YYYY-MM-DD' in UTC
function toUtcDate(when = new Date()){
  return when.toISOString().slice(0,10);
}
// Parse "Mon, 25 Aug 2025 00:00:01 +0000" -> 'YYYY-MM-DD'
function utcHeaderToDateString(utcStr){
  const d = new Date(utcStr);
  return isNaN(d.getTime()) ? null : toUtcDate(d);
}

export async function ensureRatesUpToDate(baseCode = 'USD'){
  const todayUtc = toUtcDate(new Date());
  const cachedDate = await getCurrencyUpdatedDate();
  const cached = await getCurrencyRates(); // read once; may be null

  // If we already have today's rates, use them immediately.
  if (cachedDate === todayUtc && cached?.conversion_rates) {
    return cached;
  }

  const base = (baseCode || 'USD').toUpperCase();
  const url = `${API_WEB}/${CURRENCY_API}/latest/${encodeURIComponent(base)}`;

  try {
    const res = await fetch(url);
    const raw = await res.text();
    let json;
    try { json = raw ? JSON.parse(raw) : null; } catch {
      // Non-JSON from API (gateway errors, HTML, etc.)
      if (cached) return cached;   
      throw new Error(`FX non-JSON (status ${res.status})`);
    }

    // API returned an error payload
    if (!res.ok || json?.result !== 'success') {
      const et = json?.error_type;
      if (cached) return cached;    
      if (et === 'invalid-key') throw new Error('Currency API key invalid or revoked.');
      if (et === 'quota-reached') throw new Error('Currency API quota reached.');
      throw new Error(et || `FX HTTP ${res.status}`);
    }

    // Success: store and return
    const apiDate = utcHeaderToDateString(json.time_last_update_utc) || todayUtc;
    await saveCurrencyRates(json);
    await saveCurrencyUpdatedDate(apiDate);
    return json;

  } catch (e) {
    // Network failure / fetch threw
    if (cached) return cached;               // graceful offline fallback
    throw e;                                 // nothing cached, surface the error
  }
}

export async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { ...options, headers });
  const raw = await res.text();

  let json;
  try { json = raw ? JSON.parse(raw) : null; }
  catch {
    throw new Error(`Non-JSON from server (status ${res.status}): ${raw.slice(0,200)}`);
  }
  if (!res.ok) {
    throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
  }
  return json || {};
}

export function normalizeRates(apiJson, baseCode = "USD") {
  if (!apiJson?.conversion_rates) return null;
  const table = apiJson.conversion_rates; 

  const rates = {};
  for (const [code, val] of Object.entries(table)) {
    // "val" = how many <code> per 1 USD
    // Need: how many <code> per 1 <baseCode>
    rates[code] = val / table[baseCode];
  }
  rates[baseCode] = 1;
  return rates;
}
