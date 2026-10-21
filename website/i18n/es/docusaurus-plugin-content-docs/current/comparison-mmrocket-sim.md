---
title: "Comparación con mmrocket-sim"
sidebar_position: 20
---

import AppVersion from '@site/src/components/AppVersion';
import UpstreamPin from '@site/src/components/UpstreamPin';

:::info Sobre esta instantánea

Revisado el **2026-10-19**, comparando **AstraRocket <AppVersion />** (motor compilado a partir de OpenRocket <UpstreamPin />) con **[mmrocket-sim](https://github.com/mtnmanak/mmrocket-sim)** en v0.192 (2026-10-18), a partir de su guía de usuario.

:::

## El motor de cálculo {#the-engine}

Ambos ejecutan el propio núcleo de OpenRocket, compilado desde Java con TeaVM. mmrocket-sim parte de OpenRocket 24.12 y compila a JavaScript. AstraRocket parte de la rama **unstable**, más reciente, y compila a WebAssembly, con JavaScript como alternativa. Dos núcleos sobre commits distintos de OpenRocket pueden dar números distintos sin que ninguno esté equivocado.

mmrocket-sim ofrece además sus propios modelos aerodinámicos junto al de OpenRocket, entre ellos un modelo supersónico (beta) calibrado con datos publicados de túnel de viento y de vuelo libre. AstraRocket vuela el modelo de Barrowman extendido de OpenRocket sin cambios.

## El producto {#the-product}

Ambos son aplicaciones de navegador de autores independientes, sin instalación, con versión instalable y uso sin conexión. mmrocket-sim, de Mountain Man Rockets, se inclina por construir y volar un kit: ayudas de fabricación, una pantalla de campo y barridos de motores. AstraRocket se inclina por planificar el día de lanzamiento: pronósticos, mapas, estimaciones de aterrizaje y exportaciones.

## Lo que tiene mmrocket-sim {#what-mmrocket-sim-has}

| Función de mmrocket-sim | Aquí |
| --- | --- |
| **Modelos aerodinámicos seleccionables, incluido el supersónico (beta)** | No disponible. Esta aplicación vuela el modelo de Barrowman extendido de OpenRocket. |
| **Carenados de cámara** | No disponible. |
| **Protuberancias** (bultos que solo aportan resistencia, como canaletas) | No disponible. |
| **Orificios de ventilación y de marcado en un tubo** | No disponible, ni previsto. |
| **Ajuste a la masa y el CG medidos** | Disponible, mediante las sustituciones de masa y CG. No hay una masa de lastre sugerida. |
| **Simulación por lotes sobre el catálogo de motores** | No disponible. Varias simulaciones guardadas se ejecutan a la vez. |
| **Pantalla de vuelo para el móvil** | No disponible. La disposición del móvil usa las mismas pestañas que el resto de la aplicación. |
| **Compartir un diseño por enlace** | No disponible. Un diseño se comparte enviando el `.ork`. |
| **Plantillas de alineación de aletas** | No disponible. |
| **Dividir piezas altas al volumen de una impresora 3D** | No disponible. |
| **Gráficas X-Y personalizadas** | No disponible. |

## Lo que tiene AstraRocket {#what-astrarocket-has}

| Función | Notas |
| --- | --- |
| **Un núcleo de OpenRocket más reciente** | La rama **unstable** lleva correcciones del proyecto original que no están en 24.12. |
| **WebAssembly** | Con JavaScript como alternativa; una etiqueta en la cabecera dice cuál se cargó. |
| **Multilingüe** | |
| **Varias simulaciones, cada una con sus condiciones de lanzamiento** | En la suya, todas las configuraciones comparten unas mismas condiciones de lanzamiento. |
| **Una biblioteca de diseños guardados** | La suya guarda un autoguardado y una lista de archivos recientes. |
| **Atmósfera pronosticada en altura y humedad** | Temperatura, presión y humedad por altura desde el pronóstico. La suya solo obtiene el viento en altura. |
| **Ubicaciones de lanzamiento guardadas, sobre un mapa** | Da nombre a un campo y recupera sus coordenadas y su elevación, con imágenes de satélite o de calles. |
| **Traza sobre el terreno con imágenes de mapa** | Con anillos de distancia y la distancia y el rumbo de aterrizaje de cada etapa. La suya es una gráfica simple. |
| **Trayectoria 3D con reproducción** | Cuenta atrás, desplazamiento y control de velocidad. |
| **Vista de entorno** | El aire que realmente encontró el vuelo. Consulta [Vistas y análisis](./views-and-analysis.md#environment-after-a-simulation). |
| **El aterrizaje a lo largo de las horas del pronóstico** | Vuela el diseño dos horas antes y después y sitúa los aterrizajes en un mapa. Consulta [Vistas y análisis](./views-and-analysis.md#where-it-landed). |
| **Región de deriva por barrido de viento** | Vuela una rejilla de velocidades y rumbos de viento y dibuja la envolvente de aterrizaje. |
| **Herramientas que no necesitan diseño** | Estimador de aterrizaje, comprobación de la salida del raíl y dimensionado del paracaídas. Consulta [Herramientas](./tools.md). |
| **Límites NAR / Tripoli, aplicados** | Una simulación fuera de los límites de ángulo del raíl o de viento en superficie se rechaza en lugar de volarse. La suya avisa. |
| **Tablas de estabilidad y alabeo por componente** | CNα, CP, masa, y forzado y amortiguamiento de alabeo por pieza. La suya solo desglosa la resistencia. |
| **Panel de motores** | Superpone curvas de empuje y combina motores en un racimo. |
| **Aletas libres a partir de una imagen** | Traza el contorno de una aleta desde una foto, o convierte un juego de aletas en libre. |
| **Corte 3D y estilos de apariencia** | Una vista de corte, y estilo de línea, brillo y opacidad por pieza. |
| **Exportación de la trayectoria a KML / GPX / CSV de waypoints** | Abre el vuelo en Google Earth o en una aplicación GPS, con plantillas Mustache propias. |
| **Exportación 3MF del cohete entero y a Onshape** | Un archivo con un objeto con nombre por pieza, o el cohete como piezas de Onshape. |
| **Deshacer que también cubre las simulaciones** | El suyo cubre solo el árbol del diseño. |
| **Un selector de unidades en cada valor** | La suya fija las unidades por magnitud. |
| **Ajustes de semilla aleatoria y modelo de gravedad** | La suya fija la semilla y el modelo de gravedad. |
| **Archivo de copia de seguridad** | Materiales, piezas, ubicaciones, motores, plantillas y ajustes en un solo archivo. |
