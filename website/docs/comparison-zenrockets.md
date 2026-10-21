---
title: "Compared with ZenRockets"
sidebar_position: 19
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info About this snapshot

Written **2026-09-23**, comparing **AstraRocket <AppVersion />** (engine built from OpenRocket <UpstreamPin />) against **[ZenRockets](https://zenrockets.com)** at **v0.2.0**, the latest entry in [their changelog](https://zenrockets.com/docs/changelog) on that date (dated 2026-09-15).

:::

## The engine

The two do not share a physics engine. AstraRocket runs **OpenRocket's own kernel**, compiled to WebAssembly and JavaScript, and checked against the same code on a JVM. ZenRockets [credits](https://zenrockets.com/docs/acknowledgements) **RocketPy** as "the flight simulation foundation used by ZenRockets' trajectory service", **openMotor** for its internal-ballistics work, and OpenRocket for file-format compatibility and validation references.

So the same rocket, the same motor and the same conditions will not necessarily give the same apogee in both. To find out which is closer, fly the rocket and compare both against the altimeter.

## The product

ZenRockets is an account-backed service: designs are "private by default with public share links and cloning", with dashboards for rockets, motors, flights, presets and materials. AstraRocket runs in a browser with no account and no server, uploads nothing, and keeps working with the network off.

## What ZenRockets has

| ZenRockets feature | Here |
| --- | --- |
| **Motor design** (cases, grain geometries, nozzles, propellants, internal ballistics) | Not available, and not planned. This app picks motors from published thrust curves. |
| **Static-fire data** (overlay a test-stand trace on a simulated curve, or fly it) | Not available. `.eng` and `.rse` curves import, but there is no measured-versus-predicted overlay. |
| **Flight-log import** (an altimeter CSV as a recorded flight, with event detection) | Not available. It is [on the roadmap as a "maybe"](https://github.com/AstraRocket/simulator/blob/master/TODO.md), because every altimeter writes a different CSV. |
| **Comparing several flights, time-aligned** | Not available. The charts, ground track and 3D view draw one flight at a time. |
| **Linked dimensions** (a field that references another part's dimension) | Partly. Parts on **Auto** follow their tube as in desktop OpenRocket; a field cannot reference an arbitrary other field. |
| **Section cutaway view** | Available. The **Cutaway** button on the 3D view opens the airframe along the centerline. |
| **An event timeline with the state at each event** | Available. The **Flight events** table gives each event its time, altitude and speed, plus static margin, thrust to weight, angle of attack or Mach where they apply. |
| **Max-Q** | Available, as a summary tile and an events row, from airspeed rather than ground speed. |
| **Resolved atmosphere profiles** | Available. The **Environment** view shows the air the flight met. See [Views & Analysis](./views-and-analysis.md#environment-after-a-simulation). |
| **Live weather forecasts and real launch sites** | Available. **Get weather…** fills the launch conditions from an [Open-Meteo](./running-a-simulation.md#weather) forecast for a chosen date and hour, and saved locations hold the sites. |
| **Map imagery under the trajectory** | Available. Satellite or street imagery under the ground track and the 3D path. |
| **Mass rollup and stage isolation in the parts tree** | Not available. |
| **Share links, cloning and dashboards** | Not available, by design. There is no account and no server; share a design by sending the `.ork`. |
| **Pricing plan** | Free, and open source under the GPL 3.0 license. |

## What AstraRocket has

| Feature | Notes |
| --- | --- |
| **OpenRocket's own engine** | The actual code, checked against the same code on a JVM, so the physics is desktop OpenRocket's. |
| **Writing `.ork` and `.rkt`, not just reading them** | Both formats export as well as import. Their documented export is 3MF. See [Files & Exports](./files-and-exports.md). |
| **Tube fins and nested pods on RockSim import** | Their import documentation lists these as skipped. Both import and simulate here. |
| **Working fully offline, with nothing uploaded** | The app, the engine and both catalogs stay on your device, and there is no account. |
| **Component Analysis** | Per-component drag, stability contribution and CP, and roll forcing and damping, over a Mach sweep. |
| **Everything you can get out of it** | PDF design report with 1:1 templates, DXF, STL / OBJ / GLB / 3MF, RASAero II `.CDX1`, CSV, KML / GPX, and the schematic as SVG, PNG or JPG. Their documented export is 3MF. |
| **NAR / Tripoli limits, enforced** | A run past the rail angle or surface wind limits is refused rather than flown. Their pre-flight validation reports errors and warnings instead. |
| **Multilingual** | |
| **Free** | |
