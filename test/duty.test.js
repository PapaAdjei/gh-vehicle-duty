/**
 * Validation against a real GRA Customs Bill of Entry.
 * Run: node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RATES, calculateDuty, calculateFromInvoice, customsValueFromInvoice,
  dutyRateForBody, hsCode, isPickup,
} from "../src/duty.js";

/* Reference entry: 1 used Acura MDX, CIF USD 63,914.40 @ 11.7359 */
const REF = {
  customsValue: 750093.0,
  fobGhs: 732320.16,
  dutyRate: 0.2,
  expected: {
    "01": 150018.6,   // Import Duty
    "06": 3750.47,    // ECOWAS
    "31": 7500.93,    // Vehicle Examination
    "78": 15001.86,   // Special Import
    "87": 5625.7,     // EXIM
    "98": 1500.19,    // AU
    "02": 135016.74,  // Import VAT
    "47": 22502.79,   // NHIL
    "88": 22502.79,   // GET Fund
    "32": 2929.28,    // Network Charge
    "33": 439.39,     // NC VAT
    "48": 73.23,      // NC NHIL
    "89": 73.23,      // NC GET
  },
  taxTableTotal: 366935.2, // sum of the levy table on the entry
};

const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const lineFor = (r, code) => r.lines.find((l) => l.code === code);

test("reproduces every levy line on the reference Bill of Entry", () => {
  const r = calculateDuty({
    customsValue: REF.customsValue, fobGhs: REF.fobGhs, dutyRate: REF.dutyRate,
  });
  for (const [code, amount] of Object.entries(REF.expected)) {
    const line = lineFor(r, code);
    assert.ok(line, `missing levy line ${code}`);
    assert.ok(
      near(line.amount, amount),
      `${code} ${line.name}: got ${line.amount.toFixed(2)}, expected ${amount}`
    );
  }
});

test("levy table total matches the entry", () => {
  const r = calculateDuty({
    customsValue: REF.customsValue, fobGhs: REF.fobGhs,
    dutyRate: REF.dutyRate, includeFixedFees: false,
  });
  assert.ok(
    near(r.total, REF.taxTableTotal),
    `total ${r.total.toFixed(2)} != ${REF.taxTableTotal}`
  );
});

test("VAT base is customs value plus import duty", () => {
  const r = calculateDuty({ customsValue: REF.customsValue, dutyRate: 0.2 });
  assert.ok(near(r.vatBase, 900111.6), `vatBase ${r.vatBase}`);
});

test("network charge is assessed on FOB, not customs value", () => {
  const withFob = calculateDuty({ customsValue: 750093, fobGhs: 732320.16 });
  const without = calculateDuty({ customsValue: 750093 });
  assert.ok(lineFor(withFob, "32").amount < lineFor(without, "32").amount);
});

test("invoice conversion yields the entry's GHS figures", () => {
  const { customsValue, fobGhs } = customsValueFromInvoice({
    fob: 62400, freight: 960, insurance: 554.4, exchangeRate: 11.7359,
  });
  assert.ok(near(fobGhs, 732320.16, 0.05), `fobGhs ${fobGhs}`);
  assert.ok(near(customsValue, 750093.0, 1), `customsValue ${customsValue}`);
});

test("effective rate lands near the documented ~49%", () => {
  const r = calculateDuty({ customsValue: REF.customsValue, fobGhs: REF.fobGhs });
  assert.ok(r.effectiveRate > 0.48 && r.effectiveRate < 0.50, `eff ${r.effectiveRate}`);
});

test("depreciation reduces the assessed value", () => {
  const base = calculateFromInvoice({ fob: 20000, exchangeRate: 12 });
  const dep = calculateFromInvoice({ fob: 20000, exchangeRate: 12, depreciation: 0.5 });
  assert.ok(dep.total < base.total);
});

test("processing fee is opt-in", () => {
  const off = calculateDuty({ customsValue: 100000 });
  const on = calculateDuty({ customsValue: 100000, processingFee: true });
  assert.equal(lineFor(off, "05"), undefined);
  assert.ok(near(lineFor(on, "05").amount, 1000));
});

test("classification helpers", () => {
  assert.equal(isPickup("Pickup"), true);
  assert.equal(isPickup("Sedan"), false);
  assert.equal(dutyRateForBody("Pickup"), 0.1);
  assert.equal(dutyRateForBody("SUV"), 0.2);
  assert.equal(hsCode(900), "8703.21");
  assert.equal(hsCode(1500), "8703.22");
  assert.equal(hsCode(2500), "8703.23");
  assert.equal(hsCode(3500), "8703.24");
  assert.equal(hsCode(3500, "Pickup"), "8704");
});

test("rate schedule is versioned and frozen", () => {
  assert.match(RATES.version, /^\d{4}\.\d+$/);
  assert.ok(RATES.validFrom);
  assert.throws(() => { RATES.onVatBase.push({}); });
});

test("rejects invalid input", () => {
  assert.throws(() => calculateDuty({ customsValue: -1 }));
  assert.throws(() => calculateDuty({ customsValue: 1000, dutyRate: 1.5 }));
  assert.throws(() => customsValueFromInvoice({ fob: 100, exchangeRate: 0 }));
  assert.throws(() => customsValueFromInvoice({ fob: 100, exchangeRate: 12, depreciation: 1 }));
});

test("no COVID-19 levy in the post-2026 schedule", () => {
  const r = calculateDuty({ customsValue: 500000 });
  assert.ok(!r.lines.some((l) => /covid/i.test(l.name)));
});
