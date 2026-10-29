---
title: "Benchtop"
sidebar_position: 12.4
---
The **Benchtop** tab flies a rocket you have not designed, from a few things you can measure on the bench: its size, its weight, where it balances, its motor mount, its fins and its parachute. It asks for no drag coefficient. The rocket is flown through the same OpenRocket engine a design flies in, and the engine works out the drag from the shape. On a phone it is **🚀 Benchtop** on the bottom bar.

Use it to answer "how high on this motor?" or "which motors suit this rocket?" for a kit or a rocket built from someone else's plans. When the answer matters, **[Open as a design](#open-as-a-design)** and fill in the real parts.

The tab keeps its inputs and its last result while you switch tabs, until the page is reloaded.

**How it works**, beside the form on a wide screen and folded shut at the top of the form on a narrower one, sums up what to measure, what the tab works out and what it leaves out.

## Enter the rocket {#enter-the-rocket}

**Rocket.** Every field here is required.

- **Body diameter**: the outside diameter of the largest body tube.
- **Overall length**: from the nose tip to the aft end.
- **Dry mass**: the rocket ready to fly, without a motor. Include the recovery system and the wadding.
- **CG, no motor**: where the rocket balances with no motor in, measured from the nose tip. It can't be longer than the overall length.
- **Motor mount diameter**: the inside diameter of the mount, which is the widest motor it takes. A mount with no room for a tube of its own inside the body, such as a 29 mm motor in a 30 mm body, is a **minimum diameter** rocket: the body tube is the mount.

**Fins.**

- **Number of fins**: 1 to 8.
- **Shape**: **Trapezoidal**, **Elliptical** or **Parabolic**.
- **Fin length**: along the body, where the fin is glued on (the root).
- **Fin width**: from the body out to the tip (the span).

Leave the length or the width blank to use a fin sized for the body: 3 body diameters long and 1.5 wide. The box shows that size in gray, so you can see what is flown.

**Motor.** **Choose…** opens the motor picker, filtered to the motors that fit: no wider than the mount, and no longer than the body tube behind the nose. The mount's length is never a limit, because a motor longer than its mount sticks out the back on a retainer and flies fine. **[Motor guide](#motor-guide)** flies a set of motors at once.

**Parachute.** **Fly with a parachute** is off to start with, and the flight ends at apogee. Tick it to fly the descent too.

- **Canopy diameter**: across the flat canopy. Leave it blank to size one for you: the canopy that lands the rocket at 18 ft/s (5.5 m/s), the middle of the usual 15 to 20 ft/s for a main chute. It is sized for the dry mass plus the chosen motor's spent casing, in the air at your site, and rounded up to a whole centimeter or inch (whichever unit the box is in) so it is a size you can buy or cut. The box shows that size in gray. This is the same sizing as the [parachute sizing](./tools.md#parachute-sizing) tool.
- **Canopy Cd**: 0.8 to start with, typical of a flat or hemispherical round chute. An elliptical canopy is nearer 1.5; use the maker's figure if you have it.

The parachute opens on the motor's ejection charge.

**Launch.** **Rod or rail length**, **Site elevation** and **Temperature**. Leave the temperature blank for the standard atmosphere at that elevation.

Press **Run flight simulation**. While the flight runs, the button is **Cancel run**.

If something can't be flown, a notice above the button says what, with the numbers:

- The rocket must be longer than its 4:1 nose.
- The fin length has to fit on the body tube behind the nose.
- The CG has to be on the rocket.
- The motor mount must be narrower than the body.

## What is flown {#what-is-flown}

The rocket is built from your measurements:

- a 4:1 ogive nose, as wide as the body,
- one body tube behind it, to your overall length,
- your fins at the aft end,
- your parachute, packed at the top of the body tube,
- a mount tube as long as the motor, flush with the aft end (or the body itself, at minimum diameter).

