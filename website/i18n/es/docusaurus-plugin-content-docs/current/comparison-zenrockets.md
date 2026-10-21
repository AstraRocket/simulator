---
title: "Comparación con ZenRockets"
sidebar_position: 19
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info Sobre esta instantánea

Escrito el **2026-09-23**, comparando **AstraRocket <AppVersion />** (motor compilado a partir de OpenRocket <UpstreamPin />) con **[ZenRockets](https://zenrockets.com)** en la versión **v0.2.0**, la última entrada de [su registro de cambios](https://zenrockets.com/docs/changelog) en esa fecha (fechada el 2026-09-15).

:::

## El motor de cálculo {#the-engine}

Los dos no comparten motor de física. AstraRocket ejecuta **el propio núcleo de OpenRocket**, compilado a WebAssembly y JavaScript, y comprobado frente a ese mismo código sobre una JVM. ZenRockets [acredita](https://zenrockets.com/docs/acknowledgements) a **RocketPy** como "la base de simulación de vuelo que usa el servicio de trayectorias de ZenRockets", a **openMotor** por su trabajo de balística interna, y a OpenRocket por la compatibilidad de formatos de archivo y como referencia de validación.

Así que el mismo cohete, el mismo motor y las mismas condiciones no darán necesariamente el mismo apogeo en ambos. Para saber cuál se acerca más, vuela el cohete y compara los dos con el altímetro.

## El producto {#the-product}

ZenRockets es un servicio con cuenta: los diseños son "privados por defecto, con enlaces públicos para compartir y clonar", con paneles para cohetes, motores, vuelos, preajustes y materiales. AstraRocket se ejecuta en el navegador sin cuenta ni servidor, no sube nada y sigue funcionando con la red apagada.

## Lo que tiene ZenRockets {#what-zenrockets-has}

| Función de ZenRockets | Aquí |
| --- | --- |
| **Diseño de motores** (carcasas, geometrías de grano, toberas, propelentes, balística interna) | No disponible, ni previsto. Esta aplicación elige motores a partir de curvas de empuje publicadas. |
| **Datos de ensayo estático** (superponer la traza de un banco de pruebas a una curva simulada, o volarla) | No disponible. Las curvas `.eng` y `.rse` se importan, pero no hay superposición de lo medido frente a lo previsto. |
| **Importación de registros de vuelo** (el CSV de un altímetro como vuelo grabado, con detección de eventos) | No disponible. Está [en la hoja de ruta como un "quizá"](https://github.com/AstraRocket/simulator/blob/master/TODO.md), porque cada altímetro escribe un CSV distinto. |
| **Comparar varios vuelos, alineados en el tiempo** | No disponible. Las gráficas, la traza sobre el terreno y la vista 3D dibujan un vuelo cada vez. |
| **Dimensiones enlazadas** (un campo que referencia la dimensión de otra pieza) | En parte. Las piezas en **Auto** siguen a su tubo como en OpenRocket de escritorio; un campo no puede referenciar cualquier otro campo. |
| **Vista de corte** | Disponible. El botón **Sección** de la vista 3D abre el fuselaje por el eje central. |
| **Una tabla de eventos con el estado en cada evento** | Disponible. La tabla **Eventos de vuelo** da a cada evento su tiempo, altitud y velocidad, más el margen estático, la relación empuje-peso, el ángulo de ataque o el Mach donde corresponden. |
| **Max-Q** | Disponible, como ficha de resumen y fila de eventos, a partir de la velocidad aerodinámica y no de la velocidad respecto al suelo. |
| **Perfiles de atmósfera resueltos** | Disponible. La vista **Entorno** muestra el aire que encontró el vuelo. Consulta [Vistas y análisis](./views-and-analysis.md#environment-after-a-simulation). |
| **Previsiones meteorológicas en vivo y campos de lanzamiento reales** | Disponible. **Obtener el tiempo…** rellena las condiciones de lanzamiento con un pronóstico de [Open-Meteo](./running-a-simulation.md#weather) para una fecha y una hora elegidas, y las ubicaciones guardadas conservan los campos. |
| **Imágenes de mapa bajo la trayectoria** | Disponible. Imágenes de satélite o de calles bajo la traza sobre el terreno y la trayectoria 3D. |
| **Suma de masas y aislamiento de etapa en el árbol de piezas** | No disponible. |
| **Enlaces para compartir, clonado y paneles** | No disponible, por diseño. No hay cuenta ni servidor; un diseño se comparte enviando el `.ork`. |
| **Plan de precios** | Gratis, y de código abierto con licencia GPL 3.0. |

## Lo que tiene AstraRocket {#what-astrarocket-has}

| Función | Notas |
| --- | --- |
| **El propio motor de OpenRocket** | El código real, comprobado frente a ese mismo código en una JVM, así que la física es la de OpenRocket de escritorio. |
| **Escribir `.ork` y `.rkt`, no solo leerlos** | Ambos formatos se exportan además de importarse. Su exportación documentada es 3MF. Consulta [Archivos y exportaciones](./files-and-exports.md). |
| **Aletas tubulares y cápsulas anidadas al importar de RockSim** | Su documentación de importación los da por omitidos. Aquí ambos se importan y se simulan. |
| **Funcionar del todo sin conexión, sin subir nada** | La aplicación, el motor y ambos catálogos se quedan en tu dispositivo, y no hay cuenta. |
| **Análisis de componentes** | Resistencia, contribución a la estabilidad y CP por pieza, y forzado y amortiguamiento de alabeo, a lo largo de un barrido de Mach. |
| **Todo lo que puedes sacar de ella** | Informe de diseño en PDF con plantillas 1:1, DXF, STL / OBJ / GLB / 3MF, RASAero II `.CDX1`, CSV, KML / GPX, y el esquema en SVG, PNG o JPG. Su exportación documentada es 3MF. |
| **Límites NAR / Tripoli, aplicados** | Una simulación fuera de los límites de ángulo del raíl o de viento en superficie se rechaza en lugar de volarse. Su validación previa al vuelo informa de errores y avisos. |
| **Multilingüe** | |
| **Gratis** | |
