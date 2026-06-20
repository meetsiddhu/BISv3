# How to Use Bridge Prioritisation — A Guide for Executives & Engineers

> Plain-English guide to what the prioritisation module does, why it can be
> trusted, and how to operate it. Written so an asset executive and a bridge
> engineer can both follow it — and so you can explain it to either.

---

## 1. The one-paragraph version (for an executive)

Every bridge (or other asset) gets a **priority band from P1 (do first) to P5 (watch)**.
The band is not a gut call — it is computed from the asset's **condition** (how
deteriorated it is) and its **consequence** (how much it would hurt if it failed:
people, traffic, freight, cost). The method follows published engineering
standards (AS 5100, AASHTO, Austroads and peers), and a few **non-negotiable safety
rules** mean a structure in critical condition can never be "averaged out" of the
top band by otherwise good scores. Every result is **frozen and reproducible** —
you can hand the ranking to a board and show exactly how each number was produced.

**What it answers:** *"Of all our assets, which ones do we spend on first, and can
we defend that order?"*

## 2. The mental model (one picture)

```
   For each asset:
                                   ┌─────────────────────────┐
   Condition  (how bad is it?) ───►│                         │
                                   │   Weighted scoring       │──► raw score 0–100
   Consequence (who/what is        │   (criteria × weights)   │
     affected if it fails?)  ──────►│                         │
                                   └───────────┬─────────────┘
                                               │
                            Safety rules (non-compensatory):
                            • Critical condition → floored to P1
                            • Missing safety data → flagged, never silently 0
                                               │
                                               ▼
                              Priority band  P1 ─ P2 ─ P3 ─ P4 ─ P5
                              (P1 = act now ............ P5 = monitor)
```

- **Condition** answers *how likely / how far gone* (the engineering "likelihood").
- **Consequence** answers *how much it matters* (safety, network, financial,
  environmental, reputational).
- Priority is the **blend of the two**, then adjusted by safety rules.

## 3. What the bands mean (the language to use with a board)

| Band | Plain meaning | Typical action |
|------|---------------|----------------|
| **P1** | Act now — highest risk on condition and/or consequence | Inspect/intervene immediately; candidate for this year's capital |
| **P2** | High — elevated on at least one axis | Schedule intervention within the planning cycle |
| **P3** | Medium — routine attention | Address at next planned cycle |
| **P4** | Low — within tolerance | Normal monitoring |
| **P5** | Watch — minimal concern | Routine surveillance only |

A bridge can be **held for review** (a yellow flag) when a safety rule fired — e.g.
critical condition. That means "the maths says P1, but an engineer must sign it off
before it drives spend." This is the governance guard, not a glitch.

## 4. Why it can be trusted (for the engineer, and for assurance)

1. **Standards-based, not invented.** Each scoring criterion cites a public standard
   (e.g. condition → AS 5100.7 / FHWA; load rating → AASHTO MBE; scour → FHWA
   HEC-18). See `docs/prioritisation/TEMPLATE-LIBRARY.md`.
2. **Non-compensatory safety floors.** A Critical-condition structure is floored to
   the top band regardless of how good its other scores are — exactly as a bridge
   engineer would insist. Good traffic numbers cannot "buy down" a structural risk.
3. **No silent zeros.** If data is missing, the engine applies an explicit policy
   (flag it, treat as neutral, penalise, or exclude) — it never quietly scores a
   gap as zero and never hides it. Coverage is disclosed on every run.
4. **Immutable, reproducible runs.** Every assessment is stored frozen with a
   snapshot of the exact parameters and a *weight-set hash*. Re-running later
   reproduces the same number; an auditor can verify "this score came from that
   parameter set."
5. **Everything is configurable and logged.** Criteria, weights and rules are
   governed config — changing a weight applies to *future* runs only (past runs are
   immutable), and every change is recorded in the Change Log with who/when/old→new.

## 5. How to operate it — step by step

### A. Pick or build your model (Admin → Prioritisation Models)

- The app ships **12 templates** across 6 sectors (bridges, pavements, rail,
  tunnels, tailings dams, haul roads, culverts, water mains, dams, poles, wharves,
  facilities). Each is a standards-calibrated starting point.
- On the **Template library** tab, choose the template for your asset class and
  click **Create model from template**. Give it a code (e.g. `BRIDGE-FLEET-V1`) and,
  optionally, a **target asset class** (e.g. `Road Bridge`) so it becomes the
  most-specific model for that class.
- The new model opens as a **Draft**. Review the **Criteria**, **Weights** and
  **Rules** tabs and adjust weights to your portfolio. (Weights are 0–10; edits
  apply to future runs only.)
- When satisfied, set the model status to **Active**.

### B. Make sure the data is there

- Core facts (condition rating, traffic) come straight from the asset register.
- Sector-specific facts (e.g. load-rating factor, scour status, IRI for pavements)
  are **configurable attributes** — fill them on each asset or via mass upload.
  Anything missing follows its declared missing-data policy and is disclosed, never
  hidden. Demo Mode pre-fills the bridge attributes so you can see a rich score
  immediately.

### C. Score the portfolio (Bridge Prioritisation tile)

- For one asset: open **Assess**, which pre-fills register facts and shows a live
  preview; add any engineering judgement; save an immutable assessment.
- For the whole fleet: run **Score Fleet**. Every active asset is scored against the
  model that resolves for its class, ranked into P1–P5, with anything that tripped a
  safety rule **held for review**.

### D. Read and act on the results

- The **worklist** shows assets band-first (P1 at the top), ranked within band.
- **Release a held run** once an engineer has reviewed it, so it enters the live
  worklist.
- The **Prioritisation Report** produces a one-page executive PDF — band counts and
  the governance appendix — reconciling exactly to the stored runs.
- The **Run Archive** keeps every run immutably for audit.

## 6. How to explain a single result (the script)

> *"This bridge is P1. It scored high because its condition is Very Poor (band 4,
> from the last inspection) and it carries a key freight route with a long detour if
> closed. The safety floor for poor condition applied, so it's held for engineering
> review before it drives spend. The score was produced by model BRIDGE-FLEET-V1,
> using AS 5100 / AASHTO-based criteria; the exact weights are recorded and the run
> is reproducible."*

That sentence — condition + consequence + which rule fired + which model — is all an
exec or an auditor needs, and the app shows every part of it on the run detail.

## 7. Common questions

- **"Why did a good-looking bridge rank P1?"** A safety floor fired (usually
  critical/very-poor condition, scour-critical, or a load-rating below posting). The
  run detail names the rule.
- **"Why is a busy bridge only P3?"** Consequence is only half the score; if its
  condition is good, overall risk is moderate. That's correct prioritisation —
  spend follows risk, not just traffic.
- **"Can I change the weights?"** Yes, on a Draft model (Admin). Changes apply to
  future runs; past runs stay frozen for audit.
- **"What if data is missing?"** The criterion's policy applies (flag/neutral/
  penalise/exclude) and coverage is shown — the score is never a silent zero.

---

*Companion docs: `TEMPLATE-LIBRARY.md` (the methodology per asset class),
`UAT-TEMPLATE-PRIORITISATION.md` (a hands-on walkthrough), `METHODOLOGY-risk-crosswalk.md`
(standards mapping).*
