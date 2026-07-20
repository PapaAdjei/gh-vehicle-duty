/**
 * gh-vehicle-duty — Ghana vehicle import duty & levy calculator.
 *
 * ESTIMATE ONLY. This library reproduces the arithmetic of a GRA Customs
 * Bill of Entry. It does NOT know GRA's official customs value: that is
 * assessed from the vehicle's VIN against GRA's ICUMS/HDV benchmark
 * database, which has no public API. Callers supply the value; this library
 * applies the levy schedule to it. Always confirm with a licensed clearing
 * agent before relying on a figure.
 *
 * @license MIT
 */

/* ------------------------------------------------------------------ *
 * Rate schedule — VERSIONED.
 *
 * Ghana's levy schedule changes with each budget. The Jan 2026 VAT reform,
 * for example, removed the 1% COVID-19 Health Recovery Levy. Consumers of
 * this library MUST check `RATES.version` / `RATES.validFrom` rather than
 * assuming these numbers are current.
 * ------------------------------------------------------------------ */

export const RATES = Object.freeze({
  version: "2026.1",
  validFrom: "2026-01-01",
  source: "Validated against a GRA Customs Bill of Entry (post-Jan-2026 VAT reform).",
  currency: "GHS",

  /** Levies charged on the customs value (CIF in GHS). */
  onCustomsValue: Object.freeze([
    Object.freeze({ code: "06", name: "ECOWAS Levy (ETLS)", rate: 0.005 }),
    Object.freeze({ code: "31", name: "Vehicle Examination Fee", rate: 0.01 }),
    Object.freeze({ code: "78", name: "Special Import Levy", rate: 0.02 }),
    Object.freeze({ code: "87", name: "EXIM Bank Levy", rate: 0.0075 }),
    Object.freeze({ code: "98", name: "African Union Import Levy", rate: 0.002 }),
  ]),

  /** Levies charged on the VAT base (customs value + import duty). */
  onVatBase: Object.freeze([
    Object.freeze({ code: "02", name: "Import VAT", rate: 0.15 }),
    Object.freeze({ code: "47", name: "Import NHIL", rate: 0.025 }),
    Object.freeze({ code: "88", name: "GET Fund Levy", rate: 0.025 }),
  ]),

  /** Network charge is assessed on FOB, not the full customs value. */
  networkCharge: Object.freeze({ code: "32", name: "Network Charge", rate: 0.004 }),

  /** Sub-levies charged on the network charge itself. */
  onNetworkCharge: Object.freeze([
    Object.freeze({ code: "33", name: "Network Charge VAT", rate: 0.15 }),
    Object.freeze({ code: "48", name: "Network Charge NHIL", rate: 0.025 }),
    Object.freeze({ code: "89", name: "Network Charge GET Fund", rate: 0.025 }),
  ]),

  /** Flat fees in GHS. */
  fixedFees: Object.freeze([
    Object.freeze({ code: "45", name: "Ghana Shippers Authority SNF", amount: 12.0 }),
    Object.freeze({ code: "63", name: "GHS Disinfection Fee", amount: 410.76 }),
  ]),

  /** Optional processing fee (code 05); often assessed at 0. */
  processingFee: Object.freeze({ code: "05", name: "Processing Fee", rate: 0.01 }),

  /** Common import duty rates by vehicle class. Actual rate follows HS classification. */
  dutyRates: Object.freeze({ passenger: 0.2, pickup: 0.1, commercial: 0.1, reduced: 0.05 }),
});

/* ------------------------------------------------------------------ *
 * HS classification helpers
 * ------------------------------------------------------------------ */

const PICKUP_HINTS = ["pickup", "truck", "cab chassis"];

/** True if the body type reads as a pickup/commercial vehicle. */
export function isPickup(bodyType) {
  const b = String(bodyType || "").toLowerCase();
  return PICKUP_HINTS.some((h) => b.includes(h));
}

/** Suggested import duty rate for a body type. Override per your HS code. */
export function dutyRateForBody(bodyType) {
  return isPickup(bodyType) ? RATES.dutyRates.pickup : RATES.dutyRates.passenger;
}

/**
 * HS subheading for a petrol passenger car by engine displacement (cc).
 * Pickups/commercial vehicles fall under 8704 instead.
 */
export function hsCode(engineCC, bodyType) {
  if (isPickup(bodyType)) return "8704";
  const cc = Number(engineCC);
  if (!cc || !isFinite(cc)) return "8703";
  if (cc <= 1000) return "8703.21";
  if (cc <= 1500) return "8703.22";
  if (cc <= 3000) return "8703.23";
  return "8703.24";
}

/* ------------------------------------------------------------------ *
 * Value helpers
 * ------------------------------------------------------------------ */

/**
 * Convert an invoice (FOB/freight/insurance in foreign currency) into the
 * GHS figures the levy engine needs.
 *
 * @param {object} o
 * @param {number} o.fob             FOB / purchase price, foreign currency
 * @param {number} [o.freight=0]     Freight, foreign currency
 * @param {number} [o.insurance=0]   Insurance, foreign currency
 * @param {number} o.exchangeRate    Units of GHS per 1 unit foreign currency
 * @param {number} [o.depreciation=0] Fraction (0–1) applied to the goods value for used vehicles
 * @returns {{customsValue:number, fobGhs:number}} both in GHS
 */
