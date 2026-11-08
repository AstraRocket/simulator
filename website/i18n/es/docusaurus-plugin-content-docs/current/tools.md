---
title: "Herramientas"
sidebar_position: 12.5
---
La pestaña **Herramientas** reúne respuestas rápidas que no necesitan un diseño: dónde aterriza un cohete y qué tamaño de paracaídas necesita. Sirven para un cohete que no has modelado o para una comprobación rápida en el campo. En un teléfono es **🧰 Herramientas** en la barra inferior. Elige una herramienta en la fila de pestañas de arriba. Cada una conserva sus datos y su último resultado al cambiar de herramienta o de pestaña, hasta que se recarga la página.

Todas las herramientas de aquí son estimaciones, y lo indican. Un cohete diseñado aquí obtiene mejores respuestas de su propia simulación.

## Estimador de aterrizaje {#landing-estimator}

Dónde baja un cohete a partir de un sitio de lanzamiento, una hora del pronóstico, un apogeo y unas velocidades de descenso. La simulación de un cohete diseñado vuela el vuelo completo, incluida la subida; consulta [dónde aterrizó](./views-and-analysis.md#where-it-landed) en la vista Entorno.

### Introduce el vuelo {#enter-the-flight}

- **Sitio de lanzamiento.** Elige una [ubicación guardada](./running-a-simulation.md#saved-locations), escribe la latitud y la longitud, o usa **Ver en el mapa** para elegir el punto. Deja **Altitud del sitio** en blanco para usar la altura del modelo de terreno en el sitio.
- **Cuándo.** La fecha y la hora, en la hora local del sitio. Las fechas desde unos tres meses atrás hasta 15 días adelante usan el pronóstico, que tiene el viento a varias alturas. Las fechas anteriores, hasta 1940, usan el registro histórico de Open-Meteo, que solo tiene el viento cerca del suelo, así que todo el descenso deriva con ese viento y el resultado lo indica.
- **Vuelo.** El apogeo sobre la plataforma y luego la recuperación:
  - **Simple**: una sola velocidad de descenso desde el apogeo hasta el suelo.
  - **Doble**: la velocidad del piloto desde el apogeo hasta la altura a la que se abre el principal, y luego la velocidad del principal hasta el suelo. El principal tiene que abrirse por debajo del apogeo, y **Estimar aterrizaje** sigue desactivado hasta que así sea.

Pulsa **Estimar aterrizaje**. Los datos y el último resultado se mantienen al cambiar de pestaña, hasta que se recarga la página.

### Cómo funciona {#how-it-works}

El estimador obtiene el pronóstico de [Open-Meteo](./running-a-simulation.md#weather) para el sitio, mediante el servicio gratuito o [tu clave](./settings.md#open-meteo-key) si tienes una. El descenso empieza en el apogeo, justo encima de la plataforma, y cae a las velocidades que introdujiste. A cada altura deriva con el viento pronosticado allí, tomado entre los niveles de presión del pronóstico.

La subida no se modela: ni veleteo ni deriva en el ascenso. Las velocidades son las que escribes, no las calculadas a partir de un paracaídas.

**Terreno.** El estimador también obtiene las alturas del suelo en una zona alrededor de la deriva, hasta 30 km a cada lado de la plataforma, y termina el descenso donde se encuentra con el suelo. Un aterrizaje en un valle cae más tiempo y deriva más lejos; uno en una ladera se detiene antes. Si no se pueden obtener las alturas del suelo, el aterrizaje es sobre suelo llano a la altura de la plataforma, y el resultado lo indica.

**La zona de aterrizaje.** Además de la estimación principal, el estimador vuela 135 descensos:

- cada hora del pronóstico desde dos antes hasta dos después de la elegida,
- la velocidad del viento un 20% hacia cada lado,
- la dirección del viento 15° hacia cada lado,
- las velocidades de descenso un 10% hacia cada lado.

La zona de aterrizaje es la elipse 2σ alrededor de donde aterrizan. Una hora cerca del principio o del final del pronóstico tiene menos horas alrededor, así que vuela menos descensos.

### Leer el resultado {#read-the-result}

El mapa se ve desde arriba, con la plataforma en el centro, el norte arriba y anillos de distancia como escala. Muestra la trayectoria del descenso, un anillo donde aterriza, un punto por cada uno de los 135 descensos y la zona de aterrizaje alrededor. Los botones **Ninguno**, **Satélite** y **Callejero** eligen lo que se dibuja debajo, igual que en la [traza en tierra](./views-and-analysis.md#ground-track-after-a-simulation).

Debajo del mapa:

- **Aterriza en**: latitud y longitud.
- **Distancia** y **Rumbo desde la plataforma**.
- **Tiempo de descenso**: desde el apogeo hasta el suelo.
- **Zona de aterrizaje (2σ)**: el tamaño de la elipse. Con una dispersión muy pequeña no se dibuja.
- **Suelo en el aterrizaje**: la altura del suelo allí.
- **Fecha / hora**: la hora del pronóstico, en la zona horaria del sitio.

Debajo se muestra la atribución CC BY 4.0 de Open-Meteo.

## Dimensionado de paracaídas {#parachute-sizing}

El paracaídas que hace aterrizar un cohete a la velocidad de descenso elegida. Introduce lo que baja bajo el paracaídas (el cohete después de quemar el propulsante), el coeficiente de arrastre del paracaídas, y la altitud y la temperatura del sitio para la densidad del aire. Deja la temperatura en blanco para usar la atmósfera estándar a esa altitud. Añade un diámetro de paracaídas para ver a qué velocidad baja ese paracaídas.

El resultado da el diámetro para la banda del **principal** (15 a 20 ft/s) y la del **piloto** (50 a 75 ft/s), y para **tu propia velocidad de descenso** si introduces una. Cada uno se redondea hacia arriba a un centímetro o una pulgada entera, según la unidad en que se muestre, para que sea una medida que se pueda comprar o cortar y aterrice un poco más despacio que esa velocidad, nunca más rápido. Salen de la ecuación de descenso, la misma que usa el editor de paracaídas; consulta [dimensionar un paracaídas](./designing-a-rocket.md#sizing-a-parachute).
