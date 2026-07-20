/**
 * Runnable examples: node examples/basic.js
 */
import {
  calculateDuty, calculateFromInvoice, dutyRateForBody, hsCode, formatGHS, RATES,
} from "../src/duty.js";

console.log(`Rate schedule v${RATES.version} (valid from ${RATES.validFrom})\n`);

// 1. From an invoice in USD
console.log("── Used Acura MDX · CIF USD 63,914.40 @ 11.7359 ──");
const r1 = calculateFromInvoice({
  fob: 62400, freight: 960, insurance: 554.4, exchangeRate: 11.7359,
});
for (const l of r1.lines) {
  console.log(`  ${l.code}  ${l.name.padEnd(30)} ${formatGHS(l.amount).padStart(12)}`);
}
console.log(`      ${"TOTAL".padEnd(32)} ${formatGHS(r1.total).padStart(12)}`);
console.log(`      Effective rate: ${(r1.effectiveRate * 100).toFixed(1)}% of customs value\n`);

// 2. Straight from a known customs value
console.log("── Known customs value GHS 400,000 ──");
const r2 = calculateDuty({ customsValue: 400000 });
console.log(`  Total: GHS ${formatGHS(r2.total)}  (${(r2.effectiveRate * 100).toFixed(1)}%)\n`);

// 3. Pickup — lower duty rate
console.log("── Pickup vs SUV on the same value ──");
const suv = calculateDuty({ customsValue: 400000, dutyRate: dutyRateForBody("SUV") });
const pickup = calculateDuty({ customsValue: 400000, dutyRate: dutyRateForBody("Pickup") });
console.log(`  SUV    (${hsCode(3500, "SUV")})  GHS ${formatGHS(suv.total)}`);
console.log(`  Pickup (${hsCode(3500, "Pickup")})     GHS ${formatGHS(pickup.total)}`);
console.log(`  Difference: GHS ${formatGHS(suv.total - pickup.total)}\n`);

// 4. Used-vehicle depreciation
console.log("── Depreciation effect (USD 20,000 @ 12.0) ──");
for (const d of [0, 0.2, 0.4]) {
  const r = calculateFromInvoice({ fob: 20000, exchangeRate: 12, depreciation: d });
  console.log(`  ${(d * 100).toString().padStart(2)}% dep → GHS ${formatGHS(r.total)}`);
}
