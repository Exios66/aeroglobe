/**
 * Parse departure fallback data from either JSON (preferred) or BTS CSV format.
 * Returns the same schema: { meta, routes, byMonth, byHour }.
 * Use JSON for production (small size); CSV is supported for one-off or conversion.
 */

/**
 * Parse a numeric value from CSV; default if empty/invalid.
 * @param {string} s
 * @param {number} def
 * @returns {number}
 */
function parseNum(s, def = 0) {
  if (s == null || (typeof s === "string" && s.trim() === "")) return def;
  const n = parseFloat(String(s).replace(/"/g, "").trim());
  return Number.isFinite(n) ? n : def;
}

/**
 * 95th percentile of an array of numbers.
 * @param {number[]} values
 * @returns {number}
 */
function p95(values) {
  if (!values?.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const k = (n - 1) * 0.95;
  const f = Math.floor(k);
  const c = f + 1 < n ? f + 1 : f;
  return sorted[f] + (k - f) * (sorted[c] - sorted[f]);
}

/**
 * Parse BTS CSV text into the same fallback schema (aggregated).
 * Expects first 7 lines metadata, line 8 header, then data.
 * @param {string} csvText
 * @returns {{ meta: object, routes: object[], byMonth: object, byHour: object }}
 */
function parseDeparturesFallbackFromCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 9) {
    throw new Error("CSV too short: need at least 8 header lines and data");
  }
  const originMatch = lines[1].match(/\(([A-Z]{3})\)\s*$/);
  const carrierMatch = lines[2].match(/\(([A-Z0-9]{2})\)\s*$/);
  const yearsLine = lines[5] || "";
  const years = [...yearsLine.matchAll(/20\d{2}/g)].map((m) => parseInt(m[0], 10));
  const origin = originMatch ? originMatch[1] : "XXX";
  const carrier = carrierMatch ? carrierMatch[1] : "XX";
  const yearRange = years.length
    ? [Math.min(...years), Math.max(...years)]
    : [2020, 2025];

  const headers = parseCsvLine(lines[7]).map((h) => h.replace(/^"|"$/g, "").trim());
  const getIdx = (name) => {
    const i = headers.findIndex((h) => h.includes(name) || h === name);
    return i >= 0 ? i : -1;
  };
  const idxDest = getIdx("Destination");
  const idxDelay = getIdx("Departure delay");
  const idxTaxi = getIdx("Taxi-Out");
  const idxDate = getIdx("Date");
  const idxTime = getIdx("Scheduled departure");
  const idxCarrier = headers.findIndex((h) => /Delay Carrier/.test(h));
  const idxWeather = headers.findIndex((h) => /Delay Weather/.test(h));
  const idxNAS = headers.findIndex((h) => /National Aviation/.test(h));
  const idxSecurity = headers.findIndex((h) => /Delay Security/.test(h));
  const idxLate = headers.findIndex((h) => /Late Aircraft/.test(h));

  if (idxDest < 0 || idxDelay < 0) {
    throw new Error("CSV missing required columns (Destination Airport, Departure delay)");
  }

  const byRoute = new Map();
  const byMonth = new Map();
  const byHour = new Map();

  for (let i = 8; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const dest = (row[idxDest] || "").replace(/^"|"$/g, "").trim();
    if (!dest) continue;

    const delay = parseNum(row[idxDelay]);
    const taxiout = parseNum(row[idxTaxi]);
    const carrierD = parseNum(row[idxCarrier] ?? 0);
    const weatherD = parseNum(row[idxWeather] ?? 0);
    const nasD = parseNum(row[idxNAS] ?? 0);
    const securityD = parseNum(row[idxSecurity] ?? 0);
    const lateD = parseNum(row[idxLate] ?? 0);

    if (!byRoute.has(dest)) {
      byRoute.set(dest, {
        delays: [],
        taxiouts: [],
        carrier: [],
        weather: [],
        nas: [],
        security: [],
        lateAircraft: [],
      });
    }
    const r = byRoute.get(dest);
    r.delays.push(delay);
    r.taxiouts.push(taxiout);
    r.carrier.push(carrierD);
    r.weather.push(weatherD);
    r.nas.push(nasD);
    r.security.push(securityD);
    r.lateAircraft.push(lateD);

    if (idxDate >= 0 && row[idxDate]) {
      const month = parseDateMonth(row[idxDate]);
      if (month) {
        if (!byMonth.has(month)) byMonth.set(month, { delays: [], flights: 0 });
        byMonth.get(month).delays.push(delay);
        byMonth.get(month).flights += 1;
      }
    }
    if (idxTime >= 0 && row[idxTime]) {
      const hour = parseTimeHour(row[idxTime]);
      if (hour !== null) {
        const key = String(hour);
        if (!byHour.has(key)) byHour.set(key, { delays: [], flights: 0 });
        byHour.get(key).delays.push(delay);
        byHour.get(key).flights += 1;
      }
    }
  }

  const routes = [];
  for (const [dest, r] of [...byRoute.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const n = r.delays.length;
    if (n === 0) continue;
    const onTime = r.delays.filter((d) => d <= 15).length;
    const delayed15 = r.delays.filter((d) => d > 15).length;
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    routes.push({
      dest,
      flights: n,
      avgDelay: Math.round(avg(r.delays) * 100) / 100,
      medianDelay: Math.round(median(r.delays) * 100) / 100,
      p95Delay: Math.round(p95(r.delays) * 100) / 100,
      onTimePct: Math.round((100 * onTime) / n * 100) / 100,
      delayed15PlusPct: Math.round((100 * delayed15) / n * 100) / 100,
      avgTaxiOut: Math.round(avg(r.taxiouts) * 100) / 100,
      delayCauseMinutes: {
        carrier: Math.round(avg(r.carrier) * 100) / 100,
        weather: Math.round(avg(r.weather) * 100) / 100,
        nas: Math.round(avg(r.nas) * 100) / 100,
        security: Math.round(avg(r.security) * 100) / 100,
        lateAircraft: Math.round(avg(r.lateAircraft) * 100) / 100,
      },
    });
  }

  const byMonthOut = {};
  for (const [month, m] of [...byMonth.entries()].sort()) {
    if (m.flights === 0) continue;
    const onTime = m.delays.filter((d) => d <= 15).length;
    byMonthOut[month] = {
      flights: m.flights,
      avgDelay: Math.round((m.delays.reduce((a, b) => a + b, 0) / m.delays.length) * 100) / 100,
      onTimePct: Math.round((100 * onTime) / m.flights * 100) / 100,
    };
  }
  const byHourOut = {};
  for (let h = 0; h < 24; h++) {
    const key = String(h);
    const m = byHour.get(key);
    if (!m || m.flights === 0) continue;
    const onTime = m.delays.filter((d) => d <= 15).length;
    byHourOut[key] = {
      flights: m.flights,
      avgDelay: Math.round((m.delays.reduce((a, b) => a + b, 0) / m.delays.length) * 100) / 100,
      onTimePct: Math.round((100 * onTime) / m.flights * 100) / 100,
    };
  }

  return {
    meta: {
      origin,
      carrier,
      yearRange,
      generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      source: "BTS Detailed Statistics Departures (parsed from CSV)",
    },
    routes,
    byMonth: byMonthOut,
    byHour: byHourOut,
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function parseDateMonth(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).replace(/"/g, "").split("/");
  if (parts.length !== 3) return null;
  const m = parseInt(parts[0], 10);
  const y = parseInt(parts[2], 10);
  if (Number.isNaN(m) || Number.isNaN(y)) return null;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function parseTimeHour(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).replace(/"/g, "").trim().split(":");
  if (!parts.length) return null;
  const h = parseInt(parts[0], 10);
  return Number.isFinite(h) ? h % 24 : null;
}

/** Simple CSV line parse (handles quoted fields) */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || (c === "\n" && !inQuotes)) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse departure fallback from JSON (object or string).
 * @param {object|string} json - Parsed object or JSON string
 * @returns {object} Normalized { meta, routes, byMonth, byHour }
 */
function parseDeparturesFallbackFromJson(json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  if (data == null || typeof data !== "object") {
    throw new Error("Invalid JSON: expected object");
  }
  if (!data.meta || !Array.isArray(data.routes)) {
    throw new Error("Invalid fallback JSON: missing meta or routes");
  }
  return {
    meta: data.meta,
    routes: data.routes,
    byMonth: data.byMonth || {},
    byHour: data.byHour || {},
  };
}

/**
 * Parse departure fallback from either JSON or CSV content.
 * Detects format: if string starts with "{" or parses as JSON, treat as JSON; else treat as CSV.
 * @param {string|object} input - JSON string, parsed JSON object, or CSV string
 * @returns {{ meta: object, routes: object[], byMonth: object, byHour: object }}
 */
function parseDeparturesFallback(input) {
  if (input == null) {
    throw new Error("No input provided");
  }
  if (typeof input === "object" && input.meta && Array.isArray(input.routes)) {
    return parseDeparturesFallbackFromJson(input);
  }
  const str = typeof input === "string" ? input : String(input);
  const trimmed = str.trim();
  if (trimmed.startsWith("{")) {
    return parseDeparturesFallbackFromJson(trimmed);
  }
  return parseDeparturesFallbackFromCsv(trimmed);
}

// Export for Node and ESM
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseDeparturesFallback,
    parseDeparturesFallbackFromJson,
    parseDeparturesFallbackFromCsv,
  };
}
if (typeof window !== "undefined") {
  window.parseDeparturesFallback = parseDeparturesFallback;
  window.parseDeparturesFallbackFromJson = parseDeparturesFallbackFromJson;
  window.parseDeparturesFallbackFromCsv = parseDeparturesFallbackFromCsv;
}
