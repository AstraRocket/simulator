---
title: "Flight Configurations"
sidebar_position: 10
---
A **flight configuration** is one way the rocket is set up to fly: a motor in every mount, when each recovery device opens, when each booster separates, and which stages are in the air at all. Every simulation flies one, and several simulations can share the same one.

This is OpenRocket's own model, and it is what makes "the same rocket on a C6 and on a D12" two setups rather than two designs. The **Configurations** tab is where they are made; the **Simulations** tab is where a run picks one.

## The table

One row per configuration, one column per part it configures. The **Motors**, **Recovery** and **Staging** tabs above the table choose which parts the columns show; each has its own section below. **Bays** is the design's [recovery bays](#bays) rather than a part of a configuration. Reading across a row tells you what that setup does everywhere; reading down a column tells you what the same mount or chute does under each setup, which is the comparison a staged or clustered rocket is designed around.

- **New** adds a configuration with the default motors, even when an identical setup is already there: two configurations with the same motors can be useful.
- **Copy** duplicates the selected one, motors and all, and puts the copy next to it. A named configuration's copy says so; an unnamed one stays unnamed, because its label is its motor list.
- **Delete** removes it. Simulations flying it move to the first one left, so the app asks first when any do. The last configuration cannot be deleted: every simulation names the one it flies.
- **Flights** counts the simulations flying each configuration.

A configuration you have not named is labeled by its motors, the way the desktop labels it. Give it a name in the editor beside the table when the motors are not the point, for example *Contest* or *Sustainer only*.

On narrower screens the part columns are hidden and the editor moves under the table, so a phone still reaches everything in one pane.

## Motors

One card per motor mount, nose to aft. **Change…** opens the [motor picker](./motors.md), 📈 shows the seated motor's thrust curve, and **Ignition** sets when that motor lights:

- **Automatic** is the low and mid-power pattern: the launch stage lights at launch, an upper stage on the ejection charge of the stage below.
- **Launch**, **Ejection of stage below**, **Burnout of stage below** and **Never**, each with a delay in seconds (except **Never**), are what an electronically timed sustainer or an air-start needs. All five are offered on every mount, as on the desktop. **Ejection of stage below** and **Burnout of stage below** fire from the stage under the mount's own (a strap-on booster counts), so on a mount with nothing below it they never fire and the motor stays unlit, as it does on **Never**.

The choice under the ignition says which configurations a change reaches. **This configuration** changes only the one you are editing, and is where the choice starts each time you open a configuration. **All configurations** changes this mount's ignition in every configuration and also sets the mount's own ignition, the **Ignition at** on the mount in the Design tab; **Apply to all configurations** does that with the ignition as it already stands here. A motor new to the mount, such as the one a new configuration starts with, lights the way the mount's own ignition says. **Reset ignition** sets this configuration back to **Automatic** with no delay. These follow desktop OpenRocket's ignition dialog and its **Reset ignition** button.

Editing a motor here changes it for **every** simulation flying this configuration. That is what sharing a setup means, and it is why motors are edited here and nowhere else: editing motors in one place keeps simulations that share a setup from disagreeing.

## Recovery

When each recovery device opens **on this flight**. Every field defaults to the design: leave it empty and the part's own value applies. That value is shown as the placeholder, so the field shows the number the flight will actually use.

The override is per field, so a configuration can move the altitude and leave the trigger where the design put it: "deploy the main at 150 m on this flight" is one field, not a second copy of the chute.

A part that some configuration opens differently says so in the design [property panel](./designing-a-rocket.md), naming those configurations, so the altitude shown is never one the flight does not use.

## Staging

One card per stage, whether or not it separates.

