# 11 — UI Audit of the Mockup and the FireTrace Reference

Follow-up to [10-interface-design.md](10-interface-design.md). The information and logic of the mockup were
judged correct; this note explains why it does not *look* like a professional, state-of-the-art product, and
what a viral wildfire-UI concept teaches us.

## 1. Audit verdict (independent design review of the first mockup, now `web/mockup/v1.html`)

1. **Colours were designed for light mode and pasted onto dark.** Ramps hard-code near-white values (zero
   `#f0f0f0`, low `#ffffcc`, "Normal" `#f7f7f7`), so the brightest cells are the *least* important ones and the
   anomaly view becomes a white checkerboard. The light OSM basemap glares inside the dark UI.
2. **Nothing leads the eye.** Bright map, maroon verdict, red warning and orange dot compete; the key fact
   ("record high, 3rd month above normal") is split across three boxes.
3. **No type system.** OS default font, ~10 ad-hoc sizes, section titles barely larger than body; SVG text at
   11px inside scaled viewBoxes renders at ~6–8px (≈4px on phones).
4. **Stack of identical bordered boxes.** Box-in-box (section → card → map), uniform 16px rhythm, no hero.
5. **Prototype tells.** Jargon on screen ("SA L1–L3", "MODIS→H"), Unicode glyphs instead of icons, `alert()`
   for Draw area, default Leaflet controls, no logo, no motion, unexplained disabled buttons.

Other notable findings: failing contrast on the warning text (~2.6:1) and primary button (~2.1:1); colour
semantics collide (blue = "allowed month" and "much below normal"; orange = action and data); 312 numbers
in the heatmap make it read like a spreadsheet; header uses ~100px in three rows.

## 2. Redesign direction from the audit

- **Hue is reserved for data; chrome is achromatic.** Primary button = ink fill (Linear/Vercel style).
- **Theme-aware ramps:** dark count ramp from near-background to bright
  (`#2A1A12 #5C1F0E #9A2A0A #D9480F #F77F00 #FCBF49 #FFF1C2`); zero and the anomaly midpoint = `--surface-2`;
  allowed months get their own teal + check icon.
- **Muted basemap** (CARTO Positron / Dark Matter or darkened hillshade) with glowing hotspot points.
- **One hero panel:** area/period eyebrow, display-size number, category pill, one sentence, persistence line,
  range strip, "next month" — map beside it, not competing.
- **Type:** Inter (tabular numerals), scale 12/14/16/20/28/56, weights 400–600, nothing below 12px.
- **Spacing:** 4-based (4…64), 64px between sections, one surface level, radius 8/12.
- **Neutrals (warm stone):** light `#FAFAF9 / #FFFFFF / #F4F3F1 / #E9E7E4`, text `#1A1714 / #4F4A44 / #7A746C`;
  dark `#0E0D0C / #171514 / #211F1D / #2C2926`, text `#F5F3F0 / #C9C4BD / #8F8880`.
- **Heatmap:** numbers on hover only (except Typical and current rows), one bracket "MODIS era, adjusted to
  VIIRS" instead of 11 badges, empty future cells.
- **Don't:** glassmorphism, fire-themed chrome, decorative KPI tiles, saturated imagery basemaps, text under
  12px, dark-only design (use light for the projector demo), mascot in the analytic view, invented data.

## 3. Reference studied: FireTrace concept (Dilum Sanjaya, X, 8 Oct 2026, ~1.6M views)

https://x.com/DilumSanjaya/status/2108241054298415258 — studied from the 1:53 video and the replies.

**What it is.** A *concept* for a single-incident wildfire forensic tool (one fire over four days). Built with
mock data; the author states the 3D terrain is procedurally generated, not a real DEM. Modes: Incident,
Drones (thermal feeds), Resources (aircraft and engines), Analyze, Share.

**Anatomy.**

| Zone | Content |
|---|---|
| Top bar | Product name, incident selector, location, date range, mode tabs |
| Canvas (centre, ~70%) | 3D terrain with fire perimeter progression, labelled time stamps, ignition marker; 2D/3D switch |
| Right inspector | Layers with checkboxes and opacity sliders; incident overview (key–value); weather & fire behaviour tiles |
| Bottom | One global **timeline scrubber** driving everything; three linked small charts (fire area, rate of spread, elevation profile); "Key events" list |

**Why it has impact.** Canvas-first (the data *is* the interface); one time control that drives every view
(narrative and video-friendly); a layers panel signals "professional tool"; dense but quiet panels with tabular
numbers; restrained warm-neutral palette where only fire is saturated; cinematic camera moves in the video.

**Fit for our challenge.**

| Aspect | Verdict | Why |
|---|---|---|
| 3D procedural terrain, drones, aircraft | Do not adopt | Different scale (one incident, hours) vs ours (25-year monthly climatology per area); no data for it; mock terrain conflicts with our "real NASA data" claim; costly with a ~1-day deadline |
| Canvas-first app shell with docked inspector | Adopt | Matches Windy/GFW; ends the "stack of boxes" look |
| Global time scrubber | Adopt — strongest idea | Our data is a time series 2001→2026 by month; scrubbing drives map, verdict and calendar highlight; ideal for the demo video |
| Layers panel | Adopt (small) | Hotspots, harmonized density, MODIS-era/VIIRS-era, area outline |
| Linked small charts at the bottom | Adopt | Season profile, annual totals, anomaly — synced to the scrubber |
| Key events list | Adapt → "Notable months" | Records and much-above-normal months, clickable |
| Warm neutral palette, fire-only saturation | Adopt | Converges with the audit's stone tokens |
| 2.5D | Optional, video only | Extruded hotspot-density hexagons over real terrain as a showcase view, never the default |

Caution from the replies: one user called it a 3D version of Watch Duty — the app responders actually use is
plain 2D. Legibility for emergency managers wins over spectacle; spectacle is for the video.

## 4. Proposed synthesis

FireTrace's shell (canvas + inspector + time scrubber + linked charts) + the audit's design tokens + the
content and logic from 09/10 (verdict, calendar, burning-calendar helper, honest caveats). Light theme by
default for the projector, dark theme for the video.
