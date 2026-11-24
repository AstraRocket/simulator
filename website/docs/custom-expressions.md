---
title: "Custom Expressions"
sidebar_position: 12.2
---
A custom expression is a flight variable of your own: a name, a symbol, a unit and a formula over the variables the engine computes, such as `0.5*m*Vt^2` for kinetic energy. The engine calculates it at every step of a flight and records it as one more series. Expressions only read the flight, so they never change it. They work as desktop OpenRocket's do, and the engine runs desktop's own parser.

Open them with **Custom Expressions** in the menu, or at the end of **Add a series…** under the [flight charts](./views-and-analysis.md#flight-after-a-simulation). They belong to the design: every simulation calculates them, each change is an undo step, and a `.ork` file carries them both ways.

## Add an expression

1. Select **New expression**.
2. Give it a **Name**, which is what the chart and the CSV show. It cannot be the name of another flight variable.
3. Give it a **Symbol**, which is what other expressions call it. It can have letters and underscores only, and cannot be the symbol of another variable or the name of a function.
4. Give it a **Unit**, or leave it empty. Values are in SI units. A unit desktop knows (`m`, `m^2`, `m/s`, `m/s^2`, `kg`, `kg/m^3`, `N`, `Ns`, `Pa` or `K`) converts to your display units. Any other is shown as you wrote it.
5. Write the **Formula**. **Insert a variable…** and **Insert a function…** add one at the cursor. What is wrong shows under the box as you type, and **Save** stays off until the formula can be calculated.
6. Run a simulation. A result from before the change shows as outdated.

The list is the order of calculation: a formula can use the expressions above it. **↑** and **↓** move the selected one. One marked **Cannot be calculated** is left out of the flight.

**Import** adds the expressions of another `.ork` file. One whose name or symbol is already used is left out.

## Formulas

Operators are `+`, `-`, `*`, `/`, `%` (remainder) and `^` (power), with parentheses. Every variable is in SI units, and angles are in radians, except latitude and longitude, which are in degrees.

| Form | Means |
| --- | --- |
| `h` | The latest altitude |
| `h[t-0.5]` | The altitude half a second ago, between recorded points where needed |
| `h[0:t]` | Every altitude from launch until now, one value per time step. `h[:]` is the same. |
| `h[t-2:t]` | The altitudes of the last 2 seconds |

A range is for the functions that take one:

| Function | Gives |
| --- | --- |
| `mean(h[0:t])`, `min`, `max`, `var`, `stdev`, `rms` | The mean, smallest, largest, variance, standard deviation or root mean square of a range |
| `trapz(Ft[0:t])` | The integral of a range, here the impulse so far |
| `tnear(h[:],100)` | The time at which a range is nearest a value |
| `binf(Vt[:],10,50)` | The share of a range between two values |
| `lclip(h,5)`, `uclip(h,100)` | The value, but no less or no more than a limit |
| `abs`, `ceil`, `floor`, `round`, `sqrt`, `cbrt`, `exp`, `expm1`, `log`, `log10`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh` | The usual functions. `log` is the natural logarithm. |
| `random(5)` | A random number from 0 to the value. It does not follow the simulation's random seed, so it differs from run to run. |

### Put range functions in parentheses

The parser works out a range function, `lclip` or `uclip` after the operator that follows it: `lclip(h,5)+1` is `lclip(h,5+1)`. Desktop does the same, and the numbers here match it. Parentheses around the function work it out first: `(lclip(h,5))+1`. The editor warns when a formula has this.

## Where they show

- **Flight charts**: each is in **Add a series…** under its name, and in **Y against X…**.
- **Flight CSV**: each is a column to choose.

The motor guide, the wind sweep and the optimizer do not calculate them.
