/**
 * gh-vehicle-duty — HTTP API (Cloudflare Worker)
 *
 * A thin wrapper over ../src/duty.js. Pure arithmetic: no database, no auth,
 * no user data stored.
 *
 * Endpoints:
 *   GET  /            → service info + rate schedule version
 *   GET  /rates       → the full levy schedule with freshness status
 *   GET  /health      → uptime + staleness check
 *   POST /calculate   → duty breakdown
 *   GET  /calculate?customsValue=750093&dutyRate=0.2  (convenience)
 *
 * Every response carries `ratesVersion`, `validFrom` and a `staleness` block
 * so callers can detect an out-of-date deployment. See STALENESS_* below.
 *
 * @license MIT
 */

import {
  RATES, calculateDuty, calculateFromInvoice, dutyRateForBody, hsCode,
} from "../src/duty.js";

/* ------------------------------------------------------------------ *
 * Staleness policy
 *
 * Ghana's levy schedule changes with each budget (typically November,
 * effective January). An API is riskier than a library here: library users
 * are pinned to the version they installed, but every API caller instantly
 * inherits whatever this deployment happens to be running. If this Worker
 * is not redeployed after a budget change, callers silently receive wrong
 * numbers with no way to tell.
 *
 * So: every response self-reports its age, and past a threshold the API
 * degrades loudly rather than quietly.
 * ------------------------------------------------------------------ */
const STALENESS_WARN_DAYS = 365;   // ~1 budget cycle → warn
const STALENESS_ERROR_DAYS = 550;  // ~1.5 cycles → flag as unreliable

function staleness() {
  const validFrom = new Date(RATES.validFrom + "T00:00:00Z");
  const ageDays = Math.floor((Date.now() - validFrom.getTime()) / 86400000);
  let level = "current";
  let message = "Rate schedule is current.";
  if (ageDays >= STALENESS_ERROR_DAYS) {
    level = "stale";
    message =
      `Rate schedule is ${ageDays} days old and has likely been superseded by at ` +
      `least one budget. Do NOT rely on these figures. Verify against a current ` +
      `GRA Bill of Entry before use.`;
  } else if (ageDays >= STALENESS_WARN_DAYS) {
    level = "aging";
    message =
      `Rate schedule is ${ageDays} days old. Ghana's levies change with each ` +
      `budget — confirm these rates are still in force.`;
  }
  return { level, ageDays, validFrom: RATES.validFrom, version: RATES.version, message };
}

const DISCLAIMER =
  "Estimate only. This API applies a levy schedule to a customs value you supply. " +
  "It does not know GRA's official valuation, which is assessed from the vehicle VIN " +
  "against GRA's ICUMS/HDV benchmark. Not affiliated with the Ghana Revenue Authority. " +
  "Confirm with a licensed clearing agent before making financial or clearing decisions.";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200, extraHeaders = {}) {
  const s = staleness();
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // Surfaced as headers too, so callers can check without parsing the body.
      "X-Rates-Version": RATES.version,
      "X-Rates-Valid-From": RATES.validFrom,
      "X-Rates-Staleness": s.level,
      ...CORS,
      ...extraHeaders,
    },
  });
}

function fail(message, status = 400, extra = {}) {
  return json({ error: true, message, ...extra }, status);
}

/** Coerce a query/body value to a finite number, or undefined. */
function toNum(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n : NaN;
}

