# BridgeManagement (BIS) — Release Notes

> User-facing summary of what changed in each release. Newest first.

## Application

| | |
|---|---|
| **Open the app** | https://b143eeabtrial-dev-bridgemanagement.cfapps.us10-001.hana.ondemand.com |
| OData service (technical) | https://b143eeabtrial-dev-bridgemanagement-srv.cfapps.us10-001.hana.ondemand.com |
| Environment | SAP BTP · org `b143eeabtrial` · space `dev` · region `us10-001` |

> **First time after an update?** Open the app in a private/incognito window (or hard-refresh)
> so your browser loads the new version instead of a cached copy. A BTP login + the BMS role
> collection are required.

---

## 3.41.0 — Capital optimiser shows its reasoning
**What's new:** the **Prioritisation → Optimise** tab now explains *why* each bridge was
selected and *how* the program was built, not just the result.
- A method summary up top (e.g. *"ranked every costed work by risk bought down per dollar,
  then funded down the list until the budget ran out — 2 funded, 2 deferred"*).
- The **Funded** table now shows each bridge's **rank**, **risk bought down per $1**,
  **cumulative spend**, and a plain-English **"Why funded"**.
- A new **Unfunded P1/P2** table lists every high-priority work the budget left out, with the
  **shortfall** and **why it was deferred**.

**How to use:** Prioritisation app → *Capital Program / Optimise* tab → enter a budget →
**Optimise**.

## 3.40.0 — Pick which classes apply to a bridge (SAP-EAM classification)
**What's new:** previously a bridge showed **every** custom-attribute class. Now you choose.
- In a bridge's **Custom Attributes → Edit**, a **Classes** tick-list lets you select the
  class(es) that apply to that specific record; only those characteristics are shown for data
  collection, and the choice is saved.
- Untick everything to go back to showing all classes. Works for Restrictions too.

## 3.39.0 — Fix: can't create Characteristics + richer characteristic setup
**Fixed:** creating a Characteristic on a Class no longer errors with *"Sorry, we can't find
this page"* — you can now open the characteristic, set its data type, add its **Allowed Values**
list, and scope it to objects.
**What's new:** a characteristic can now declare how it is **rendered** when collecting data —
**Auto · Dropdown · Radio buttons · Checkbox · Multi-select · Free input** — and the bridge /
restriction data-entry forms honour it.

## 3.38.0 — Fatigue screening rolled out + live demo refreshed
**What's new:** the AS 5100.6 fatigue screen now shows on every bridge (steel/composite
structures are screened by age, mode and detail category; concrete reads *Not Applicable*).
The live demo register was refreshed so the data-quality range (green / amber / red) is visible.

## 3.37.0 — True multi-modal (rail) + cleaner lookups
**What's new:**
- **Rail-aware heavy-vehicle assessment:** a road vehicle is now **refused** against a rail or
  pedestrian structure (with a clear reason) instead of returning a misleading pass. Rail
  design load models (300LA) were added.
- **Fatigue screening (AS 5100.6)** introduced as an advisory prompt for steel structures.
- **BHI calibration badge** on the bridge page makes clear when rail/pedestrian health weights
  are indicative (road-derived) rather than calibrated.
- Disabled lookup values stay consistently hidden everywhere.

## 3.35.0 — Honest data-quality & load-rating badges
**What's new:** every bridge now shows a **Data Quality** badge (Complete / Partial /
Incomplete) and a **Load Rating Basis** badge (Screening vs Certified), so a screening estimate
or an open-data stub is never mistaken for surveyed, certified data. Filterable in the worklist.

## 3.34.0 — Council fixes: strategy line-of-sight, smarter BHI, stronger validation
**What's new:**
- **Asset-management objectives & levels of service** (ISO 55001): a traceable line from
  organisational goal → objective → measurable target, with a new launchpad tile.
- **Smarter BHI:** the bridge health index now reflects the **extent** of element defects
  (condition-state quantities), so a deck mostly in poor condition scores worse than one only
  slightly affected.
- **Stronger validation:** custom-attribute values must match the configured allowed list —
  off-list and disabled values are now rejected.

---

*Earlier releases (≤ 3.33) predate this notes file. The full technical history is in the git
commit log and `docs/COUNCIL-FIXES-2026-06.md`.*
