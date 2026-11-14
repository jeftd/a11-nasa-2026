# 09 — User Research and Use Cases

How we studied the users without interviewing them, what we learned, and the use cases the interface must
serve. Builds on [08-end-users.md](08-end-users.md). Interface design: [10-interface-design.md](10-interface-design.md).

Labels: **[S]** = stated in a source we read · **[I]** = our inference.

---

## 1. Method: provisional GDTA from secondary research

We had ~30 hours and no access to real fire managers, so we chose a method stack that works from secondary
sources and says so honestly.

| Step | Technique | Why |
|---|---|---|
| 1 | **Artifact analysis** — study the bulletins and dashboards fire agencies already publish | The comparisons they print *are* their information needs; a proxy for interviews |
| 2 | **Proto-personas** (NN/g) — explicitly assumption-based | Make the team's assumptions visible, not to claim research we didn't do |
| 3 | **Goal-Directed Task Analysis (GDTA)** with Endsley's three Situation Awareness levels | Built for monitoring / command-and-control decision makers; its L1/L2/L3 levels map directly onto our features |
| 4 | **Job stories** ("When…, I want to…, so I can…") | Capture the *trigger* of each decision, which role-based user stories miss |
| 5 | **Use cases** (Cockburn, user-goal level) | Concrete flows for the demo and for building |
| 6 | **Validation**: heuristic + SA review, 5-second test, 2–3 hallway tests | Cheap checks we can run during the hackathon |

Situation Awareness levels (Endsley 1995):

- **L1 Perception** — what is there (counts, where, when).
- **L2 Comprehension** — what it means (is it abnormal for this place and month?).
- **L3 Projection** — what comes next (what usually happens next month here).

**Rejected / reduced:** Klein's Critical Decision Method needs retrospective incident interviews and targets
seconds-to-minutes tactical decisions; our users make weekly-to-seasonal preparedness decisions. We keep one
idea from Klein's Recognition-Primed Decision model: experts decide by recognising whether a situation is
*typical* — our anomaly badge is a typicality cue. Full personas need 5–30 interviews, so we use
proto-personas. No published GDTA of wildfire *emergency managers* was found, so ours is labelled
**provisional**.

---

## 2. Artifact analysis — what real agencies already publish

| Artifact | What it compares | Unit | Lesson for us |
|---|---|---|---|
| **INPE Queimadas "Situação Atual"** (Brazil) [S] | Hotspots 1 Jan→today vs last year ("Dif. A.") and vs mean of previous years ("Dif. M."); CSV | Country, state, biome, municipality | The "current vs history" comparison is the core product of the most mature hotspot program |
| **INPE Estatísticas + Ciman bulletins** [S] | Each month vs historical min / mean / max since 1998; % anomaly; plain label ("close to average"); flags partial month | State, biome | Use min–median–max per month, a plain-language label, and a **partial-month flag** |
| **INPE "satélite de referência"** [S] | Uses only one satellite over time so years stay comparable (NOAA-12 → NOAA-15 → Aqua) | — | INPE solved our exact problem by *not* using newer sensors. Harmonization lets us use them all |
| **Argentina SNMF monthly report** [S] | VIIRS S-NPP hotspots per province vs min / mean / max **2015–2023**; anomaly map "above historical maximum" | Province | Their baseline is only ~9 years because of one sensor → harmonization extends it to 2000 |
| **GWIS / EFFIS seasonal trend** [S] | Current year cumulative vs average and min–max band (baseline from 2012) | Country / admin | The cumulative "year-so-far vs range" chart is a proven second view |
| **Global Forest Watch fire alerts** [S] | Current year weekly vs historical mean ± σ; label "average / high / unusually high" | Admin / custom | A plain verdict next to a "normal band" works; but VIIRS-only (from 2012) |
| **CONABIO Early Warning System / CONAFOR** (Mexico) [S] | Daily hotspot report by email; CONAFOR official stats are *validated incidents*, not hotspots | State | No public Mexican tool gives a long hotspot calendar for a drawn area [I] |
| **NOM-015-SEMARNAT-AGRICULTURA-2023** (Mexico) [S] | §5: controlled burns must follow the **burning calendars that municipal governments set every year**; §5.2.7 burns must fall inside it; §6 post-burn evaluation may use remote sensing | Municipality | Every municipality must set a burning calendar, with no historical tool to inform it [I] — **our strongest local use case** |

