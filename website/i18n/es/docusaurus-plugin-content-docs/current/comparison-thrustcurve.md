---
title: "Comparación con ThrustCurve.org"
sidebar_position: 21
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info Sobre esta instantánea

Revisado el **2026-10-25**, comparando **AstraRocket <AppVersion />** (motor compilado a partir de OpenRocket <UpstreamPin />) con **[ThrustCurve.org](https://www.thrustcurve.org)**, a partir de sus menús, sus formularios Attribute Search y Match a Rocket, y sus páginas de ayuda sobre la guía de motores y la simulación de vuelo.

:::

## Dos herramientas distintas

ThrustCurve.org es la base de datos de motores: archivos de curvas de empuje de los organismos de certificación, los fabricantes y los usuarios, con búsqueda, páginas de motores y una guía de motores rápida. AstraRocket es un simulador de vuelo, y su catálogo de motores se construye con los datos de ThrustCurve.org. Las dos se complementan más de lo que compiten: ThrustCurve.org es de donde vienen los datos, y esta aplicación es donde se vuelan.

## Los datos de los motores

La sincronización semanal del catálogo pide a ThrustCurve.org todos los motores, en producción o no, e incluye las curvas de empuje de cada uno con la aplicación, así que elegir un motor funciona sin conexión. 1063 de los 1156 motores tienen curva; los otros 93 tampoco tienen curva publicada en ThrustCurve.org. Aquí aparecen con sus datos, pero no se pueden volar salvo que importes un archivo `.eng` o `.rse` para ellos. Un motor con varias curvas (certificada, del fabricante, de usuario) las conserva todas, y el selector oculta las curvas que se parecen en más de un 95 % a la que se muestra.

## Elegir un motor

**Match a Rocket** de ThrustCurve.org y la **[guía de motores](./motors.md#motor-guide)** de esta aplicación responden la misma pregunta: qué motores le van a este cohete.

| | Match a Rocket de ThrustCurve.org | Guía de motores de AstraRocket |
| --- | --- | --- |
| **El cohete** | Diámetro del cuerpo, peso en vacío, un coeficiente de arrastre predefinido (0,3 a 1,0), diámetro y longitud del soporte del motor. | Tu diseño: cada pieza, con la masa, el CG y el arrastre que calcula el motor de simulación. |
| **La física** | Una simulación rápida con los algoritmos del RASP original: un coeficiente de arrastre fijo, gravedad constante, sin viento, y se detiene en el apogeo. | La simulación de vuelo completa de OpenRocket: arrastre que cambia con la velocidad, viento y turbulencia, la atmósfera, y la recuperación hasta el aterrizaje. |
| **El lanzamiento** | Temperatura, altitud de la base, longitud de la guía y una velocidad estable. | Las condiciones de lanzamiento de la propia simulación: riel o varilla, lugar, meteorología y perfil de viento. |
| **Motores por ejecución** | Todos los que caben y pasan los filtros. | Hasta 8, marcados en la lista filtrada. |
| **Filtros** | Clase de impulso, tipo de motor, fabricante, fuera de producción. | Clase de impulso, fabricante, impulso total, diámetro y ajuste, sin carga de eyección, fuera de producción, empuje medio y máximo, tiempo de combustión, pesos, longitud, Isp, y empuje/peso para tu cohete. |
| **Resultados** | Peso al despegue, velocidad de lanzamiento, velocidad máxima, aceleración máxima, apogeo, tiempo hasta el apogeo, retardo óptimo. | Esos, más el margen de estabilidad y el empuje/peso a la salida del lanzador, las velocidades de despliegue y de aterrizaje, y cada motor volado con el retardo que ofrece más cercano al mejor. |
| **Seguridad** | Marca los motores con poco empuje inicial para el peso, con notas cuando no se pudo comprobar la relación 5:1 o la velocidad mínima. | Los avisos de una simulación normal: velocidad de salida frente a tu mínimo, margen a la salida, velocidad de despliegue y los avisos de vuelo del motor de simulación. Los límites de lanzamiento de la NAR y Tripoli rechazan el vuelo directamente. |
| **Conservar un resultado** | | **Usar** convierte una fila en una configuración de vuelo y una simulación de ella. |
| **Cohetes guardados** | Cohetes guardados en una cuenta, y una lista de cohetes públicos de otros usuarios. | Diseños guardados en la biblioteca de diseños del navegador; para compartir uno, envía el `.ork`. |

## Lo que tiene ThrustCurve.org

| Función de ThrustCurve.org | Aquí |
| --- | --- |
| **Aportar datos de motores** (de un organismo de certificación, un fabricante o un usuario) | No disponible. La aplicación lee los datos que publica ThrustCurve.org. |
| **TCtracer**, para trazar una curva de empuje a partir de la imagen de una gráfica | No disponible. Importa un archivo `.eng` o `.rse`. |
| **API de búsqueda y descarga** | No disponible. La aplicación trabaja con el catálogo sincronizado. |
| **Búsqueda por llama, humo, carcasa, propelente, Class 1 (menos de 125 g), exento de HazMat y aprobado por CSFM** | No disponible. El catálogo no incluye esos campos; el propelente y si el motor es de chispas aparecen en su detalle. |
| **Búsqueda por tipo de motor** (de un solo uso, recargable, híbrido) | No es un filtro. El tipo aparece en el detalle del motor y como columna del Panel de motores. |
| **Más populares, vistos recientemente y últimas actualizaciones** | Un aviso indica cuándo llega un catálogo actualizado, con cuántos motores son nuevos y cuántos se han retirado. |
| **Páginas de certificación, fabricantes y estadísticas** | No disponible. El [Glosario](./glossary.md) explica los términos. |
| **Conjuntos de archivos de fabricantes** para descargar | No disponible. |
| **Cuentas, cohetes guardados y públicos** | No disponible. Nada aquí necesita una cuenta. |
| **Todos los motores que caben en una sola ejecución de la guía** | Hasta 8 por ejecución, elegidos de la lista filtrada. |

## Lo que tiene AstraRocket

| Función | Notas |
| --- | --- |
| **Tu diseño real, volado** | La guía de motores vuela las piezas, la recuperación y las condiciones de lanzamiento del diseño, no un diámetro y un coeficiente de arrastre. |
| **Resultados después del apogeo** | Velocidad de despliegue, velocidad de aterrizaje y dónde cayó, con los avisos del motor de simulación para cada motor. |
| **Cada motor con un retardo que ofrece** | Se vuela otra vez con la carga más cercana a su mejor retardo, así que la velocidad de despliegue es la que da esa carga. |
| **Conservar un motor** | **Usar** crea una configuración y una simulación a partir de una fila de la guía, en un solo paso de deshacer. |
| **Filtros que la búsqueda de ThrustCurve.org no tiene** | Impulso total, tiempo de combustión, peso total y de propelente, longitud, Isp, y empuje/peso calculado a partir de tu cohete, incluidos los motores de otros soportes y todos los motores de un racimo. |
| **Panel de motores** | Superpone curvas de empuje para compararlas, o combina motores en una sola curva de racimo. |
| **Los motores importados vuelan** | Un archivo `.eng` o `.rse` se convierte en un motor que puedes elegir y volar, guardado en el navegador. |
| **Sin conexión y sin cuenta** | El catálogo y sus curvas vienen con la aplicación. |
