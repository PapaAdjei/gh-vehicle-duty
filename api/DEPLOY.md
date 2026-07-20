# Deploying the API — no command line needed

Cloudflare lets you paste a Worker straight into their web dashboard. No terminal, no npm, no wrangler, no git.

Use **`worker.bundled.js`** for this — it's the library and API combined into one self-contained file. (`worker.js` won't work in the dashboard because it imports from `../src/duty.js`.)

---

## Steps

1. **Sign up** at [dash.cloudflare.com](https://dash.cloudflare.com) — free, no card required.

2. In the left sidebar click **Workers & Pages** → **Create** → **Create Worker**.

3. Give it a name, e.g. `gh-vehicle-duty-api`. This becomes your URL:
   `https://gh-vehicle-duty-api.YOUR-SUBDOMAIN.workers.dev`

4. Click **Deploy** (it deploys Cloudflare's placeholder "Hello World" first — that's expected).

5. Click **Edit code**.

6. Select everything in the editor (**Ctrl+A** / **Cmd+A**) and delete it.

7. Open `worker.bundled.js`, select all, copy, and paste it in.

8. Click **Deploy** at the top right.

Done. Your API is live.

---

## Check it worked

Open this in a browser tab — replace with your actual URL:

```
https://gh-vehicle-duty-api.YOUR-SUBDOMAIN.workers.dev/
```

You should get JSON listing the endpoints and the rate version. Then try a real calculation:

```
https://gh-vehicle-duty-api.YOUR-SUBDOMAIN.workers.dev/calculate?customsValue=750093&dutyRate=0.2
```

Expected total: **367357.96** — the figure from the reference Bill of Entry. If you see that, everything works.

---

## Updating it later

Same route: **Workers & Pages** → your worker → **Edit code** → paste the new `worker.bundled.js` → **Deploy**.

If you change rates in `src/duty.js`, regenerate the bundle first (`npm run api:bundle`) so the dashboard copy matches the repo. If you don't have Node installed, edit the `RATES` block directly in the dashboard — but then update the repo too, or the two will drift apart.

---

## Free tier

100,000 requests/day at no cost, which is far beyond what this will need. There's no database, no auth, and no user data stored — it's pure arithmetic, so there's nothing to secure or back up.

---

## Before you share the URL publicly

Deploying is easy; **keeping it correct is the ongoing part.** Ghana's levies change with each budget, and every caller inherits whatever your deployment is running. If you don't redeploy after a budget, people integrating your API will quietly quote wrong figures to their customers.

The built-in staleness guard limits the damage — responses self-report their age, and `/health` starts returning 503 after ~550 days — but it can't update the rates for you.

So either:

- Commit to redeploying each January, **or**
- Tell people to deploy their own copy (this file makes that easy), **or**
- Keep it private for your own use and point developers at the npm library instead.

Any of those is fine. Quietly letting a public API go stale is the one option worth avoiding.
