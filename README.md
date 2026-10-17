# BudgetFlow

A household financial model for planning consumer-debt consolidation and payoff by a set date, then testing when an
additional rental can be bought. It includes HELOC options for freeing cash for debt consolidation, a home addition or
an investment property. It implements the *Rental Property Financial Model Requirements (2026–2036)* specification.

```bash
npm install
npm run dev     # http://localhost:5178
npm test        # engine + Section 12 acceptance tests
```

## How it is built

- `src/model/finance.ts`: spec formulas such as amortization, required saving, HELOC capacity and rate, cash needed,
  funding gap, break-even rent and XIRR.
- `src/model/engine.ts`: the monthly engine for Jan 2026 – Dec 2036 (132 periods). It covers cash, reserves, the primary
  mortgage, Novella, consumer debts, Yukon, HELOC tranches by use, acquisitions and stress overlays.
- `src/model/scenario.ts`: scenarios A–D, the stress catalog, underwriting, purchase tests and DEFER / earliest-date search.
- `src/model/analysis.ts`: the checkpoint bridge, payoff dates, annual summaries, owner returns and V01–V16 checks.
- `src/ui`: the React UI. Every input is editable and every output recalculates. Blank mandatory inputs show
  **INPUT REQUIRED**, never zero.

Inputs, saved versions and the change log are stored in the browser (`localStorage`). Use **Guide & log → Export** to
back them up. The **Load illustrative example** button fills a clearly labelled ILLUSTRATIVE household for exploring
the mechanics. Results built on it are not decision-ready.