export function customsValueFromInvoice({
  fob,
  freight = 0,
  insurance = 0,
  exchangeRate,
  depreciation = 0,
}) {
  if (!isFinite(fob) || fob < 0) throw new TypeError("fob must be a non-negative number");
  if (!isFinite(exchangeRate) || exchangeRate <= 0)
    throw new TypeError("exchangeRate must be a positive number");
  if (depreciation < 0 || depreciation >= 1)
    throw new RangeError("depreciation must be a fraction in [0, 1)");

  const effectiveFob = fob * (1 - depreciation);
  return {
    fobGhs: effectiveFob * exchangeRate,
    customsValue: (effectiveFob + freight + insurance) * exchangeRate,
  };
}

/* ------------------------------------------------------------------ *
 * Core calculation
 * ------------------------------------------------------------------ */

/**
 * Calculate the full duty & levy breakdown.
 *
 * @param {object} o
 * @param {number} o.customsValue        CIF in GHS. The figure GRA assesses.
 * @param {number} [o.fobGhs]            FOB in GHS (network-charge base). Defaults to customsValue.
 * @param {number} [o.dutyRate=0.20]     Import duty rate as a fraction.
 * @param {boolean} [o.processingFee=false] Apply the 1% processing fee.
 * @param {boolean} [o.includeFixedFees=true] Include flat fees (SNF, disinfection).
 * @param {object} [o.rates=RATES]       Override the rate schedule.
 * @returns {object} breakdown with `lines`, `total`, `effectiveRate`, `ratesVersion`
 */
export function calculateDuty({
  customsValue,
  fobGhs,
  dutyRate = RATES.dutyRates.passenger,
  processingFee = false,
  includeFixedFees = true,
  rates = RATES,
} = {}) {
  if (!isFinite(customsValue) || customsValue < 0)
    throw new TypeError("customsValue must be a non-negative number");
  if (!isFinite(dutyRate) || dutyRate < 0 || dutyRate > 1)
    throw new RangeError("dutyRate must be a fraction in [0, 1]");

  const fob = isFinite(fobGhs) && fobGhs >= 0 ? fobGhs : customsValue;
  const lines = [];

  // 1. Import duty — on customs value.
  const duty = customsValue * dutyRate;
  lines.push({
    code: "01", name: "Import Duty", base: "customsValue",
    baseAmount: customsValue, rate: dutyRate, amount: duty,
  });

  // 2. Optional processing fee — on customs value.
  if (processingFee) {
    lines.push({
      code: rates.processingFee.code, name: rates.processingFee.name, base: "customsValue",
      baseAmount: customsValue, rate: rates.processingFee.rate,
      amount: customsValue * rates.processingFee.rate,
    });
  }

  // 3. Levies on customs value.
  for (const l of rates.onCustomsValue) {
    lines.push({
      code: l.code, name: l.name, base: "customsValue",
      baseAmount: customsValue, rate: l.rate, amount: customsValue * l.rate,
    });
  }

  // 4. VAT block — base is customs value PLUS import duty.
  const vatBase = customsValue + duty;
  for (const l of rates.onVatBase) {
    lines.push({
      code: l.code, name: l.name, base: "vatBase",
      baseAmount: vatBase, rate: l.rate, amount: vatBase * l.rate,
    });
  }

  // 5. Network charge — on FOB — and its sub-levies.
  const nc = fob * rates.networkCharge.rate;
  lines.push({
    code: rates.networkCharge.code, name: rates.networkCharge.name, base: "fob",
    baseAmount: fob, rate: rates.networkCharge.rate, amount: nc,
  });
  for (const l of rates.onNetworkCharge) {
    lines.push({
      code: l.code, name: l.name, base: "networkCharge",
      baseAmount: nc, rate: l.rate, amount: nc * l.rate,
    });
  }

  // 6. Flat fees.
  if (includeFixedFees) {
    for (const fee of rates.fixedFees) {
      lines.push({
        code: fee.code, name: fee.name, base: "fixed",
        baseAmount: null, rate: null, amount: fee.amount,
      });
    }
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  return {
    customsValue,
    fobGhs: fob,
    vatBase,
    importDuty: duty,
    lines,
    total,
    effectiveRate: customsValue > 0 ? total / customsValue : 0,
    currency: rates.currency,
    ratesVersion: rates.version,
    validFrom: rates.validFrom,
    disclaimer:
      "Estimate only. GRA assesses the official customs value from the vehicle VIN " +
      "against its ICUMS/HDV benchmark. Confirm with a licensed clearing agent.",
  };
}

/** Convenience: invoice figures straight to a breakdown. */
export function calculateFromInvoice(opts = {}) {
  const { customsValue, fobGhs } = customsValueFromInvoice(opts);
  return calculateDuty({ ...opts, customsValue, fobGhs });
}

/** Format a number as GHS for display. */
export function formatGHS(n) {
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(isFinite(n) ? n : 0);
}

export default { RATES, calculateDuty, calculateFromInvoice, customsValueFromInvoice, dutyRateForBody, hsCode, isPickup, formatGHS };