Every part has the engine's default surface finish. The whole rocket is pinned to the dry mass and CG you entered, so the made-up parts weigh nothing of their own. The motor's mass is added on top and burns off as in any simulation.

The flight is always straight up in calm air: no wind, no turbulence, and a vertical rod. Without a parachute, nothing after apogee is shown.

## Read the result {#read-the-result}

The figures come in two groups.

**Off the launcher.** These barely depend on drag, so they are as good as your mass and motor:

- **Launcher exit speed**, flagged when it is under the minimum in **Settings > Simulation**.
- **Thrust/weight at exit**.
- **Max accel**.
- **Burnout**: the time the motor burns out.

**Estimated flight.** These depend on the drag of a nose the rocket may not have, so treat them as estimates:

- **Apogee** and **Burnout altitude**, above the pad.
- **Max speed**, and **Max Mach**, flagged above Mach 0.8, where the drag estimate is roughest.
- **Time to apogee**.
- **Ideal delay**: the coast from burnout to apogee. **Nearest delay offered** is the delay the motor is sold with that comes closest.
- **Stability off the launcher**, in calibers, flagged under 1. It comes from your CG and fins, with the stand-in nose; the real nose moves it a little.

**Under the parachute**, with one:

- **Deploy speed**: how fast the rocket is moving when the charge fires, flagged over the deploy-speed warning in **Settings > Simulation**.
- **Landing speed**, flagged over 20 ft/s (6.1 m/s).
- **Flight time**: liftoff to touchdown.

Change an input after a flight and the result says it is out of date.

## Motor guide {#motor-guide}

**Motor guide** on the Motor card flies many motors in the Benchtop rocket and lists them side by side. It has the same filters as the [motor guide for a design](./motors.md#motor-guide), with **Fits the mount** on and thrust to weight worked out from your dry mass.

1. Narrow the list with the filters. Every motor that matches is ticked; untick the ones you don't want, or use **Select none** and tick the few you do. Clicking anywhere on a row ticks or unticks it.
2. Press **Fly** once 16 or fewer are ticked. Each motor flies once, at the same launch, to find its ideal delay. With a parachute, a motor whose nearest delay is not the one it was first flown at flies again at that delay, so its deploy speed is the one that delay gives. The guide shows its progress. **Cancel** stops it and keeps the motors already flown.
3. The table has one row per motor and sorts by any column: total impulse, average thrust, launcher exit speed, thrust to weight at exit, max acceleration, apogee, max speed, max Mach, time to apogee, ideal delay, nearest delay and stability, and with a parachute, deploy speed and landing speed. **Status** flags a slow exit, a flight near Mach 1, low stability, a fast deployment and a hard landing.

Every motor flies under the same canopy, as the real rocket would. A blank diameter is sized for the motor chosen on the tab, so a heavier motor's casing shows up as a faster landing.

**Use** puts that motor and its figures back on the tab, and keeps the canopy the guide flew. **⬇ CSV** downloads the table, as sorted, in your units. **Clear** empties the table to fly another set.

On a phone the table is a list of cards, one per motor, with a **Sort by** menu above them. The filters are hidden while results are shown; **Clear** brings them back.

The guide is kept with the tab's inputs. Change the rocket or the launch and it says it is out of date, and **Use** is turned off until it is flown again.

## Open as a design {#open-as-a-design}

**Open as a design** starts a new design from the Benchtop rocket and switches to the **Design** tab. It has:

- the nose, body tube, fins, mount and parachute described in [what is flown](#what-is-flown),
- the stage's mass and CG overrides set to your dry mass and CG, covering the whole stage,
- a flight configuration with your motor in the mount,
- a simulation of it with your rod length, elevation and temperature.

From there, replace the stand-in parts with the real ones: the nose's shape and length, the fins' outline, the recovery harness. Once the parts weigh what the real ones do, turn off the stage's overrides to let the design work out its own mass and CG.
