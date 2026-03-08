#!/usr/bin/env node
/** Quick test: parser loads JSON and CSV and returns same schema */
import { parseDeparturesFallback, parseDeparturesFallbackFromCsv } from "../data/parse-departures-fallback.js";
import fs from "fs";

const json = JSON.parse(fs.readFileSync("data/ord-wn-departures-fallback.json", "utf8"));
const out = parseDeparturesFallback(json);
console.log("JSON: origin=", out.meta.origin, "routes=", out.routes.length);

const csvPath = process.env.HOME + "/Downloads/Detailed_Statistics_Departures.csv";
if (fs.existsSync(csvPath)) {
  const csv = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(0, 150).join("\n");
  const fromCsv = parseDeparturesFallbackFromCsv(csv);
  console.log("CSV: origin=", fromCsv.meta.origin, "carrier=", fromCsv.meta.carrier, "routes=", fromCsv.routes.length);
} else {
  console.log("CSV file not found, skip CSV test");
}