**Main finding [I]:** every tool compares the current season with the past, but without cross-sensor
harmonization their baselines start late (2012 VIIRS, 2015 SNMF) — except INPE, which pays for consistency by
ignoring better sensors. A harmonized 2000→present series fixes the common weakness.

Documented needs that support this [S]:

- NASA Wildfire Stakeholder Workshop (2022): stakeholders want **climatology for seasonal/monthly planning**
  and complain about **inconsistent definitions across platforms**; field teams are overwhelmed by data.
- Trigg & Roy (2007), southern Africa focus groups: free data is not enough — **packaging and delivery**
  decide uptake; low bandwidth is a barrier.
- FIRMS was built for under-resourced protected-area managers to remove cost, format and skill barriers.
- Brazil: Prevfogo picks critical areas for hiring brigades partly from hotspot history; MMA publishes a
  regional "environmental emergency calendar" that bounds 6-month brigade contracts.

---

## 3. Proto-personas (assumption-based)

### P1 — Ana, state civil-protection planner (primary)

| Field | Value |
|---|---|
| Organisation | State civil protection, Nuevo León (assumed) |
| Decisions she owns | Pre-season staffing, when to raise preparedness, public campaigns, requests for federal (CONAFOR) support |
| Cadence | Monthly in pre-season; weekly Feb–May |
| Triggers | Daily CONABIO/FIRMS email looks heavy; director asks "is this year worse?"; preparing the state prevention program (NL presented one on 27 Feb 2026 [S]) |
| Today's tools | CONABIO email, FIRMS map, CONAFOR weekly reports, spreadsheets |
| Data literacy | Moderate; uses maps, not GIS analysis |
| Constraints | Little time; briefs non-technical superiors; may check on a phone |
| Success | Can say in one sentence, with evidence, whether this month is unusual |
| Assumptions to validate | (1) thinks in municipalities/sierras, not lat/lon; (2) trusts "compared with normal" more than raw counts; (3) needs an exportable figure for briefings |

### P2 — Luis, municipal ecology / agriculture officer (primary for NOM-015)

| Field | Value |
|---|---|
| Organisation | Municipal ecology or rural development office (assumed) |
| Decisions he owns | The municipality's annual **burning calendar** (allowed and prohibited windows, NOM-015 §5 [S]); reviewing fire-use notices |
| Cadence | Once a year (Nov–Jan), plus checks during the season |
| Triggers | Annual calendar due; council (cabildo) asks for justification |
| Data literacy | Low–moderate |
| Success | A defensible calendar backed by 25 years of local evidence |
| Assumptions to validate | (1) no historical data is used today; (2) a monthly chart attached to the agreement is enough |

### P3 — Dr. Ruiz, fire scientist / NGO analyst (secondary)

| Field | Value |
|---|---|
| Decisions | Trend analysis, papers, reports |
| Needs | Monthly harmonized counts as CSV, with sensor provenance and uncertainty |
| Success | Doesn't have to harmonize MODIS and VIIRS herself |

---

## 4. Provisional GDTA

**Overall goal:** reduce fire-related harm in my jurisdiction this season.

| Goal | Sub-goal | Decision (question) | L1 Perception | L2 Comprehension | L3 Projection | Artifact basis |
|---|---|---|---|---|---|---|
| G1 Know if activity is abnormal | 1.1 Assess current month | **D1** Is this month's activity in my area abnormally high for this month? | Count so far this month; where (map); days covered; sensors used | Historical median for same month; percentile rank ("higher than 23 of 25 Marches"); category label; record flag; partial-month flag; harmonization caveat | Has it been above normal for several months? What usually happens next month? | INPE Dif. M., SNMF "above max", GFW significance |
| G1 | 1.2 Communicate | **D2** What do I report or escalate, with what evidence? | The numbers | One plain-language sentence | Expected next-month level | Ciman bulletins |
| G2 Prepare for the season | 2.1 Know the season shape | **D3** When does my area's fire season start, peak and end? | Monthly counts per year (calendar) | Typical year: median per month; peak month; share of the year's hotspots per month | Has the season started earlier / lasted longer in recent years? | EFFIS seasonal trend, MMA emergency calendar |
| G2 | 2.2 Set the burning calendar | **D4** Which months should be allowed / prohibited for agricultural burns? | Monthly counts per year | % of historical hotspots that fall in candidate months; months with lowest activity | Is a candidate window becoming more active over time? | NOM-015 §5, Entre Ríos ban window |
| G3 Account for the season | 3.1 Close the season | **D5** Was this year unusual for my area? | Annual total; year row of the calendar | Rank of the year among all years; vs median year | Trend across years | INPE annual tables, CONAFOR annual reports |
| G4 Analyse long-term (P3) | 4.1 Get consistent data | **D6** Can I use a single series 2000→present? | Harmonized counts | Provenance per year, uncertainty range | — | FIRMS archive (unharmonized) |

