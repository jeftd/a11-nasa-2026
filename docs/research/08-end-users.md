# 08 — End Users of the Challenge

Source: official challenge page, read on 2026-11-14 in the browser (Details and Resources tabs):
https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/

## 1. Who the challenge says the app is for

The statement names users in five places, plus one related mention:

| # | Term | Section | What the statement says (paraphrased) |
|---|---|---|---|
| 0 | fire managers | Intro | Today they lack a consistent picture of when and where burning has occurred. |
| 1 | early warning and emergency **responders** | Intro | The app should let them, scientists and land managers examine historical patterns, unusual conditions and critical periods in an area of interest. |
| 2 | emergency **managers** | Background ("root of the challenge") | They benefit from a consistent hotspot calendar: which months/years had most fire, current month vs. historical median for a selected area. |
| 3 | Emergency **managers** | Background (after FIRMS) | They would use the app to monitor sensitive regions, recognize changes vs. historical patterns, and strengthen fire forecasting and response. |
| 4 | emergency **managers** | Objectives | The calendar gives them the fire history of an area: which periods burn most, which years were most active, how a current fire compares. |
| 5 | early warning and emergency **responders** | Potential considerations | Formal audience list: responders, scientists, land managers, firefighters. |

**Reading:** the three "emergency managers" mentions sit in the Background and Objectives, where the
statement describes *what the app is for*. The other audiences appear only in lists. The **primary user is
the emergency / fire manager**; the rest are secondary.

## 2. What the Resources tab adds

The only resource is **NASA FIRMS**. Its description says it serves "the broader fire management
community" and also aims "to inform the general public". The general public is therefore a valid
secondary audience, even though the challenge does not list it.

## 3. User groups and their needs

| User | Decision they make | What they need from the app | Technical level |
|---|---|---|---|
| Early warning / emergency managers (civil protection, emergency operations centers) | When to pre-position resources, raise alerts, declare emergencies | "Is this month above normal for my area?" in seconds | Low–medium |
| Firefighters / fire crews (e.g. CONAFOR, state and municipal crews) | When to hire and train crews; which months and zones to staff | Burning calendar: which months burn most in *their* area | Low |
| Land managers (protected areas, ejidos, state agencies) | Annual planning, prescribed burns, permits, reports | Their exact polygon, yearly trends, CSV export for GIS and reports | Medium |
| Scientists | Long-term trends, climate, emissions | A consistent 2000→present series with sensor provenance and uncertainty | High |

Secondary users (implied, not listed): agriculture (seasonal crop burning), air quality and public
health (smoke seasons), insurers and risk analysts, journalists / NGOs / educators, and space agencies
such as CONAE (record continuity after MODIS retires).

## 4. Nuances from the statement that shape the product

- **Not only wildfires.** The statement explicitly includes agricultural burns, land clearing, waste
  burning and industrial fires.
- **Not every hotspot is a fire.** Volcanoes and oil/gas flares are mentioned; for a fire manager they
  are noise. Filtering non-vegetation detections (FIRMS `type` field) makes the app more useful.
- **Historical context, not real-time detection.** FIRMS already does detection; the value here is
  telling the user *whether today is normal for their area*.
- **Accessible color ramps are asked for explicitly** — the primary user is not technical.

## 5. One-line positioning

A tool for whoever has to decide where and when to prepare fire resources in their area: with 25 years of
consistent history, it tells them whether this month is normal or a warning sign.
