# Frequently asked questions

## Why does a month show "Too few fires to judge"?
Because in most of the baseline years that calendar month had zero or almost zero hotspots in the area. A percentile
over mostly zeros is meaningless, so the calendar does not call it high or low. Small areas and wet months often fall
in this category.

## Why do the numbers differ from the FIRMS map?
The calendar counts vegetation fires only, with nominal or high confidence, inside the area's polygon, and expresses
MODIS-era months as VIIRS-equivalent estimates. FIRMS shows every detection of every sensor. Recent days also change
when NRT data are replaced by the Standard Processing archive.

## Why are hotspots not the same as fires?
One large fire can produce hundreds of hotspots over several days, while small, short or cloud-covered fires may be
missed. The Report tab compares hotspots with fires officially reported by CONAFOR (Mexico) or NIFC (United States),
which also miss many fires, especially small agricultural burns.

## How current is the data?
The pipeline loads new FIRMS data every day at 06:00 (Mexico City time). The pill at the top shows "Data through" the
last day loaded; the current month is marked "in progress" and compared with the same days of past months.

## Can I download the data?
Yes. The Report tab downloads the hotspots in the area and date range (CSV), the monthly harmonized series (CSV) and
PNG images of the calendar and charts. Illustrative data are labelled as such in the file names.

## Who made this?
Team A11 from Monterrey, Mexico, for the 2026 NASA Space Apps Challenge. The code is open on GitHub at
leonardos4enz/a11-nasa-2026.
