---
title: "Compared with ThrustCurve.org"
sidebar_position: 21
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info About this snapshot

Checked **2026-10-25**, comparing **AstraRocket <AppVersion />** (engine built from OpenRocket <UpstreamPin />) against **[ThrustCurve.org](https://www.thrustcurve.org)**, read from its menus, its Attribute Search and Match a Rocket forms, and its motor guide and flight simulation help pages.

:::

## Two different tools

ThrustCurve.org is the motor database: thrust curve files from the certifying bodies, the manufacturers and users, with search, motor pages and a quick motor guide. AstraRocket is a flight simulator, and its motor catalog is built from ThrustCurve.org's data. The two work together more than they compete: ThrustCurve.org is where the data comes from, and this app is where it gets flown.

## The motor data

The weekly catalog sync asks ThrustCurve.org for every motor, in production or not, and bundles each one's thrust curves with the app, so picking a motor works offline. 1,063 of the 1,156 motors have a curve; the other 93 have no curve published on ThrustCurve.org either. They are listed here for their specs but can't be flown unless you import an `.eng` or `.rse` file for them. A motor with several curves (certified, manufacturer, user) keeps them all, and the picker hides curves more than 95% similar to the one shown.

## Choosing a motor

ThrustCurve.org's **Match a Rocket** and this app's **[motor guide](./motors.md#motor-guide)** answer the same question: which motors suit this rocket.

| | ThrustCurve.org Match a Rocket | AstraRocket motor guide |
| --- | --- | --- |
| **The rocket** | Body diameter, dry weight, a drag coefficient preset (0.3 to 1.0), motor mount diameter and length. | Your design: every part, with the engine's mass, CG and drag. |
| **The physics** | A quick simulation on the original RASP algorithms: one fixed drag coefficient, constant gravity, no wind, stopping at apogee. | OpenRocket's full flight simulation: drag that changes with speed, wind and turbulence, the atmosphere, through recovery to landing. |
| **The launch** | Temperature, base altitude, guide length and a stable velocity. | The simulation's own launch conditions: rail or rod, site, weather and wind profile. |
| **Motors per run** | Every motor that fits and passes the filters. | Up to 8, ticked from the filtered list. |
| **Filters** | Impulse class, motor type, manufacturer, out of production. | Impulse class, manufacturer, total impulse, diameter and fit, plugged, out of production, average and max thrust, burn time, weights, length, Isp, and thrust-to-weight for your rocket. |
| **Results** | Liftoff weight, launch speed, max velocity, max acceleration, apogee, time to apogee, optimal delay. | Those, plus stability margin and thrust-to-weight at launcher exit, deployment and landing speeds, and each motor flown at the delay it offers nearest its best one. |
| **Safety** | Flags motors with too little initial thrust for the weight, with notes when the 5:1 ratio or minimum velocity could not be checked. | The warnings a normal run gives: exit speed against your minimum, margin at exit, deployment speed, and the engine's flight warnings. NAR and Tripoli launch limits refuse a flight outright. |
| **Keeping a result** | | **Use** turns a row into a flight configuration and a simulation of it. |
| **Saved rockets** | Rockets saved to an account, and a list of other users' public rockets. | Designs saved in the browser's design library; share one by sending the `.ork`. |

## What ThrustCurve.org has

| ThrustCurve.org feature | Here |
| --- | --- |
| **Contributing motor data** (from a certifying body, a manufacturer or a user) | Not available. The app reads the data ThrustCurve.org publishes. |
| **TCtracer**, to trace a thrust curve from a graph image | Not available. Import an `.eng` or `.rse` file. |
| **Search/Download API** | Not available. The app works from the synced catalog. |
| **Search by flame, smoke, case, propellant, Class 1 (under 125 g), HazMat exempt and CSFM approved** | Not available. The catalog does not carry those fields; the propellant and whether a motor is sparky show in its detail. |
| **Search by motor type** (single use, reload, hybrid) | Not a filter. The type shows in a motor's detail and as a Motor Dashboard column. |
| **Most popular, recently viewed and latest updates** | A banner says when a refreshed catalog arrives, with how many motors are new and how many were removed. |
| **Certification, manufacturer and statistics pages** | Not available. The [Glossary](./glossary.md) covers the terms. |
| **Manufacturer file sets** to download | Not available. |
| **Accounts, saved and public rockets** | Not available. Nothing here needs an account. |
| **Every fitting motor in one guide run** | Up to 8 per run, picked from the filtered list. |

## What AstraRocket has

| Feature | Notes |
| --- | --- |
| **Your actual design, flown** | The motor guide flies the design's own parts, recovery and launch conditions, not a diameter and a drag coefficient. |
| **No design, and still no drag coefficient** | The **[Benchtop](./benchtop.md)** takes what Match a Rocket takes, less the drag coefficient and plus the CG and fins, and flies it through the full engine, with a motor guide of its own. |
| **Results past apogee** | Deployment speed, landing speed and where it came down, with the engine's warnings for each motor. |
| **Each motor at a delay it offers** | Flown again at the charge nearest its best delay, so the deployment speed is the one that charge gives. |
| **Keeping a motor** | **Use** makes a configuration and a simulation from a guide row, as one undo step. |
| **Filters ThrustCurve.org's search does not have** | Total impulse, burn time, total and propellant weight, length, Isp, and thrust-to-weight worked out from your rocket, including the motors in other mounts and every motor in a cluster. |
| **Motor Dashboard** | Overlay thrust curves to compare them, or combine motors into one cluster curve. |
| **Imported motors fly** | An `.eng` or `.rse` file becomes a motor you can pick and fly, saved in the browser. |
| **Offline, with no account** | The catalog and its curves come with the app. |