- **Flies on this configuration** decides whether the stage is in the flight at all. A grounded stage contributes no mass, no drag and no motor: the rest of the rocket flies without it, which is how a two-stage design is flown as its own sustainer without deleting the booster. Something has to fly, so the last stage still in the air cannot be grounded.
- **Stage separation**, **Separation delay** and **Separation altitude (AGL)** say when a booster separates, and default to the design the same way the recovery fields do. The top stage has nothing above it to separate from, so it shows only the **Flies on this configuration** checkbox.

## Bays {#bays}

**Bays** is the one sub-tab that is not about a configuration: it lists the design's recovery bays, each with its settings, the charges it flies and its ground tests. A bay is a body tube a parachute or streamer sits in, directly or inside an inner tube in it, one per role: the **drogue** bay holds its stage's drogue and the **main** bay its [main device](./designing-a-rocket.md#dual-deployment). With single deployment every device is a main. The bays are listed under a heading per stage, whether the rocket has one stage or four; click the heading to fold that stage's bays away or open them again. A booster's bays and a sustainer's stay apart even when their tubes share a name. The Results card's recovery charges and the design report name each bay's stage too, such as *Sustainer · Body tube*. The New, Copy and Delete buttons and the editor column belong to the configurations, so they are hidden here.

**Bay settings.** Each field starts from the design and shows that value as its placeholder; type to override it for this bay, clear it to go back.

- **Inside diameter** and **Bay length**, worked out from the tube as [sizing an ejection charge](./designing-a-rocket.md#sizing-an-ejection-charge) describes.
- **Target pressure**, 15 psi to start.
- **Pin count**, **Pin size** (#2-56, #4-40, #6-32 or **Measured**) and **Shear strength per pin**. Until you set them, the pins come from a mass object named for them, or the default 3 × #2-56; **Use the design's** goes back to that.

**Estimate.** The black powder for the target pressure, and with pins, the pressure that shears them and the powder that reaches it, as in the [Ejection charge tool](./tools.md#ejection-charge).

**Charges.** The **Primary charge** and **Backup charge** this bay flies. **Use the suggestion** fills both: the larger of the two estimates rounded up to a tenth of a gram, and 1.5 times that. They are written to the design as deployment charge mass objects too (see [saving the charges](./designing-a-rocket.md#saving-charges)), so their weight counts.

**Ground tests.** The log of every ground test of this bay, newest first: the date, the charge, the pins that were in, the result and your notes. **Log a ground test** adds one; it records the pins set above, so changing them later leaves the log saying what was tested. The results are **Clean separation**, **Separated, too violent**, **Partial separation**, **Did not separate** and **Pins did not shear**. **Fly this** on a test makes its charge the primary, with the backup at 1.5 times it, and the bay says which test it came from; changing the primary by hand drops that link. ✕ deletes a test after asking.

**Where it is kept.** Every change is one undo step. The bay records are saved in the design, inside the body tube's own element in the `.ork`, so they move with the tube. None of it changes a simulation or marks one outdated: only the charges fly, and they reach the flight as their mass objects. Desktop OpenRocket ignores the records, but drops them if it saves the file, so this browser also keeps a copy per design name. Opening a file that has lost its records puts that copy back on the tubes that still match by position and name, as one undo step, and the file's notes say so.

The [design report](./files-and-exports.md#rocket-design-report-pdf--csv) lists each bay's settings and its ground tests, with the test the flight primary came from marked.

## Choosing one for a simulation

Each row of the [Simulations](./running-a-simulation.md) table has a **Configuration** picker, and the simulation editor has the same one with the motors listed under it and a button that opens this tab. Pointing a row at another configuration marks its results as outdated, the same as any other change to what it flies.

## In the file

A `.ork` carries its configurations, and so does this app: every one the file declares comes in with its motors, its recovery, its staging and its grounded stages. The file's own simulations come in as they are, each flying the configuration it named; a file with no simulations gets one per configuration, so there is a simulation to run. Each keeps the file's own configuration id, so a design opened here and saved back is the same set of configurations rather than a rewrite of them. See [Files & Exports](./files-and-exports.md).
