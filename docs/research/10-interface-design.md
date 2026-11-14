# 10 — Interface Design

Design of the main app, derived from the use cases and the SA requirements in
[09-user-research-and-use-cases.md](09-user-research-and-use-cases.md).
Clickable mockup (illustrative synthetic data): [web-hackathon/public/index.html](../../web-hackathon/public/index.html) (deployed home page; v1 at `web/mockup/v1.html`).

> **Update (v2).** After the audit in [11-ui-audit-and-references.md](11-ui-audit-and-references.md) the mockup
> was rebuilt as an app shell: top bar (area, draw, theme, export) · left inspector with tabs
> (Overview / Season / Burn calendar / Data) · map canvas with layers and legend · bottom dock with a
> **2001→2026 month timeline** (anomaly stripes, drag / arrow keys / play) driving every view, plus linked
> season-profile and annual charts and a "notable months" list. Inter, warm-stone neutrals, achromatic chrome,
> theme-aware data ramps, Esri gray canvas basemap, light theme by default. The first version is kept at
> `web/mockup/v1.html`. Sections 2–3 below describe v1's layout; the goals, states and rules still apply.
>
> **Update (assistant).** Ember, the AI assistant, lives in a **collapsible right sidebar** opened from "Ask Ember"
> in the top bar (pattern from erp-ai spec 047): it pushes the map on desktop, becomes a drawer on phones,
> remembers if it was open, shows what the user is viewing, offers suggestions for that area and month, and sends
> that on-screen context with every question so answers refer to the numbers on screen. Details:
> [web-hackathon/README.md](../../web-hackathon/README.md#ember-assistant-sidebar).

## 1. Design principles (from the research)

1. **Organise by the user's goal, not by data type.** The navigation is five questions, one per GDTA goal:
   *Is this month normal? · When is the fire season? · Set a burning calendar · How did each year rank? · Download.*
2. **Answer first, evidence second.** The verdict (L2) is the most salient element; the map (L1) and the range
   (L2) support it; "what usually comes next" (L3) closes it.
3. **One area, one month, everywhere.** The area and the month to check live in the sticky header and drive
   every section.
4. **Say it as a frequency.** "Higher than 23 of the last 25 Marches", never z-scores.
5. **Colour is never the only channel.** Every category has an arrow/star marker and a text label.
6. **Provenance is a badge, not a colour.** Year rows carry `MODIS→H` (harmonized) or `VIIRS`.
7. **Be honest about limits.** Partial months are hatched and compared on the same day-span; low-activity months
   say "too few fires to judge"; projections say "historical pattern, not a forecast"; downloads remind that
   hotspots are not validated fires.

## 2. Layout

```
┌ Header (sticky) ─────────────────────────────────────────────────────────────┐
│ Burning Activity Calendar   [Area ▾] [✎ Draw area]   [Month to check ▾]      │
│ (Is this month normal?) (When is the fire season?) (Set a burning calendar)  │
│ (How did each year rank?) (Download)                                          │
└──────────────────────────────────────────────────────────────────────────────┘
┌ G1  Is this month normal for this area? ─────────────────────────────────────┐
│ ┌ Map: area + this month's hotspots ┐  ┌ VERDICT ──────────────────────────┐ │
│ │                                   │  │ Santiago, NL · Mar 1–14, 2026     │ │
│ │          (L1)                     │  │ 233 hotspots                      │ │
│ │                                   │  │ ★ RECORD HIGH                     │ │
│ └───────────────────────────────────┘  │ Highest March on record (max 204) │ │
│  freshness stamp                       └───────────────────────────────────┘ │
│                                        ┌ Where this month sits (L2) ──────┐ │
│                                        │ ticks = past years · ● = now     │ │
│                                        └──────────────────────────────────┘ │
│                                        ┌ What usually comes next (L3) ────┐ │
│                                        │ Apr usually falls… peak: Mar     │ │
│                                        │ Above normal 3 months in a row   │ │
│                                        └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
┌ G2  When is the fire season here?  [Counts | Compared with normal] ──────────┐
│ Season Feb–Jun · peak Mar · peak 2001–10 vs 2016–25                          │
│ Typical year  │ 21 52 191 143 72 30 7 6 4 5 8 14                             │
│ 2026 VIIRS    │ 49 116 [233] ░ ░ ░ …                                         │
│ …                                                                            │
│ 2001 MODIS→H  │ …                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
┌ G3  Set a burning calendar (NOM-015 §5) ─────────────────────────────────────┐
│ [Jan 4%][Feb 9%][Mar 34%]…  ← tap allowed months                             │
│ Allowed months held 8% of hotspots; grew 37% since 2001–10; ⚠ peak conflict  │
└──────────────────────────────────────────────────────────────────────────────┘
┌ G4  How did each year rank? — annual bars, MODIS-era whiskers, median line ──┐
┌ G5  Download — monthly CSV · hotspots CSV · one-page A4 summary ─────────────┐
```

## 3. Section-by-section

| Section | Use case | SA level | Elements | Notes |
|---|---|---|---|---|
| Header | all | — | Area picker (search municipality, preset, draw polygon, lat/lon + radius); month to check; goal chips | Area and month persist across sections |
| G1 Map | UC1 | L1 | Area outline, this month's hotspots (FIRMS NRT), freshness stamp | Leaflet; dots capped and sampled beyond a limit |
| G1 Verdict | UC1 | L2 | Count to date, category + marker, frequency sentence, typical value, % only if median ≥ 10 | Background = category colour; record = ★ |
| G1 Range | UC1 | L2 | One tick per past year (same month, same day-span), middle-third band, dot for now | Log scale; labels avoid overlap |
| G1 Next | UC1 | L3 | Next month's typical value and direction, peak month, persistence | "Historical pattern, not a forecast" |
| G2 Calendar | UC3, UC2 | L1/L2 | Typical-year row; years × months; Counts / Compared-with-normal toggle; provenance badge; current month outlined; partial month hatched; tooltips with harmonized range | YlOrRd log bins; RdBu categories |
| G2 Season line | UC3 | L2/L3 | Season span (10%→90% cumulative), peak month, early vs recent decade peak | — |
| G3 Burn calendar | UC2 | L2/L3 | 12 month toggles with share of yearly hotspots; share of allowed months; change 2001–10 → 2016–25; warning if a month ≥ 15% or the peak is allowed | Ties directly to NOM-015 §5 |
| G4 Annual | UC4 | L2 | Annual totals, MODIS-era whiskers, median line, VIIRS-era marker, top/bottom years | — |
| G5 Download | UC4, UC5 | — | Monthly CSV (implemented in mockup), hotspots CSV, A4 summary | Columns listed on screen |

## 4. States and edge cases

| Case | Behaviour |
|---|---|
| Month in progress | Compare against the same day-span of past years; label "to day N"; hatched cell |
| Low-activity month (median < 3 or ≥ half of years zero) | Grey verdict "Low-activity month — too few fires to judge"; show raw count and historical max |
| Above historical max by ≥ 5 | "★ Record high" regardless of the low-activity guard |
| Very small area | Warning that counts are noisy (planned) |
| Future months of the current year | Empty, dimmed cells |
| Mobile | Calendar scrolls horizontally; tooltips on tap; verdict stacks under the map |

## 5. Mockup scope

The mockup (`web-hackathon/public/index.html`, deployed as the site home page) is a **design prototype**: three preset areas (Santiago NL, Sierra de Arteaga
polygon, Ocosingo Chiapas) with **synthetic counts** shaped like each region's season. It implements the full
logic of the verdict (percentile, categories, low-activity guard, record, partial month), the calendar toggle,
the burning-calendar helper, annual ranking and the monthly CSV. Not yet implemented: drawing an area,
municipality search, real harmonized data, hotspot CSV, PDF summary.

Run it:

```bash
python -m http.server 8770 --directory web-hackathon/public
```

## 6. Next steps

1. Run the 5-second and hallway tests (09 §9) on the mockup and log findings.
2. Replace synthetic data with the harmonized monthly grid from the pipeline.
3. Implement area drawing (reuse the explorer's polygon tool) and municipality search (INEGI boundaries).
4. Implement the A4 one-page summary for briefings.
