---
title: "Compared with mmrocket-sim"
sidebar_position: 20
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info About this snapshot

Checked **2026-10-19**, comparing **AstraRocket <AppVersion />** (engine built from OpenRocket <UpstreamPin />) against **[mmrocket-sim](https://github.com/mtnmanak/mmrocket-sim)** at v0.192 (2026-10-18), read from its user guide.

:::

## The engine

Both run OpenRocket's own kernel, compiled out of Java with TeaVM. mmrocket-sim builds from OpenRocket 24.12 and compiles to JavaScript. AstraRocket builds from the newer **unstable** branch and compiles to WebAssembly, with a JavaScript fallback. Two cores on different OpenRocket commits can give different numbers without either being wrong.

mmrocket-sim also offers its own aerodynamics models beside OpenRocket's, including a supersonic model (beta) calibrated against published wind-tunnel and free-flight data. AstraRocket flies OpenRocket's Extended Barrowman model unchanged.

## The product

Both are browser apps from independent authors, with no install, an installable version and offline use. mmrocket-sim, by Mountain Man Rockets, leans toward building and flying a kit: fabrication aids, a field screen and motor sweeps. AstraRocket leans toward launch-day planning: forecasts, maps, landing estimates and exports.

## What mmrocket-sim has

| mmrocket-sim feature | Here |
| --- | --- |
| **Selectable aerodynamics models, including supersonic (beta)** | Not available. This app flies OpenRocket's Extended Barrowman model. |
| **Camera shrouds** | Not available. |
| **Protuberances** (drag-only bumps such as raceways) | Not available. |
| **Vent and marking holes on a tube** | Not available, and not planned. |
| **Measured mass and CG matching** | Available, through mass and CG overrides. There is no suggested ballast mass. |
| **Batch simulation across the motor catalog** | Available as the **[motor guide](./motors.md#motor-guide)**: up to 8 filtered motors in one mount at a time, one motor choice for a whole cluster. |
| **Fly screen for phones** | Not available. The phone layout uses the same tabs as the rest of the app. |
| **Sharing a design by link** | Not available. Share a design by sending the `.ork`. |
| **Fin alignment jigs** | Not available. |
| **Splitting tall parts to a 3D printer's build volume** | Not available. |
| **Custom X-Y plots** | Not available. |

## What AstraRocket has

| Feature | Notes |
| --- | --- |
| **A newer OpenRocket core** | The **unstable** branch carries upstream fixes that are not in 24.12. |
| **WebAssembly** | With a JavaScript fallback; a badge in the header says which loaded. |
| **Multilingual** | |
| **Several simulations, each with its own launch conditions** | Theirs share one set of launch conditions across configurations. |
| **A library of saved designs** | Theirs keep one autosave and a recent-files list. |
| **Forecast atmosphere aloft and humidity** | Temperature, pressure and humidity by altitude from the forecast. Theirs fetch winds aloft only. |
| **Saved launch locations, on a map** | Name a field and recall its coordinates and elevation, with satellite or street imagery. |
| **Ground track over map imagery** | With range rings and each stage's landing distance and bearing. Theirs is a plain chart. |
| **3D flight path with playback** | Countdown, scrub and speed control. |
| **Environment view** | The air the flight actually met. See [Views & Analysis](./views-and-analysis.md#environment-after-a-simulation). |
| **Landing across the forecast hours** | Flies the design two hours either side and maps the landings. See [Views & Analysis](./views-and-analysis.md#where-it-landed). |
| **Wind-sweep drift region** | Flies a grid of wind speeds and headings and draws the landing envelope. |
| **Tools that need no design** | Landing estimator, rail exit check and parachute sizing. See [Tools](./tools.md). |
| **NAR / Tripoli limits, enforced** | A run past the rail angle or surface wind limits is refused rather than flown. Theirs cautions. |
| **Per-component stability and roll tables** | CNα, CP, mass, and roll forcing and damping per part. Theirs breaks down drag only. |
| **Motor Dashboard** | Overlay thrust curves and combine motors into a cluster. |
| **Freeform fins from an image** | Trace a fin outline from a picture, or convert a fin set to freeform. |
| **3D cutaway and appearance styles** | A cutaway, and line style, shine and opacity per part. |
| **Flight-path export to KML / GPX / waypoint CSV** | Opens the flight in Google Earth or a GPS app, with custom Mustache templates. |
| **Whole-rocket 3MF and Onshape export** | One file with a named object per part, or the rocket as Onshape parts. |
| **Undo that covers simulations too** | Theirs covers the design tree only. |
| **A unit picker on every value** | Theirs sets units per quantity. |
| **Random seed and gravity model settings** | Theirs fixes the seed and the gravity model. |
| **Backup file** | Materials, parts, locations, motors, templates and settings in one file. |
