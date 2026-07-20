# gh-vehicle-duty

Ghana vehicle import duty & levy calculator. A dependency-free JavaScript module that reproduces the levy schedule of a GRA Customs **Bill of Entry** — validated line-by-line against a real entry.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Rates](https://img.shields.io/badge/rates-v2026.1-blue)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

> **Estimate only.** This library applies the levy schedule to a customs value **you supply**. It does not and cannot know GRA's official valuation — that is assessed from the vehicle's VIN against GRA's ICUMS/HDV benchmark database, which has no public API. Not affiliated with the Ghana Revenue Authority.

---

## Why this exists

Ghana's vehicle duty isn't a single percentage. It's fourteen separate levies computed across **three different bases**, and getting the bases wrong is the usual source of error:

| Base | What's charged on it |
|---|---|
| **Customs value** (CIF in GHS) | Import Duty, ECOWAS, Vehicle Examination, Special Import, EXIM, AU Levy |
| **VAT base** (customs value **+ import duty**) | Import VAT, NHIL, GET Fund |
| **FOB** | Network Charge — and its own VAT/NHIL/GET Fund sub-levies |

Plus flat fees. The net result lands around **49% of customs value** for a typical passenger vehicle at 20% duty.

## Install

```bash
npm install gh-vehicle-duty
```

Not published to npm yet? Install straight from GitHub — no extra setup needed:

```bash
npm install github:PapaAdjei/gh-vehicle-duty
```

Or vendor `src/duty.js` directly — it's one file with zero dependencies and works in Node ≥18, Deno, and browsers.

## Quick start

```js
import { calculateFromInvoice, formatGHS } from "gh-vehicle-duty";

const result = calculateFromInvoice({
  fob: 62400,          // purchase price, USD
  freight: 960,        // USD
  insurance: 554.4,    // USD
  exchangeRate: 11.7359,
  dutyRate: 0.20,
});

console.log(formatGHS(result.total));          // 367,357.96
console.log(result.effectiveRate.toFixed(3));  // 0.490
```

Already know the customs value?

```js
import { calculateDuty } from "gh-vehicle-duty";

const r = calculateDuty({ customsValue: 750093, fobGhs: 732320.16, dutyRate: 0.20 });

for (const line of r.lines) {
  console.log(line.code, line.name, line.amount.toFixed(2));
}
// 01 Import Duty 150018.60
// 06 ECOWAS Levy (ETLS) 3750.47
// ...
```

## API

### `calculateDuty(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `customsValue` | number | *required* | CIF in GHS — the figure GRA assesses |
| `fobGhs` | number | `customsValue` | FOB in GHS; the network-charge base |
| `dutyRate` | number | `0.20` | Import duty as a fraction |
| `processingFee` | boolean | `false` | Apply the 1% processing fee (code 05) |
| `includeFixedFees` | boolean | `true` | Include SNF + disinfection flat fees |
| `rates` | object | `RATES` | Override the rate schedule |

Returns:

```js
{
  customsValue, fobGhs, vatBase, importDuty,
  lines: [{ code, name, base, baseAmount, rate, amount }, ...],
  total,
  effectiveRate,      // total / customsValue
  currency: "GHS",
  ratesVersion: "2026.1",
  validFrom: "2026-01-01",
  disclaimer: "..."
}
```

Every line reports which base it was charged on, so a UI can group or audit the arithmetic.

### `calculateFromInvoice(options)`

Everything above, plus `fob`, `freight`, `insurance`, `exchangeRate`, and `depreciation` (fraction 0–1, applied to the goods value for used vehicles). Convenience wrapper over `customsValueFromInvoice()` + `calculateDuty()`.

### `customsValueFromInvoice({ fob, freight, insurance, exchangeRate, depreciation })`

Returns `{ customsValue, fobGhs }` in GHS. Useful on its own if you only need the valuation step.

### Classification helpers

```js
dutyRateForBody("Pickup")   // 0.10  — pickups/commercial
dutyRateForBody("SUV")      // 0.20  — passenger
hsCode(2500)                // "8703.23"  (petrol passenger, by engine cc)
hsCode(3500, "Pickup")      // "8704"     (commercial)
isPickup("Crew Cab Pickup") // true
```

HS bands follow engine displacement: ≤1000cc `8703.21`, ≤1500cc `8703.22`, ≤3000cc `8703.23`, above `8703.24`.

### `RATES`

The frozen, versioned rate schedule. **Check `RATES.version` and `RATES.validFrom` rather than assuming currency.**

```js
import { RATES } from "gh-vehicle-duty";
if (RATES.validFrom < "2026-01-01") console.warn("stale rate schedule");
```

Ghana's schedule changes with each budget — the January 2026 VAT reform removed the 1% COVID-19 Health Recovery Levy, so any copy still charging it is wrong. Supply your own `rates` object to model a different period.

## Validation

Tests assert every levy line against a real GRA Bill of Entry (used Acura MDX, CIF USD 63,914.40 @ 11.7359):

```bash
npm test      # 12 tests
npm run example
```

| Levy | Code | Expected | Computed |
|---|---|---|---|
| Import Duty 20% | 01 | 150,018.60 | ✅ |
| Import VAT 15% | 02 | 135,016.74 | ✅ |
| ECOWAS 0.5% | 06 | 3,750.47 | ✅ |
| Vehicle Exam 1% | 31 | 7,500.93 | ✅ |
| Network Charge 0.4% | 32 | 2,929.28 | ✅ |
| **Levy table total** | | **366,935.20** | ✅ |

## Getting the customs value

This is the one input the library can't derive, and it's the one that drives everything:

- **New vehicle** — the purchase price / FOB is usually close to what GRA applies.
- **Used vehicle** — GRA values from the **VIN** against its ICUMS/HDV benchmark, not the invoice. A cheap auction buy may still be assessed at benchmark market price. Get the figure from your clearing agent or the ICUMS portal, then pass it in.

Useful companions (both free, no key):

- **[NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/)** — decode a VIN to make/model/year/engine cc/body type, which feeds `hsCode()` and `dutyRateForBody()`.
- **[open.er-api.com](https://open.er-api.com/v6/latest/USD)** — live USD→GHS. For the Bank of Ghana *selling* rate specifically, see [CediRates](https://www.cedirates.com/company/bank-of-ghana/) (their API requires a key).

## ⚠️ Rate schedules go stale

Ghana's levy schedule changes with each budget. The January 2026 VAT reform removed the 1% COVID-19 Health Recovery Levy — any copy of this library still charging it produces wrong numbers, and nothing about the output *looks* wrong.

**If you depend on this in production, guard against it:**

```js
import { RATES } from "gh-vehicle-duty";

const ageDays = (Date.now() - new Date(RATES.validFrom)) / 86400000;
if (ageDays > 365) {
  console.warn(`Duty rates are ${Math.floor(ageDays)} days old — verify against a current GRA Bill of Entry.`);
}
```

Guidance:

- **Check `RATES.version` / `RATES.validFrom`** rather than assuming currency.
- **Surface staleness to your users.** Someone quoting a customer GHS 180,000 deserves to know the schedule may have moved.
- **Watch releases** — click *Watch → Custom → Releases* on this repo. Rate changes ship as tagged releases.
- **Re-verify each January**, after the budget takes effect.
- **Never present output as final.** GRA assesses the official value from the VIN via ICUMS; this is a planning figure.

Budgets typically land in November and take effect the following January.

## HTTP API

Not writing JavaScript? [`api/`](api/) contains a Cloudflare Worker exposing the same calculation over HTTP — deployable free in about two minutes, [with no command line needed](api/DEPLOY.md).

```bash
curl -X POST https://your-worker.workers.dev/calculate \
  -H "Content-Type: application/json" \
  -d '{"customsValue": 750093, "dutyRate": 0.20}'
```

Every response carries `ratesVersion`, `validFrom`, and a `staleness` block; `/health` returns 503 once the schedule is likely superseded.

- **[Interactive playground](https://PapaAdjei.github.io/gh-vehicle-duty/api.html)** — try requests in the browser, copy working code for curl/Python/JS/PHP
- **[`api/openapi.yaml`](api/openapi.yaml)** — OpenAPI 3.1 spec; generate a typed client for Java, C#, Swift, Kotlin, Go, or anything else
- **[`api/README.md`](api/README.md)** — endpoint reference
- **[`api/DEPLOY.md`](api/DEPLOY.md)** — deploy your own in ~2 minutes, no command line

**Prefer the library if you can.** No network call, no latency, offline-capable, and you stay pinned to a known rate version instead of inheriting whatever a server happens to be running.

## Included: reference web app

`docs/` contains a complete offline-capable PWA built on this library — VIN decode, live model lists, live exchange rate, full breakdown. Serve the folder over HTTPS and it's installable on desktop and mobile. See [`docs/README.txt`](docs/README.txt).

## Contributing

Rate corrections are especially welcome — Ghana's schedule shifts with each budget. When submitting:

1. Cite the source (Bill of Entry, GRA notice, budget statement).
2. Bump `RATES.version` and `validFrom`.
3. Add or update a test asserting the new figure.

Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE). Estimates only; not affiliated with or endorsed by the Ghana Revenue Authority. Don't make clearing or financial decisions on this alone.
