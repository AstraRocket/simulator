---
title: "Compared with OpenRocket"
sidebar_position: 18
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info About this snapshot

Written **2026-09-29**, comparing **AstraRocket <AppVersion />** (engine built from OpenRocket <UpstreamPin />) against **desktop OpenRocket**: release **24.12**, the current numbered release, and the `unstable` development line the engine pin sits on.

:::

## The engine

The aerodynamics, the mass and CG build-up, and the flight integration are **OpenRocket's own code**, extracted from the commit above and compiled to WebAssembly and JavaScript. They are not a reimplementation. Their static figures are checked against the same kernel running on a JVM and match apart from rounding in the last digit, and their flights agree with that JVM run within a small tolerance. For the same design, the same motor and the same conditions, the same code computes the numbers.

## The product

Desktop OpenRocket is a Java program you install. AstraRocket runs in a browser, installs from there, and keeps working with the network off. The tables below are about **the program around the engine**: what you can author, what you can look at, and what you can get out.

## What desktop OpenRocket has

| Desktop feature | Here |
| --- | --- |
| **Component colors and 3D appearance** | Available. Color, line style, paint, shine and opacity, drawn in the 2D and 3D views. |
| **Saving your own components** | Partly. **Save as part** keeps a component in your browser and carries it in the backup file, but not as an `.orc` file. |
| **Printing** | Available, as a PDF design report with 1:1 templates. |
| **Textures and decals** | Not available. Decals are removed on import. |
| **Photo Studio** | Not available. |
| **Rocket optimization** | Not available. |
| **Custom expressions** | Not available. The flight CSV export has the raw series. |
| **Simulation extensions and scripting** | Not available. A `.ork` keeps them on save, so desktop still has them. |
| **Languages** | Partly. OpenRocket ships in more languages. |

## What AstraRocket has

| Feature | Notes |
| --- | --- |
| **Runs in a browser, installs, and works offline** | No JDK and no download; a full simulation runs at a field with no signal. See [Offline & Installing](./offline-and-installing.md). |
| **A layout that fits a phone** | Tabs along the bottom, with the rocket views rotated to run down the long edge of the screen. |
| **Ground-track view** | The flight from above, with range rings and each stage's landing distance and bearing. |
| **Flight-path export to KML / GPX / waypoint CSV** | Opens the flight in Google Earth or a GPS app, with custom Mustache templates. |
| **Whole-rocket 3MF, and per-part STL / GLB / 3MF** | Ready for a slicer. OpenRocket exports OBJ, which this does too. |
| **DXF cut sheets** | Fins, rings and bulkheads as 2D cut files. |
| **RASAero II (`.CDX1`) export** | Hands the design to RASAero II for its own aerodynamic analysis. |
| **RockSim `.rkt` export** | OpenRocket reads RockSim files but does not write them. See [Files & Exports](./files-and-exports.md#rocksim-rkt). |
| **Saved launch locations, on a map** | Name a field and recall its coordinates and elevation, with satellite or street imagery and click-to-set. A similar feature is [open upstream as a pull request](https://github.com/openrocket/openrocket/pull/3211). |
| **Weather from a forecast, for a chosen date** | Fills the launch conditions and the wind profile from [Open-Meteo](./running-a-simulation.md#weather). Desktop's version (PR #3211) is not merged and fetches current conditions only. |
| **A forecast atmosphere aloft** | Temperature, pressure and humidity by altitude, flown in place of the standard atmosphere. Issue #2737 proposes this for desktop. |
| **Environment view** | The air the flight actually met, from the conditions at launch to profiles against altitude. See [Views & Analysis](./views-and-analysis.md#environment-after-a-simulation). |
| **Landing across the forecast hours** | Flies the design under each hour from two before to two after and maps the landings with a 2σ ellipse. See [Views & Analysis](./views-and-analysis.md#where-it-landed). |
| **Landing estimator** | A site, a forecast hour, an apogee and descent rates give a landing zone, with no design needed. See [Tools](./tools.md#landing-estimator). |
| **Rail length needed** | Each run reports how long a launcher the design needs to leave it at your minimum exit speed, beside the time, thrust to weight and angle of attack at exit. See [Running a Simulation](./running-a-simulation.md). |
| **Parachute descent sizing** | The descent rate a canopy gives, and the diameter needed to hit a target rate. |
| **NAR / Tripoli limits, enforced** | A run past the rail angle or surface wind limits is refused rather than flown. See [Safety](./safety.md). |
| **A shoulder that follows the tube it plugs into** | A switch keeps a shoulder at the bore of the adjoining part. See [Designing a Rocket](./designing-a-rocket.md). |
| **Grounding a stage per configuration** | A checkbox on each configuration's Staging card. See [Flight Configurations](./flight-configurations.md#staging). |