/** Shared handler for GET and POST /calculate. */
function handleCalculate(input) {
  const customsValue = toNum(input.customsValue);
  const fob = toNum(input.fob);

  if (customsValue === undefined && fob === undefined) {
    return fail(
      "Provide either `customsValue` (CIF in GHS) or `fob` plus `exchangeRate`.",
      400,
      {
        examples: {
          byCustomsValue: { customsValue: 750093, dutyRate: 0.2 },
          byInvoice: { fob: 62400, freight: 960, exchangeRate: 11.7359, dutyRate: 0.2 },
        },
      }
    );
  }

  const dutyRate = toNum(input.dutyRate);
  const bodyType = input.bodyType;
  const engineCC = toNum(input.engineCC);

  // Resolve duty rate: explicit > derived from body type > passenger default.
  let rate = dutyRate;
  if (rate === undefined) rate = bodyType ? dutyRateForBody(bodyType) : RATES.dutyRates.passenger;

  try {
    let result;
    if (customsValue !== undefined) {
      result = calculateDuty({
        customsValue,
        fobGhs: toNum(input.fobGhs),
        dutyRate: rate,
        processingFee: input.processingFee === true || input.processingFee === "true",
        includeFixedFees: !(input.includeFixedFees === false || input.includeFixedFees === "false"),
      });
    } else {
      const exchangeRate = toNum(input.exchangeRate);
      if (exchangeRate === undefined)
        return fail("`exchangeRate` is required when calculating from `fob`.");
      result = calculateFromInvoice({
        fob,
        freight: toNum(input.freight) || 0,
        insurance: toNum(input.insurance) ?? fob * 0.01, // ~1% of value if omitted
        exchangeRate,
        depreciation: toNum(input.depreciation) || 0,
        dutyRate: rate,
        processingFee: input.processingFee === true || input.processingFee === "true",
      });
    }

    if (bodyType || engineCC) {
      result.classification = {
        bodyType: bodyType ?? null,
        engineCC: engineCC ?? null,
        hsCode: hsCode(engineCC, bodyType),
        suggestedDutyRate: bodyType ? dutyRateForBody(bodyType) : null,
      };
    }

    result.staleness = staleness();
    return json(result);
  } catch (err) {
    // Library throws TypeError/RangeError on bad input — surface as 400.
    if (err instanceof TypeError || err instanceof RangeError) return fail(err.message, 400);
    return fail("Calculation failed.", 500);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (path === "/health") {
      const s = staleness();
      return json(
        { ok: s.level !== "stale", status: s.level, staleness: s },
        s.level === "stale" ? 503 : 200
      );
    }

    if (path === "/rates") {
      return json({ ...RATES, staleness: staleness(), disclaimer: DISCLAIMER });
    }

    if (path === "/calculate") {
      if (request.method === "GET") {
        return handleCalculate(Object.fromEntries(url.searchParams));
      }
      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return fail("Request body must be valid JSON.");
        }
        if (typeof body !== "object" || body === null) return fail("Request body must be a JSON object.");
        return handleCalculate(body);
      }
      return fail("Use GET or POST.", 405);
    }

    if (path === "/") {
      return json({
        name: "gh-vehicle-duty API",
        description: "Ghana vehicle import duty & levy estimates.",
        ratesVersion: RATES.version,
        validFrom: RATES.validFrom,
        staleness: staleness(),
        endpoints: {
          "GET /": "This message.",
          "GET /rates": "Full levy schedule.",
          "GET /health": "Uptime and rate-freshness check.",
          "POST /calculate": "Duty breakdown. JSON body.",
          "GET /calculate?customsValue=750093&dutyRate=0.2": "Duty breakdown via query string.",
        },
        parameters: {
          customsValue: "number (GHS) — CIF. Either this or `fob`+`exchangeRate`.",
          fob: "number — price in foreign currency.",
          freight: "number — optional.",
          insurance: "number — optional; defaults to ~1% of fob.",
          exchangeRate: "number — GHS per unit foreign currency.",
          depreciation: "number 0–1 — used-vehicle valuation haircut.",
          dutyRate: "number 0–1 — defaults to 0.20, or derived from bodyType.",
          bodyType: "string — e.g. 'SUV', 'Pickup'. Sets duty rate and HS code.",
          engineCC: "number — engine displacement, for HS classification.",
          processingFee: "boolean — apply the 1% processing fee.",
        },
        source: "https://github.com/YOUR-USERNAME/gh-vehicle-duty",
        disclaimer: DISCLAIMER,
      });
    }

    return fail(`Unknown endpoint: ${path}`, 404);
  },
};
