---
title: "Comparación con OpenRocket"
sidebar_position: 18
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info Sobre esta instantánea

Escrito el **2026-09-29**, comparando **AstraRocket <AppVersion />** (motor compilado a partir de OpenRocket <UpstreamPin />) con **OpenRocket de escritorio**: la versión **24.12**, la versión numerada actual, y la línea de desarrollo `unstable` en la que se sitúa el commit fijado.

:::

## El motor de cálculo {#the-engine}

La aerodinámica, el cálculo de masa y CG, y la integración del vuelo son **el propio código de OpenRocket**, extraído del commit indicado arriba y compilado a WebAssembly y JavaScript. No son una reimplementación. Sus cifras estáticas se comprueban frente al mismo núcleo ejecutándose sobre una JVM y coinciden salvo por el redondeo de la última cifra, y sus vuelos coinciden con esa ejecución en la JVM dentro de una pequeña tolerancia. Para el mismo diseño, el mismo motor y las mismas condiciones, el mismo código calcula los números.

## El producto {#the-product}

OpenRocket de escritorio es un programa Java que se instala. AstraRocket se ejecuta en el navegador, se instala desde ahí y sigue funcionando con la red apagada. Las tablas de abajo tratan del **programa que rodea al motor de cálculo**: qué puedes crear, qué puedes mirar y qué puedes sacar de ahí.

## Lo que tiene OpenRocket de escritorio {#what-desktop-openrocket-has}

| Función del escritorio | Aquí |
| --- | --- |
| **Colores y apariencia 3D de los componentes** | Disponible. Color, estilo de línea, pintura, brillo y opacidad, dibujados en las vistas 2D y 3D. |
| **Guardar tus propios componentes** | En parte. **Guardar como pieza** guarda un componente en tu navegador y lo incluye en el archivo de copia de seguridad, pero no como archivo `.orc`. |
| **Impresión** | Disponible, como informe de diseño en PDF con plantillas 1:1. |
| **Texturas y calcomanías** | No disponible. Las calcomanías se eliminan al importar. |
| **Photo Studio** | No disponible. |
| **Optimización de cohetes** | No disponible. |
| **Expresiones personalizadas** | No disponible. La exportación del vuelo a CSV tiene las series en bruto. |
| **Extensiones de simulación y scripting** | No disponible. Un `.ork` las conserva al guardar, así que el escritorio las sigue teniendo. |
| **Idiomas** | En parte. OpenRocket se distribuye en más idiomas. |

## Lo que tiene AstraRocket {#what-astrarocket-has}

| Función | Notas |
| --- | --- |
| **Funciona en el navegador, se instala y funciona sin conexión** | Sin JDK y sin descarga; una simulación completa se ejecuta en un campo sin cobertura. Consulta [Sin conexión e instalación](./offline-and-installing.md). |
| **Una disposición pensada para el móvil** | Pestañas en la parte inferior, con las vistas del cohete giradas para ocupar el lado largo de la pantalla. |
| **Vista de traza sobre el terreno** | El vuelo visto desde arriba, con anillos de distancia y la distancia y el rumbo de aterrizaje de cada etapa. |
| **Exportación de la trayectoria a KML / GPX / CSV de waypoints** | Abre el vuelo en Google Earth o en una aplicación GPS, con plantillas Mustache propias. |
| **3MF del cohete entero, y STL / GLB / 3MF por pieza** | Listo para el laminador. OpenRocket exporta OBJ, que esta aplicación también. |
| **Hojas de corte DXF** | Aletas, anillos y mamparos como archivos de corte 2D. |
| **Exportación a RASAero II (`.CDX1`)** | Entrega el diseño a RASAero II para su propio análisis aerodinámico. |
| **Exportación a RockSim `.rkt`** | OpenRocket lee archivos de RockSim pero no los escribe. Consulta [Archivos y exportaciones](./files-and-exports.md#rocksim-rkt). |
| **Ubicaciones de lanzamiento guardadas, sobre un mapa** | Da nombre a un campo y recupera sus coordenadas y su elevación, con imágenes de satélite o de calles y clic para fijarlas. Una función similar está [abierta como pull request en el proyecto original](https://github.com/openrocket/openrocket/pull/3211). |
| **El tiempo de un pronóstico, para una fecha elegida** | Rellena las condiciones de lanzamiento y el perfil de viento desde [Open-Meteo](./running-a-simulation.md#weather). La versión de escritorio (PR #3211) no está integrada y solo consulta las condiciones actuales. |
| **Una atmósfera pronosticada en altura** | Temperatura, presión y humedad por altura, voladas en lugar de la atmósfera estándar. La incidencia #2737 lo propone para el escritorio. |
| **Vista de entorno** | El aire que realmente encontró el vuelo, desde las condiciones en el lanzamiento hasta los perfiles frente a la altura. Consulta [Vistas y análisis](./views-and-analysis.md#environment-after-a-simulation). |
| **El aterrizaje a lo largo de las horas del pronóstico** | Vuela el diseño bajo cada hora desde dos antes hasta dos después y sitúa los aterrizajes en un mapa con una elipse 2σ. Consulta [Vistas y análisis](./views-and-analysis.md#where-it-landed). |
| **Estimador de aterrizaje** | Un sitio, una hora del pronóstico, un apogeo y unas velocidades de descenso dan una zona de aterrizaje, sin necesidad de diseño. Consulta [Herramientas](./tools.md#landing-estimator). |
| **Longitud de raíl necesaria** | Cada simulación indica qué longitud de guía necesita el diseño para salir de ella a tu velocidad mínima de salida, junto al tiempo, el empuje/peso y el ángulo de ataque a la salida. Consulta [Ejecutar una simulación](./running-a-simulation.md). |
| **Dimensionado del descenso en paracaídas** | La velocidad de descenso que da una vela, y el diámetro necesario para alcanzar una velocidad objetivo. |
| **Límites NAR / Tripoli, aplicados** | Una simulación fuera de los límites de ángulo del raíl o de viento en superficie se rechaza en lugar de volarse. Consulta [Seguridad](./safety.md). |
| **Un hombro que sigue al tubo en el que entra** | Un interruptor mantiene el hombro en el diámetro interior de la pieza contigua. Consulta [Diseñar un cohete](./designing-a-rocket.md). |
| **Dejar una etapa en tierra por configuración** | Una casilla en la tarjeta de Etapas de cada configuración. Consulta [Configuraciones de vuelo](./flight-configurations.md#staging). |
