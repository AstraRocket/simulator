---
title: "Motors"
sidebar_position: 9
---
A motor is assigned to a rocket's **motor mount** (inner tube). Motors live in a [flight configuration](./flight-configurations.md), and the **Configurations** tab is where they are picked: one card per mount, each showing the motor it holds and a **Change…** button to pick a different one.

## The motor picker

The picker searches a bundled catalog of **~1,150 real motors** from [thrustcurve.org](https://www.thrustcurve.org): filter by manufacturer, diameter, impulse class, total impulse (a minimum and a maximum, either one optional), and designation. Selecting a motor shows its dimensions and total impulse.

- **Fits the mount**: only motors that go in this mount, by its bore and the length it has room for, including the motor overhang. The bore is shown in the label. It is on by default when the picker is opened for a mount; turn it off to see the whole catalog.
- **Plugged**: only motors the manufacturer lists without an ejection charge, for staging or electronic recovery. Any motor can still be flown plugged from the delay control (see [Ejection delay](#ejection-delay)).

- **More filters**: bounds on **average thrust**, **max thrust**, **burn time**, **total weight**, **propellant weight**, **length** and **Isp** (estimated from total impulse and propellant weight), each a minimum and a maximum in your own units, either one optional. They are folded away until you open them, and the button counts how many are set. A motor the catalog gives no figure for is hidden once that figure has a bound, since there is nothing to check it against. The Motor Dashboard and the [motor guide](#motor-guide) have the same filters.
- **Thrust/weight**: in the picker opened from a mount, and in the motor guide, More filters also bounds the motor's average thrust over the rocket's liftoff weight: the airframe, the motors already in the other mounts, and every motor the mount takes, so a cluster counts each one. It is the figure the usual 5 : 1 rule is stated in. The Motor Dashboard has no rocket to lift, so it does not offer it.

Three more filters work as desktop OpenRocket's motor chooser does:

- **Hide motors not in regular production**: the catalog includes about 340 motors that are out of production, for anyone who still has one. They are hidden until you clear this box, and a motor's detail says **Out of production**. The choice is remembered.
- **Hide motors already used in the mount**: leaves out the motors this mount already flies in its other flight configurations. It appears when there are any.
- **Hide very similar thrust curves**: many motors carry more than one curve (certified, manufacturer, user-submitted). With this on, the curve list leaves out curves more than 95% similar to the one shown, by OpenRocket's own measure. On by default, and remembered.

- The **catalog** (specs for every motor) ships with the app: no lookup needed to browse.
- The **thrust curve** comes bundled with the catalog, so picking a motor resolves instantly and works offline. About 90 motors have no published curve. The picker still lists them with their specs, marked **no curve**, but they can't be selected or flown. To fly one, import an `.eng` or `.rse` file for it (see [Importing your own motors](#importing-your-own-motors)).

## Motor guide

The motor guide answers "which of these do I fly": it flies a set of candidate motors in your rocket and lists every flight in one table. Open it with **Motor guide** on the **Simulations** tab. It works on the active simulation, using that simulation's launch conditions, flight configuration and settings.

1. If the design has more than one motor mount, pick the **Mount** to try motors in. Every other mount keeps the motor its configuration already has.
2. Narrow the list with the same filters as the motor picker. **Fits the mount** is on by default. The motors that match are listed below the filters, each ticked; untick any you don't want, until 8 or fewer are ticked. The guide only flies motors whose thrust curve is on your device: the curve bundled with the catalog, or one you imported. A motor with no published curve is left out, and the guide says how many.
3. Select **Fly**. Each motor is flown once to find its **best delay**, then again at the delay it offers nearest to that, so the deployment speed in its row is the one that delay gives. A tie goes to the shorter delay. Every flight uses the same turbulence seed, so the differences between rows come from the motors.

The table has one row per motor and sorts by any column: the delay it was flown at, the motor's total impulse, average thrust and burn time, apogee, max speed and acceleration, launcher exit speed, stability margin and thrust to weight at launcher exit, time to apogee, best delay, deployment speed and landing speed. **Status** gives each flight the same warnings its results would: launcher exit below the minimum in **Settings > Simulation**, a marginal or unstable margin at exit, a deployment too fast or too slow, and how many flight warnings the engine raised. Hover over the status to read the warnings.

A motor that a single run would refuse is listed under the table with the reason. For example, a high power motor makes the launcher angle limit 20°, so a 25° launch is refused for that motor only.

- **Use** keeps one motor: it adds a flight configuration with that motor in the mount, and a simulation of it next to the one you started from. Run it to see its full results. This is one undo step.
- **⬇ CSV** downloads the table in your units.
- **Cancel** stops the guide and keeps the motors already flown.

The flights are not saved and do not add simulations. The table stays until you clear it, fly the guide again or open another design. If you change the design or the simulation after flying, the table says so and **Use** is turned off until you fly it again.

## Ejection delay

Where a motor offers multiple ejection delays, pick the one you're flying (or a **plugged** option for motors used without an ejection charge). The delay feeds the recovery-deployment timing in the simulation.

## Importing your own motors

### `.eng` files (RASP)
Import a standard **`.eng`** thrust-curve file: it carries its own curve, so no lookup is needed. You can choose several files at once; a file that cannot be read is named and the rest are imported. Imported motors appear in the picker (flagged, and deletable) and are saved in your browser.

### `.rse` files (RockSim)
The same button takes **`.rse`**, which is the format to use for a **hybrid**. RASP has no way to record a motor's type, so an `.eng` import is a motor of unknown type, while a `.rse` import reads as a hybrid (or reloadable, or single-use) in the motor detail panel. Either format can say a motor is sold **plugged** (in `.eng`, a `P` in the delay list), which is what the picker's plugged filter looks for.

`.rse` also carries more data that affects the simulation. `.eng` gives a single propellant weight and leaves the mass curve to be reconstructed from the thrust curve; `.rse` records the mass at every sample, and the simulation uses those measured figures directly when the file supplies them. It carries the motor's real launch CG too, instead of the mid-length approximation a RASP file forces. A file that asks for its mass or CG to be recalculated (`auto-calc-mass`, `auto-calc-cg`) gets the same reconstruction as `.eng`, which is what OpenRocket does with it.

A `.rse` can hold one motor or a manufacturer's whole range; every motor in the file is imported, and the picker says how many were imported. The format is detected from the file's contents rather than its name, so a `.rse` saved as `.eng` still reads correctly.

### Custom motors
Custom/imported motors persist locally alongside your custom materials, so they're available across your designs on that browser.

## Multiple mounts

A design can have more than one motor mount (e.g. clustered or staged). Every mount gets a card of its own in the Configurations tab, nose to aft, and every configuration holds a motor for each of them. Mounts keep the motors they were imported or opened with, and a newly added mount starts with a **default motor** so the design is always ready to fly: select **Change…** on its card to pick the real one. Remove a mount and its motor is dropped automatically. See [Flight Configurations](./flight-configurations.md) for ignition, staging and how one setup is shared between simulations.
