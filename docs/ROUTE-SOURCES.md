# Route source inventory

Checked 2026-10-16. All four direct data URLs below returned HTTP 200 and were
inspected. These are source candidates, not validated runtime packages. The GPX
files were also parsed with OpenRide's actual importer in memory.

Distances below are computed horizontal great-circle polyline lengths using
Earth radius 6,371,008.8 m, rounded for reporting. They are not independently
verified course distances or accuracy claims.

## 1. Alpe d’Huez — Oisans Tourism

- [Publisher and route description](https://en.oisans.com/equipement/alpe-dhuez-la-montee-mythique/)
- [Direct GPX](https://static.apidae-tourisme.com/filestore/objets-touristiques/plans/25/241/10547481/04-alpe-d-huez-la-montee-mythique.gpx)
- Provider: Oisans Tourism, Apidae offer 233170. Publisher page reports update
  2026-06-24. XML creator is GPS Visualizer; that is not an elevation-source claim.
- One track/segment, 2,222 samples, all with elevation; approximately **30.745 km**.
  Largest adjacent horizontal gap: **91.5 m**.
- Starts and ends at **45.05435, 6.03255**, elevation 719 m as supplied.
- The file covers an out-and-back, including the approach from Bourg-d’Oisans and
  descent. Extract the ascent in sequence and review the start and Avenue du Rif
  Nel finish; do not use the whole recording as a 14 km climb.
- **Current importer result:** rejected at sample 179 for an implausible grade.
  Review short-segment elevation changes against independent road-height evidence;
  do not relax the guard just to load it.
- [Additional official reference](https://www.alpedhuez.com/en/activities/summer-activities/bike/the-21-bends/)
  describes the 21 numbered bends and timing endpoints. Its headline figures are
  not a substitute for endpoint-matched validation.

## 2. Marseille — two complementary sources

### Preferred historical alignment: 2017 Tour, stage 20

- [Publisher and historical route description](https://www.cyclingstage.com/tour-de-france-2017-route/stage-20-tdf-2017/)
- [Direct KML](https://cdn.cyclingstage.com/images/tour-de-france/2017/stage-20-route.kml)
  (linked through the page's interactive map; **not GPX**).
- Provider: Cyclingstage.com. One LineString, **716 coordinates**, approximately
  **22.422 km**; largest adjacent gap **479.9 m**.
- Starts at **43.27104, 5.39611**, ends at **43.27108, 5.39570** near the Vélodrome.
- **All 716 altitude values are zero.** Treat them as missing evidence, not a
  flat Marseille course. The historical course includes Notre-Dame de la Garde.
- Convert the LineString to GPX, preserving longitude/latitude order correctly,
  then extract the Corniche traversal in recorded sequence. Label it a selected
  segment of the 2017 route. Densification alone cannot recover bend geometry
  missing from long source segments; check alignment and acquire elevation.

### Direct GPX alternative: Corniche tourism itinerary

- [Publisher page](https://www.marseille-tourisme.com/en/discover-marseille/nature/hiking/walking-along-the-corniche-kennedy-marseille-7eme-en-3938337/)
- [Direct GPX](https://static.apidae-tourisme.com/filestore/objets-touristiques/plans/132/8/15599748/Balade+urbaine+le+long+de+la+Corniche+Kennedy.gpx)
- Provider: Office de Tourisme et des Congrès de Marseille; GPX creator Cirkwi.
- One track/segment, **74 samples**, approximately **4.522 km**, **no elevation**.
  Largest adjacent gap: **201.0 m**.
- Start **43.29117, 5.35582** (Catalans area), end **43.26179, 5.37461** (David/Prado).
- A tourism/walking itinerary, not an authenticated race reference line. The page
  also describes optional sightseeing loops. Check the actual line against the
  carriageway before adopting any part; do not silently snap it to the road.
- **Current importer result:** missing elevation. The explicit flat-preview option
  permits a degraded demonstration, not a validated coastal training route.

## 3. Paris — select the 2023 finale layout

- [Publisher and stage description](https://www.cyclingstage.com/tour-de-france-2023-route/stage-21-tdf-2023/)
- [Direct GPX](https://cdn.cyclingstage.com/images/tour-de-france/2023/stage-21-parcours.gpx)
- [Paris circuit map, attributed by publisher to letour.fr](https://cdn.cyclingstage.com/images/tour-de-france/2023/stage-21-route-paris.jpg)
- Provider: Cyclingstage.com; GPX creator GPSBabel. Embedded file timestamp
  **2023-06-20T07:10:51.667Z** predates the race and is not an acquisition date or
  proof of an actual ridden recording.
- One track/segment, **7,297 samples**, all with elevation; approximately
  **114.273 km**. Largest adjacent gap: **271.7 m**.
- Start **48.81269, 2.03586**, end **48.86851, 2.31178**.
- This is the full stage, not a single circuit. Publisher describes eight final
  laps of almost 7 km. Extract one complete Champs-Élysées lap by sequence,
  cross-check the 2023 circuit map, and validate the closure, direction, tangent
  and grade before declaring a loop. Do not deduplicate repeated visits globally.
- **Current importer result:** rejected at sample 28 for an implausible grade.
  That sample is in the full-stage approach; audit the extracted lap independently.

## Provenance and publication status

For all candidates, elevation accuracy, vertical datum and horizontal source
resolution remain **unknown**. GPX coordinates are interpreted as WGS84; neither
the number of decimal places nor dense samples establishes survey accuracy.

The checked pages offer public downloads, but no explicit open redistribution
license for these track files was established. Record the source attribution and
obtain applicable reuse terms before committing originals or derived packages to
public static assets. Public download availability is not redistribution permission.
Original files were inspected in memory, not added to the repository.

Recommended next sequence: resolve reuse terms, extract the intended courses,
audit alignment/structures, source corrected road elevations, then define and
measure independent accuracy tolerances. See [pipeline documentation](GEOGRAPHIC-ROUTES.md).
