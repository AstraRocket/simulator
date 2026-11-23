---
title: "Rocket Optimization"
sidebar_position: 12.3
---
The optimizer answers "what size should this part be?": it flies a simulation over and over with chosen dimensions changed and keeps the design that best meets a goal, such as the highest apogee or a landing speed of exactly 5 m/s. It works the way desktop OpenRocket's optimizer does, with the same goals, stability limits and search methods. Open it with **Optimize** on the **Simulations** tab. It works on the active simulation, using that simulation's launch conditions, flight configuration and settings.

## Set it up

The dialog has two columns. The left one holds the parameters: the list to optimize at the top and the tree of available parameters under it. The right one holds the goal, the stability limits and **Optimize**, with the results under them. On a narrow screen the columns stack.

1. **Goal.** Choose **Maximize**, **Minimize** or **Aim for** and a flight figure: apogee, max speed, max acceleration, stability, landing speed, deployment speed, landing distance from the pad or flight time. **Aim for** asks for the value to aim at.
2. **Stability limits.** A design outside them is never chosen, and is not flown. **Minimum** starts on at 1 caliber and **Maximum** off at 5, as on desktop. **Stability in** switches both between calibers and the CP to CG length. Stability is the on-pad figure the design panel shows, with the motors in.
3. **Parameters.** As on desktop, **Available parameters** lists the rocket's parts as the design tree nests them, each part's parameters under it. A part that has other parts inside keeps its own parameters in a collapsed **Optimization parameters** group. Double-click a parameter, or select it and press **Add** (Ctrl-click selects several), to move it to **Parameters to optimize**, then set its **Minimum** and **Maximum** there. A parameter already in the list is grayed out in the tree. **Remove** takes out the rows whose boxes are checked, and **Remove all** empties the list. Each range starts at half to twice its current value, as on desktop. Delays start at 0 to 5 s for ignition and 0 to 10 s for deployment, and a position starts at every place that keeps the part inside the one it sits in.
4. Select **Optimize**.

## The parameters

The list is built from the design. A part in a stage that the configuration grounds is left out.

| Part | What can vary |
| --- | --- |
| Nose cone | Length; base diameter, unless it is automatic |
| Transition | Length; fore and aft diameter, unless automatic; shape parameter, for a shape that has one |
| Body tube | Length; diameter, unless automatic |
| Trapezoidal fins | Root chord, tip chord, sweep length, height, position |
| Elliptical fins | Root chord, height, position |
| Freeform fins | Position |
| Inner parts (inner tubes, couplers, rings, bulkheads, engine blocks, recovery devices, shock cords, mass components) | Position |
| Mass component | Mass |
| Motor mount | Motor overhang; ignition delay, for a motor in an upper stage |
| Parachute | Diameter |
| Streamer | Length, width |
| Parachute or streamer | Deployment delay; deployment altitude, when it deploys at an altitude |

Each value is set the way typing it into the design editor would set it, so automatic diameters and shoulders follow. A deployment or ignition delay that the flight configuration sets for itself is changed in that configuration, as desktop does.

### What desktop offers that this does not

Desktop's optimizer lists some values that none of its goals can use. Each one either always ends at one end of its range or changes nothing a goal measures, so they are left out here:

- **Fin cant.** It only changes the roll rate, and no goal measures roll.
- **Wall thickness** of nose cones, transitions and body tubes. It only adds mass, so the search always runs it to the bottom of its range. To trade mass for a goal, vary a mass component instead.
- **Mass and CG overrides.** These are measurements of a built part, not a design choice.
- **Parachute and streamer drag coefficients.** These come with the canopy or streamer you buy. Vary its size instead.
- **Streamer aspect ratio.** It is the length over the width, which are both offered.
- **Launch lug length, diameter, thickness and position.** They barely change the flight.
- **Ignition delay of a bottom stage's motor.** It only holds the rocket on the pad longer.

## How it searches

Each parameter is scaled from 0 at its minimum to 1 at its maximum, and the search starts from the design as it is. With one parameter to optimize it uses a golden-section search. With more it uses a multidirectional search. Both stop once a step is below 0.5% of each range, as desktop's do.

Unlike desktop, the search never leaves the ranges you set. When a step at the edge of a range finds nothing better, it tries one step along each parameter before taking smaller steps, so a best design at the edge of a range is still found. It stops after 500 designs if it has not finished by then.

Every flight uses the same turbulence seed, so the differences between designs come from the design. A design the engine refuses to build or fly scores worst, and the search goes on.

## The results

- **Steps** lists the start and each better design the search found, with its stability and its goal figure. The last row is the best.
- **Apply** sets the design to the best one, as one undo step. It is off when nothing was better than the start, and when the design or the simulation has changed since the run.
- **⬇ CSV** downloads every design tried, in your units: each parameter, its stability and its goal figure. A design outside the stability limits has an empty goal figure.
- **Cancel** stops the search and keeps the best design so far.

The results are not saved. They stay until you clear them, optimize again or open another design.
