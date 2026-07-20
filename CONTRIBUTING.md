# Contributing

Thanks for helping keep this accurate.

## Rate changes (most valuable)

Ghana's levy schedule changes with each budget. If a rate is wrong or out of date:

1. **Cite the source** — a Bill of Entry, a GRA notice, or the budget statement.
2. **Bump the version** — update `RATES.version` and `RATES.validFrom` in `src/duty.js`.
3. **Add a test** — assert the new figure in `test/duty.test.js`.

## Code

- Zero runtime dependencies. Please keep it that way.
- ES modules, Node >= 18.
- `npm test` must pass. The reference Bill of Entry assertions should not be
  loosened — if they fail after a change, the change is wrong or the schedule
  genuinely moved (in which case, version it as above).

## Scope

In scope: the levy arithmetic, HS classification helpers, valuation helpers.

Out of scope: scraping GRA/ICUMS, or anything that claims to return the
*official* customs value. That figure comes from GRA's VIN-based HDV
benchmark and is not publicly available. Keep the estimate framing intact.
