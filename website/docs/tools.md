---
title: "Tools"
sidebar_position: 12.5
---
The **Tools** tab holds quick answers that need no design: where a rocket lands, what size parachute it needs, how fast its fins can fly, and how much black powder its ejection charge needs. They suit a rocket you have not modeled, or a quick check at the field. On a phone it is **🧰 Tools** on the bottom bar. Pick a tool from the row of tabs at the top. Each one keeps its inputs and its last result while you switch tools or tabs, until the page is reloaded.

Every tool here is an estimate, and says so. A rocket designed here gets better answers from its own simulation.

## Landing estimator {#landing-estimator}

Where a rocket comes down, from a launch site, a forecast hour, an apogee and descent rates. A designed rocket's simulation flies the whole flight, the way up included; see [where it landed](./views-and-analysis.md#where-it-landed) on the Environment view.

### Enter the flight {#enter-the-flight}

- **Launch site.** Pick a [saved location](./running-a-simulation.md#saved-locations), type the latitude and longitude, or use **Show on map** to pick the spot. Leave **Site elevation** blank to use the terrain model's height at the site.
- **When.** The date and the hour, in the site's local time. Dates from about three months back to 15 days ahead use the forecast, which has the wind at a range of heights. Earlier dates, back to 1940, use Open-Meteo's historical record, which has only the wind near the ground, so the whole descent drifts on that and the result says so.
- **Flight.** The apogee above the pad, then the recovery:
  - **Single**: one descent rate from apogee to the ground.
  - **Dual**: the drogue's rate from apogee down to the height the main opens, then the main's rate to the ground. The main has to open below apogee, and **Estimate landing** stays disabled until it does.

Press **Estimate landing**. The inputs and the last result stay while you switch tabs, until the page is reloaded.

### How it works {#how-it-works}

The estimator fetches the [Open-Meteo](./running-a-simulation.md#weather) forecast for the site, through the free service or [your key](./settings.md#open-meteo-key) if you have one. The descent starts at apogee straight above the pad and falls at the rates you entered. At each height it drifts with the forecast wind there, taken between the forecast's pressure levels.

The flight up is not modeled: no weathercocking and no drift on the way up. The rates are the ones you type, not ones worked out from a parachute.

**Terrain.** The estimator also fetches ground heights over an area around the drift, up to 30 km either side of the pad, and ends the descent where it meets the ground. A landing in a valley falls longer and drifts farther; one on a hillside stops sooner. If the ground heights cannot be fetched, the landing is on flat ground at the pad's height, and the result says so.

**The landing zone.** Besides the main estimate, the estimator flies 135 descents:

- each forecast hour from two before to two after the one you chose,
- the wind speed 20% either way,
- the wind direction 15° either way,
- the descent rates 10% either way.

The landing zone is the 2σ ellipse around where they land. An hour near the start or end of the forecast has fewer hours around it, so it flies fewer descents.

### Read the result {#read-the-result}

The map is seen from above, with the pad at the center, north up and range rings for scale. It shows the descent's path, a ring where it lands, a dot for each of the 135 descents and the landing zone around them. The **None**, **Satellite** and **Street** buttons choose what is drawn underneath, the same as on the [ground track](./views-and-analysis.md#ground-track-after-a-simulation).

Under the map:

- **Lands at**: latitude and longitude.
- **Distance** and **Bearing from the pad**.
- **Descent time**: from apogee to the ground.
- **Landing zone (2σ)**: the ellipse's size. A very tight spread has none drawn.
- **Ground at landing**: the ground's height there.
- **Date / time**: the forecast hour, in the site's time zone.

Open-Meteo's CC BY 4.0 attribution is shown below them.

## Parachute sizing {#parachute-sizing}

The canopy that lands a rocket at a chosen descent rate. Enter what comes down under the canopy (the rocket after its propellant has burned), the canopy's drag coefficient, and the site's elevation and temperature for the air density. Leave the temperature blank for the standard atmosphere at that elevation. Add a canopy diameter to see how fast that canopy comes down.

The result gives the diameter for the **main** band (15 to 20 ft/s) and the **drogue** band (50 to 75 ft/s), and for **your own descent rate** if you enter one. Each is rounded up to a whole centimeter or inch, whichever unit it is shown in, so it is a size you can buy or cut and lands a little slower than the rate, never faster. These come from the descent equation, the same one the parachute editor uses; see [sizing a parachute](./designing-a-rocket.md#sizing-a-parachute).

## Fin flutter {#fin-flutter}

The speed at which a fin starts to flutter: a twisting oscillation that grows until the fin breaks. Compare it with how fast the flight goes.

- **Fin.** The root chord, the tip chord (blank or 0 for a pointed fin), the height from root to tip, and the thickness.
- **Material.** Pick the fin stock for a typical shear modulus, or type a measured or published one; typing a value switches the stock to **Custom**. The stock values are starting points: real fin stock varies by maker, layup and grain, and a printed fin by infill and print direction.
- **Fastest point of the flight.** The top speed, usually at burnout (a simulation's maximum velocity), and the altitude above the pad where it happens, with the site's elevation. Thinner air raises the flutter speed, so leaving the altitude blank gives the cautious answer.

The result gives the **flutter speed** and its Mach number there. With a top speed entered, it also gives the **margin**, the flutter speed divided by the top speed:

- **Below 1**: the flight goes faster than the fins' flutter speed.
- **1 to 1.25**: under it, but too close for an estimate this rough.
- **1.25 or more**: under it with room to spare.

The speed comes from NACA Technical Note 4197, the estimate hobby flutter calculators use. It treats the fin as a flat plate of even thickness clamped at the root, so edges shaped to an airfoil, fillets, tip-to-tip layups and through-the-wall tabs, all of which stiffen a real fin, are not counted. Treat the margin as one to keep, not a line to fly up to.

## Ejection charge {#ejection-charge}

The black powder that pressurizes a recovery bay enough to separate it.

- **Recovery bay.** The airframe's inside diameter, the bay's free length (bulkhead to bulkhead, less the coupler), and the target pressure above the outside air. It starts at 15 psi, where hobby practice usually starts.
- **Shear pins** (optional). The number of pins and the shear strength of one, from the pin's maker or your own test. Nylon pins vary by size, brand and batch, so there is no built-in figure.

The result gives the **black powder** for the target pressure. With pins, it also gives the **pressure to shear the pins** (their total strength spread over the bore) and the powder that reaches it, and warns when the target pressure is below that, since the bay would not separate.

The charge is the ideal gas law for FFFFg powder's combustion gas, which works out close to the familiar rule of 0.006 × D² × L grams at 15 psi, with D and L in inches. It does not count heat lost to the airframe, gas escaping past the coupler, powder that burns late, or the volume the recovery gear takes up. **Ground test every charge before it flies**, and add whatever margin the test shows you need.
