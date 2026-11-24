---
title: "Expresiones personalizadas"
sidebar_position: 12.2
---
Una expresión personalizada es una variable de vuelo propia: un nombre, un símbolo, una unidad y una fórmula con las variables que calcula el motor de simulación, como `0.5*m*Vt^2` para la energía cinética. El motor la calcula en cada paso del vuelo y la registra como una serie más. Las expresiones solo leen el vuelo, así que nunca lo cambian. Funcionan como las de OpenRocket de escritorio, y el motor usa el mismo analizador de fórmulas.

Ábrelas con **Expresiones personalizadas** en el menú, o al final de **Añadir una magnitud…** bajo las [gráficas de vuelo](./views-and-analysis.md#flight-after-a-simulation). Pertenecen al diseño: todas las simulaciones las calculan, cada cambio es un paso de deshacer y un archivo `.ork` las lleva en ambos sentidos.

## Añadir una expresión {#add-an-expression}

1. Selecciona **Expresión nueva**.
2. Dale un **Nombre**, que es lo que muestran la gráfica y el CSV. No puede ser el nombre de otra variable de vuelo.
3. Dale un **Símbolo**, que es como la llaman las demás expresiones. Solo puede tener letras y guiones bajos, y no puede ser el símbolo de otra variable ni el nombre de una función.
4. Dale una **Unidad**, o déjala vacía. Los valores están en unidades SI. Una unidad que el escritorio conoce (`m`, `m^2`, `m/s`, `m/s^2`, `kg`, `kg/m^3`, `N`, `Ns`, `Pa` o `K`) se convierte a tus unidades de visualización. Cualquier otra se muestra tal como la escribiste.
5. Escribe la **Fórmula**. **Insertar una variable…** e **Insertar una función…** añaden una en el cursor. Lo que está mal aparece bajo la casilla mientras escribes, y **Guardar** sigue desactivado hasta que la fórmula se pueda calcular.
6. Ejecuta una simulación. Un resultado anterior al cambio aparece como desactualizado.

La lista es el orden de cálculo: una fórmula puede usar las expresiones que tiene encima. **↑** y **↓** mueven la seleccionada. Una marcada **No se puede calcular** se deja fuera del vuelo.

**Importar** añade las expresiones de otro archivo `.ork`. Una cuyo nombre o símbolo ya esté en uso se omite.

## Fórmulas {#formulas}

Los operadores son `+`, `-`, `*`, `/`, `%` (resto) y `^` (potencia), con paréntesis. Todas las variables están en unidades SI y los ángulos en radianes, salvo la latitud y la longitud geográficas, que están en grados.

| Forma | Significa |
| --- | --- |
| `h` | La altitud más reciente |
| `h[t-0.5]` | La altitud de hace medio segundo, entre puntos registrados si hace falta |
| `h[0:t]` | Todas las altitudes desde el lanzamiento hasta ahora, un valor por paso de tiempo. `h[:]` es lo mismo. |
| `h[t-2:t]` | Las altitudes de los últimos 2 segundos |

Un intervalo es para las funciones que reciben uno:

| Función | Da |
| --- | --- |
| `mean(h[0:t])`, `min`, `max`, `var`, `stdev`, `rms` | La media, el mínimo, el máximo, la varianza, la desviación estándar o la media cuadrática de un intervalo |
| `trapz(Ft[0:t])` | La integral de un intervalo, aquí el impulso hasta ahora |
| `tnear(h[:],100)` | El tiempo en que un intervalo está más cerca de un valor |
| `binf(Vt[:],10,50)` | La parte de un intervalo entre dos valores |
| `lclip(h,5)`, `uclip(h,100)` | El valor, pero no menor o no mayor que un límite |
| `abs`, `ceil`, `floor`, `round`, `sqrt`, `cbrt`, `exp`, `expm1`, `log`, `log10`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh` | Las funciones habituales. `log` es el logaritmo natural. |
| `random(5)` | Un número aleatorio de 0 al valor. No sigue la semilla aleatoria de la simulación, así que cambia de una ejecución a otra. |

### Pon las funciones de intervalo entre paréntesis {#put-range-functions-in-parentheses}

El analizador calcula una función de intervalo, `lclip` o `uclip` después del operador que la sigue: `lclip(h,5)+1` es `lclip(h,5+1)`. El escritorio hace lo mismo, y los números de aquí coinciden con los suyos. Con paréntesis alrededor, la función se calcula primero: `(lclip(h,5))+1`. El editor avisa cuando una fórmula tiene este caso.

## Dónde aparecen {#where-they-show}

- **Gráficas de vuelo**: cada una está en **Añadir una magnitud…** por su nombre, y en **Y frente a X…**.
- **CSV de vuelo**: cada una es una columna que puedes elegir.

La guía de motores, el barrido de viento y el optimizador no las calculan.
