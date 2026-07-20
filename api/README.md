# gh-vehicle-duty — HTTP API

A thin HTTP wrapper over [`src/duty.js`](../src/duty.js), for developers who aren't on JavaScript (Python, PHP, Java, Swift, Kotlin, or anything that speaks HTTP).

> **If you're writing JavaScript, use the library instead** — `npm install gh-vehicle-duty`. No network call, no latency, works offline, and you control which rate version you're pinned to. The API exists for everyone else.

---

## ⚠️ Read this before depending on it

Ghana's levy schedule changes with each budget. This is the key operational difference between the library and the API:

| | Library | API |
|---|---|---|
| Rate version | Pinned to what you installed | Whatever the server runs **right now** |
| A budget change | Your build keeps working; you upgrade deliberately | Every caller instantly inherits the new numbers |
| A *missed* budget change | You can check `RATES.version` | **You silently get wrong numbers** |

So every response self-reports its age:

```json
"staleness": {
  "level": "current",
  "ageDays": 200,
  "validFrom": "2026-01-01",
  "version": "2026.1",
  "message": "Rate schedule is current."
}
```

Also exposed as headers, so you can check without parsing:
`X-Rates-Version`, `X-Rates-Valid-From`, `X-Rates-Staleness`.

**Levels:** `current` → `aging` (365+ days, verify the rates are still in force) → `stale` (550+ days; `/health` starts returning **503**).

**What you should do:** check `staleness.level` in your integration and surface a warning to your users if it isn't `current`. Don't cache results across a budget cycle. If you're running this in production, self-host rather than depending on someone else's deployment.

---

## Endpoints

Base URL is wherever you deploy it.

### `POST /calculate`

```bash
curl -X POST https://your-worker.workers.dev/calculate \
  -H "Content-Type: application/json" \
  -d '{"customsValue": 750093, "fobGhs": 732320.16, "dutyRate": 0.20}'
```

```json
{
  "customsValue": 750093,
  "vatBase": 900111.6,
  "importDuty": 150018.6,
  "lines": [
    { "code": "01", "name": "Import Duty", "base": "customsValue", "rate": 0.2, "amount": 150018.6 },
    { "code": "06", "name": "ECOWAS Levy (ETLS)", "base": "customsValue", "rate": 0.005, "amount": 3750.465 }
  ],
  "total": 367357.96,
  "effectiveRate": 0.4897,
  "currency": "GHS",
  "ratesVersion": "2026.1",
  "staleness": { "level": "current", "...": "..." },
  "disclaimer": "Estimate only. ..."
}
```

### `GET /calculate` — convenience

```bash
curl "https://your-worker.workers.dev/calculate?customsValue=400000&bodyType=Pickup&engineCC=3500"
```

### `GET /rates` — the full levy schedule
### `GET /health` — uptime + freshness (503 when stale)
### `GET /` — service info and parameter reference

---

## Parameters

Supply **either** `customsValue` **or** `fob` + `exchangeRate`.

| Parameter | Type | Notes |
|---|---|---|
| `customsValue` | number | CIF in GHS — the figure GRA assesses |
| `fobGhs` | number | FOB in GHS; network-charge base. Defaults to `customsValue` |
| `fob` | number | Price in foreign currency |
| `freight` | number | Optional |
| `insurance` | number | Optional; defaults to ~1% of `fob` |
| `exchangeRate` | number | GHS per unit foreign currency |
| `depreciation` | number | 0–1, used-vehicle valuation haircut |
| `dutyRate` | number | 0–1. Defaults to 0.20, or derived from `bodyType` |
| `bodyType` | string | e.g. `"SUV"`, `"Pickup"` — sets duty rate and HS code |
| `engineCC` | number | Engine displacement, for HS classification |
| `processingFee` | boolean | Apply the 1% processing fee |

Errors return `400` with `{ "error": true, "message": "..." }`.

---

## Examples

**Python**

```python
import requests

r = requests.post("https://your-worker.workers.dev/calculate",
                  json={"customsValue": 750093, "dutyRate": 0.20})
data = r.json()

if data["staleness"]["level"] != "current":
    print("WARNING:", data["staleness"]["message"])

print(f"Total: GHS {data['total']:,.2f}  ({data['effectiveRate']:.1%})")
```

**PHP**

```php
$ch = curl_init("https://your-worker.workers.dev/calculate");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Content-Type: application/json"],
  CURLOPT_POSTFIELDS => json_encode(["customsValue" => 750093]),
]);
$data = json_decode(curl_exec($ch), true);
echo number_format($data["total"], 2);
```

**JavaScript / fetch**

```js
const res = await fetch("https://your-worker.workers.dev/calculate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fob: 15000, freight: 1200, exchangeRate: 12.4 }),
});
const data = await res.json();
if (res.headers.get("X-Rates-Staleness") !== "current") {
  console.warn("Duty rates may be out of date");
}
```

---

## Deploy your own

Free on Cloudflare Workers at this scale — it's pure arithmetic, no database, no auth, no user data stored.

**No command line?** Paste [`worker.bundled.js`](worker.bundled.js) into the Cloudflare dashboard editor. Full walkthrough: **[DEPLOY.md](DEPLOY.md)**.

**With the CLI:**

```bash
npm install -g wrangler
wrangler login
cd api
wrangler deploy
```

Test locally first with `wrangler dev`.

### Which file?

| File | Use |
|---|---|
| `worker.js` | CLI / wrangler deploys. Imports from `../src/duty.js`. |
| `worker.bundled.js` | Dashboard paste-in. Self-contained; generated by `npm run api:bundle`. |

**If you deploy this publicly, you take on a real obligation:** people will build against it, and if you stop updating the rates after a budget, they'll be quietly quoting wrong figures to their customers. Either commit to redeploying each January, or point users at self-hosting. The staleness guard limits the damage but doesn't eliminate it.

---

## License & disclaimer

MIT. **Estimates only.** This applies a levy schedule to a customs value *you supply* — it does not know GRA's official valuation, which is assessed from the vehicle VIN against GRA's ICUMS/HDV benchmark database. Not affiliated with or endorsed by the Ghana Revenue Authority. Not a substitute for a licensed clearing agent.