---

## 5. Job stories

- **JS1 (D1)** When the daily hotspot email looks heavier than usual, I want to compare this month in my area
  with the same month in past years, so I can decide whether to raise preparedness or ask for resources.
- **JS2 (D2)** When I brief my director, I want one plain sentence and one chart I can paste, so I can justify a
  request in under a minute.
- **JS3 (D3)** When I plan the next season, I want to see when fire activity usually starts, peaks and ends in my
  area, so I can time brigade contracts and campaigns.
- **JS4 (D4)** When my municipality must set its annual burning calendar, I want to see which months
  historically concentrate hotspots, so I can allow burns only in the low-risk windows and defend it to the council.
- **JS5 (D5)** When the season ends, I want to know how this year ranks against all previous years, so I can
  write the annual report and support next year's budget.
- **JS6 (D6)** When I analyse long-term trends, I want harmonized monthly counts with provenance as CSV, so I
  don't have to correct for the sensor change myself.

---

## 6. Use cases (Cockburn, user-goal level, casual format)

### UC1 — Check whether this month is abnormal for my area

- **Actor:** P1 Ana · **Trigger:** heavy daily feed (Mar–Apr) · **Covers:** JS1, JS2
- **Precondition:** harmonized monthly grid is loaded.
- **Main success scenario:**
  1. Ana picks her area: searches a municipality, or draws a polygon across the NL–Coahuila sierra.
  2. The system shows this month's hotspots on the map and a large count ("to date, 14 days").
  3. The system shows the verdict: category + frequency sentence ("Much above normal — higher than 23 of 25
     Marches; typical ≈ 140").
  4. The system shows where this month sits on the min–median–max range for this month.
  5. The system shows "Next month typically…" (historical pattern, not a forecast) and persistence
     ("above normal for 3 months in a row").
  6. Ana exports the one-page summary (PNG/PDF) for her briefing.
- **Extensions:**
  - 3a. Baseline median < 3 or ≥ half of years had 0 → "Low-activity month — too few fires to judge"; show raw
    count and historical maximum only (still flag a record).
  - 3b. Month incomplete → compare against the same day-span of past years and label "to date".
  - 1a. Area very small (< ~4 grid cells) → warn that counts are noisy.
- **Success guarantee:** Ana can state, with evidence, whether this month is unusual.

### UC2 — Set the municipal burning calendar (NOM-015)

- **Actor:** P2 Luis · **Trigger:** annual calendar due (Nov–Jan) · **Covers:** JS4
- **Main success scenario:**
  1. Luis searches his municipality.
  2. The system shows the "typical year": median hotspots per month and the share of the year's hotspots per month.
  3. Luis selects candidate *allowed* months on the month strip.
  4. The system reports what share of historical hotspots fell in those months, and whether those months have
     grown over the last 10 years.
  5. Luis adjusts the window until the allowed months avoid the peak.
  6. Luis exports the calendar chart and CSV to attach to the council agreement.
- **Extension:** 4a. Selected window overlaps the peak month → highlight the conflict.
- **Success guarantee:** a burning calendar backed by 25 years of local evidence.

### UC3 — Plan the season (start, peak, end)

- **Actor:** P1 Ana · **Trigger:** pre-season planning (Nov–Feb) · **Covers:** JS3
- **Main success scenario:**
  1. Ana picks her area.
  2. The system shows the year × month calendar 2001→present and the typical-season strip with start, peak and
     end months.
  3. Ana switches the calendar to anomaly view to see which years were unusual.
  4. The system indicates whether the season started earlier in the last 10 years than in the first 10.
  5. Ana exports the calendar.

### UC4 — Report the season / justify a declaration

- **Actor:** P1 Ana or a state official · **Trigger:** end of season (Jul–Sep) or a preventive declaration (Jan)
- **Covers:** JS2, JS5
- **Main success scenario:**
  1. Picks the area (or compares several municipalities).
  2. The system shows annual totals with the year's rank and the harmonized-estimate band for MODIS-era years.
  3. Exports the one-page summary and CSV.
- **Note:** a reminder that hotspots are satellite detections, not validated incidents, so they will not match
  CONAFOR's official fire counts.

### UC5 — Download a consistent long series

- **Actor:** P3 Dr. Ruiz · **Covers:** JS6
- **Main success scenario:**
  1. Draws the study area and picks a date range.
  2. Downloads the monthly CSV: `area, year, month, count, sensor_era, harmonized, low, high, baseline_median,
     percentile, category`.
  3. Downloads the hotspot CSV for recent months (with `sensor`, `provenance`).
  4. Reads the methods page.

---

## 7. From SA levels to interface elements

| SA level | Interface elements |
|---|---|
| **L1 Perception** | Map of this month's hotspots; large "this month to date" count; data freshness stamp; calendar cells with counts |
| **L2 Comprehension** | Verdict badge (5 categories + arrows); frequency sentence; current month as a dot on the min–median–max range; anomaly view of the calendar; typical-season strip |
| **L3 Projection** | "Next month typically…" panel; peak-month marker; persistence note; recent-vs-early-decade season shift — always labelled "historical pattern, not a forecast" |

SA design principles applied (Endsley & Jones): organise around goals (one screen answers D1); present L2
directly so the user doesn't compute it; support L3 explicitly; keep map + verdict + calendar visible together
(global SA); make the critical cue (the verdict) the most salient element; keep raw data one click away (CSV).

---

## 8. Data presentation rules

**Anomaly metric:** percentile rank of this month's count among the same calendar month in the baseline years
(2001–2025, current year excluded; mid-rank for ties).

| Percentile | Label | Marker | Colour |
|---|---|---|---|
| > historical max | Record high | ★ | `#67001f` |
| ≥ 90 | Much above normal | ▲▲ | `#b2182b` |
| 67–90 | Above normal | ▲ | `#ef8a62` |
| 33–67 | Normal | ● | `#f7f7f7` |
| 10–33 | Below normal | ▼ | `#67a9cf` |
| < 10 | Much below normal | ▼▼ | `#2166ac` |
| median < 3 or ≥ 50% zero years | Low-activity month | — | `#d9d9d9` |

Rationale: percentiles are robust to skewed, zero-inflated counts and can be said as a frequency ("higher than
23 of 25 Marches"), which non-experts understand better than probabilities or z-scores. Wording "above / near /
below normal" matches what US fire services already read in the NIFC outlooks. Thresholds follow NOAA CPC
terciles plus tails (as the US Drought Monitor and GFW do). The low-activity guard is our design judgment.

**Counts:** ColorBrewer YlOrRd 9 on a log-like scale (0 | 1–5 | 6–20 | 21–50 | 51–100 | 101–250 | 251–500 |
501–1000 | >1000): `#ffffcc #ffeda0 #fed976 #feb24c #fd8d3c #fc4e2a #e31a1c #bd0026 #800026`. Zero is its own
grey `#f0f0f0`; partial/no data is `#bdbdbd` with hatching.

**Rules:** never rainbow, red–green or green-as-normal; never mix count and anomaly colours in the same cells
(use a toggle); always pair colour with a label or arrow; show percentages only when the median ≥ 10; show
sensor provenance as a badge per year row, not in the colour; ranges go in tooltips and the CSV; flag partial
months; never compare daily values.

---

## 9. Validation plan (during the hackathon)

1. **5-second test** (3–5 people): show the main screen, hide it, ask "Which area? Is this month normal?
   What would you do next?" If they can't answer the second question, the verdict is not salient enough.
2. **Hallway test** (2–3 people outside the team): "Is March abnormal for Santiago, NL? Download the data."
3. **Heuristic + SA review** (3 team members independently): Nielsen's 10 heuristics + the SA principles in §7.
4. Write down the assumptions still unvalidated (persona tables) for the pitch.

---

## 10. Sources

Method:

- Endsley, M. R. (1995). Toward a theory of situation awareness in dynamic systems. *Human Factors* 37(1).
  https://doi.org/10.1518/001872095779049543
- Endsley & Jones, *Designing for Situation Awareness*, 2nd ed. (2012), ch. "Determining SA Requirements".
  https://www.taylorfrancis.com/chapters/mono/10.1201/b11371-9/determining-sa-requirements-mica-endsley
- GDTA of firefighters' SA requirements, *Applied Ergonomics* (2024). https://doi.org/10.1016/j.apergo.2023.104136
- Prasanna, *Information Systems for Supporting Fire Emergency Response* (Loughborough).
  https://repository.lboro.ac.uk/articles/Information_Systems_for_Supporting_Fire_Emergency_Response/9496778
- GDTA for emergency control room operators, *Information Systems Frontiers* (2020).
  https://link.springer.com/article/10.1007/s10796-020-10101-9
- Klein et al., Rapid Decision Making on the Fire Ground (RPD). https://apps.dtic.mil/sti/pdfs/ADA199492.pdf
- NN/g, persona types and proto-personas. https://www.nngroup.com/articles/persona-types/
- NN/g, heuristic evaluation. https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/
- Job stories (Intercom). https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/
- Cockburn, *Writing Effective Use Cases*. https://courses.cs.duke.edu/compsci308/spring23/readings/cockburn_use_cases.pdf

Users and tools:

- INPE Situação Atual. https://data.inpe.br/queimadas/situacao-atual/
- INPE Estatísticas. https://data.inpe.br/queimadas/estatisticas/?tipo=estados
- INPE reference satellite change to Aqua (2011).
  https://dataserver-coids.inpe.br/queimadas/queimadas/Publicacoes-Impacto/documentos/20110824_Aviso_Ref_Mudoup_Aqua.pdf
- INPE Ciman bulletin 45 (2023). https://dataserver-coids.inpe.br/queimadas/queimadas/Ciman/Boletim_Ciman_45_25102023.pdf
- Argentina SNMF monthly report, May 2024. https://argentina.gob.ar/sites/default/files/2024/01/informe_ocurrencia_mayo2024.pdf
- CONAE hotspot viewer manual.
  https://catalogos5.conae.gov.ar/catalogofocos/Docs/035_CONAE_AQUA_TERRA_NOAA20_MODIS_VIIRS_FC_VISOR_ManualUsuarios_e02.pdf
- EFFIS/GWIS seasonal trend (France 2023). https://api2.effis.emergency.copernicus.eu/api/gwis/seasonaltrend/pdf/FRA/2023/CO2
- GFW widget calculations. https://raw.githubusercontent.com/wri/gfw/develop/docs/Widget_Calculations_Docs.md
- NASA FIRMS. https://firms.modaps.eosdis.nasa.gov
- NASA Wildfire Stakeholder Workshop findings (2022).
  https://cce.nasa.gov/firesense/documents/NASA_Wildfire_Stakeholder_Workshop_Findings_Summary-10122022.pdf
- Trigg & Roy (2007), focus-group study on satellite fire data use.
  https://lcluc.umd.edu/documents/trigg-sn-and-roy-dp-2007-focus-group-study-factors-promote-and-constrain-use-satellite
- NOM-015-SEMARNAT-AGRICULTURA-2023 (DOF 1 Dec 2023). https://www.dof.gob.mx/nota_detalle.php?codigo=5710189&fecha=01/12/2023
- Nuevo León prevention program 2026 (civil protection notice).
  https://nl.gob.mx/sites/default/files/repositorio/Dependencias/Direcci%C3%B3n%20de%20Protecci%C3%B3n%20Civil/Noticias/20260227_04_programa_prevencion_incendios.docx
- Mexico fire seasons. https://www.meteored.mx/noticias/actualidad/lo-que-debes-saber-sobre-la-temporada-de-incendios-forestales-en-mexico.html

Visualization:

- US Drought Monitor classification. https://droughtmonitor.unl.edu/About/AbouttheData/DroughtClassification.aspx
- NOAA CPC outlooks (terciles). https://www.climate.gov/news-features/understanding-climate/understanding-noaas-monthly-and-seasonal-climate-outlooks
- NIFC Predictive Services outlooks. https://www.nifc.gov/nicc/predictive-services/outlooks
- Crameri, Shephard & Heron (2020), The misuse of colour in science communication. https://doi.org/10.1038/s41467-020-19160-7
- Nuñez et al. (2018), cividis. https://doi.org/10.1371/journal.pone.0199239
- ColorBrewer. https://colorbrewer2.org
- Correll, Moritz & Heer (2018), value-suppressing uncertainty palettes. https://idl.cs.washington.edu/papers/uncertainty-palettes/
- Kinkeldey, MacEachren & Schiewe (2014), uncertainty visualization review. https://doi.org/10.1179/1743277414Y.0000000099
- IPCC AR6 WGI visual style guide (hatching for low confidence).
  https://www.ipcc.ch/site/assets/uploads/2022/09/IPCC_AR6_WGI_VisualStyleGuide_2022.pdf

**Not verified:** some claims come from search snippets rather than full texts (Crameri, Padilla, WildFireSat
requirements, McRae 2015); CONAFOR report fields were seen through news coverage; the 2026 NL program PDF
returned 403. Percentile cut-points and the low-activity guard are our synthesis, not a published fire standard.
