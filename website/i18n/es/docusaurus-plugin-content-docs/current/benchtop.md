---
title: "Banco"
sidebar_position: 12.4
---
La pestaña **Banco** vuela un cohete que no has diseñado, a partir de unas pocas cosas que puedes medir en el banco: su tamaño, su peso, dónde se equilibra, su soporte del motor, sus aletas y su paracaídas. No pide ningún coeficiente de resistencia. El cohete vuela en el mismo motor de simulación OpenRocket que un diseño, y el motor de simulación calcula la resistencia a partir de la forma. En un teléfono es **🚀 Banco** en la barra inferior.

Úsala para responder "¿hasta dónde sube con este motor?" o "¿qué motores le van a este cohete?" para un kit o un cohete hecho con los planos de otra persona. Cuando la respuesta importe, usa **[Abrir como diseño](#open-as-a-design)** y completa las piezas reales.

La pestaña conserva sus datos y su último resultado al cambiar de pestaña, hasta que se recarga la página.

**Cómo funciona**, junto al formulario en una pantalla ancha y plegado al principio del formulario en una más estrecha, resume qué medir, qué calcula la pestaña y qué deja fuera.

## Introduce el cohete {#enter-the-rocket}

**Cohete.** Todos los campos son obligatorios.

- **Diámetro del cuerpo**: el diámetro exterior del tubo de cuerpo más ancho.
- **Longitud total**: desde la punta de la ojiva hasta el extremo trasero.
- **Masa en vacío**: el cohete listo para volar, sin motor. Incluye el sistema de recuperación y el material de protección.
- **CG, sin motor**: dónde se equilibra el cohete sin motor, medido desde la punta de la ojiva. No puede ser mayor que la longitud total.
- **Diámetro del soporte del motor**: el diámetro interior del soporte, que es el motor más ancho que admite. Un soporte sin sitio para un tubo propio dentro del cuerpo, como un motor de 29 mm en un cuerpo de 30 mm, es un cohete de **diámetro mínimo**: el tubo de cuerpo es el soporte.

**Aletas.**

- **Número de aletas**: de 1 a 8.
- **Forma**: **Trapezoidal**, **Elíptica** o **Parabólica**.
- **Longitud de aleta**: a lo largo del cuerpo, donde va pegada la aleta (la raíz).
- **Anchura de aleta**: desde el cuerpo hasta la punta (la envergadura).

Deja la longitud o la anchura en blanco para usar una aleta a la medida del cuerpo: 3 diámetros del cuerpo de largo y 1,5 de ancho. La casilla muestra esa medida en gris, para que veas lo que se vuela.

**Motor.** **Elegir…** abre el selector de motores, filtrado a los motores que caben: no más anchos que el soporte y no más largos que el tubo de cuerpo detrás de la ojiva. La longitud del soporte nunca es un límite, porque un motor más largo que su soporte sobresale por detrás sujeto con un retenedor y vuela sin problema. **[Guía de motores](#motor-guide)** vuela varios motores a la vez.

**Paracaídas.** **Volar con paracaídas** está desactivado al empezar, y el vuelo termina en el apogeo. Márcalo para volar también el descenso.

- **Diámetro del paracaídas**: de lado a lado del paracaídas extendido. Déjalo en blanco para que se dimensione solo: el paracaídas que hace aterrizar el cohete a 18 ft/s (5,5 m/s), el centro de los 15 a 20 ft/s habituales para un paracaídas principal. Se dimensiona para la masa en vacío más la carcasa gastada del motor elegido, con el aire de tu sitio, y se redondea hacia arriba a un centímetro o una pulgada entera (según la unidad de la casilla) para que sea una medida que se pueda comprar o cortar. La casilla muestra esa medida en gris. Es el mismo dimensionado que la herramienta de [dimensionado de paracaídas](./tools.md#parachute-sizing).
- **Cd del paracaídas**: 0,8 al empezar, típico de un paracaídas redondo plano o hemisférico. Un paracaídas elíptico está más cerca de 1,5; usa la cifra del fabricante si la tienes.

El paracaídas se abre con la carga de eyección del motor.

**Lanzamiento.** **Longitud de la varilla o el riel**, **Altitud del sitio** y **Temperatura**. Deja la temperatura en blanco para usar la atmósfera estándar a esa altitud.

Pulsa **Simular vuelo**. Mientras el vuelo se ejecuta, el botón es **Cancelar ejecución**.

Si algo no se puede volar, un aviso sobre el botón dice qué, con las cifras:

- El cohete debe ser más largo que su ojiva 4:1.
- La longitud de aleta tiene que caber en el tubo de cuerpo detrás de la ojiva.
- El CG tiene que estar en el cohete.
- El soporte del motor debe ser más estrecho que el cuerpo.

## Qué se vuela {#what-is-flown}

El cohete se construye con tus medidas:

- una ojiva ojival 4:1, tan ancha como el cuerpo,
- un tubo de cuerpo detrás, hasta tu longitud total,
- tus aletas en el extremo trasero,
- tu paracaídas, plegado en la parte alta del tubo de cuerpo,
- un tubo de soporte tan largo como el motor, a ras del extremo trasero (o el propio cuerpo, en diámetro mínimo).

Todas las piezas tienen el acabado de superficie por defecto del motor de simulación. Todo el cohete queda fijado a la masa en vacío y el CG que introdujiste, así que las piezas inventadas no pesan nada por sí mismas. La masa del motor se suma encima y se consume como en cualquier simulación.

El vuelo es siempre vertical en aire en calma: sin viento, sin turbulencia y con la varilla vertical. Sin paracaídas, no se muestra nada después del apogeo.

## Lee el resultado {#read-the-result}

Las cifras vienen en dos grupos.

**Al salir de la rampa.** Apenas dependen de la resistencia, así que son tan buenas como tu masa y tu motor:

- **Velocidad de salida**, marcada cuando está por debajo del mínimo de **Ajustes ▸ Simulación**.
- **Empuje/peso a la salida**.
- **Acel. máx**.
- **Fin de combustión**: el momento en que se agota el motor.

**Vuelo estimado.** Dependen de la resistencia de una ojiva que el cohete quizá no tenga, así que tómalas como estimaciones:

- **Apogeo** y **Altitud al fin de combustión**, sobre la plataforma.
- **Vel. máx**, y **Mach máx.**, marcado por encima de Mach 0,8, donde la estimación de la resistencia es más aproximada.
- **Tiempo hasta el apogeo**.
- **Retardo ideal**: el planeo desde el fin de combustión hasta el apogeo. **Retardo disponible más cercano** es el retardo con que se vende el motor que más se le acerca.
- **Estabilidad al salir del lanzador**, en calibres, marcada por debajo de 1. Sale de tu CG y tus aletas, con la ojiva sustituta; la ojiva real la cambia un poco.

**Bajo el paracaídas**, si lo lleva:

- **Vel. despliegue**: lo rápido que va el cohete cuando salta la carga, marcada por encima del aviso de velocidad de despliegue de **Ajustes ▸ Simulación**.
- **Velocidad de aterrizaje**, marcada por encima de 20 ft/s (6,1 m/s).
- **Tiempo de vuelo**: del despegue al aterrizaje.

Si cambias un dato después de un vuelo, el resultado dice que está desactualizado.

## Guía de motores {#motor-guide}

**Guía de motores**, en la tarjeta Motor, vuela muchos motores en el cohete del Banco y los muestra uno junto a otro. Tiene los mismos filtros que la [guía de motores de un diseño](./motors.md#motor-guide), con **Cabe en el soporte** activado y el empuje/peso calculado a partir de tu masa en vacío.

1. Reduce la lista con los filtros. Todos los motores que coinciden aparecen marcados; desmarca los que no quieras, o usa **No seleccionar nada** y marca los pocos que sí quieras. Al hacer clic en cualquier parte de una fila se marca o se desmarca.
2. Pulsa **Volar** cuando haya 16 o menos marcados. Cada motor vuela una vez, con el mismo lanzamiento, para hallar su retardo ideal. Con paracaídas, un motor cuyo retardo más cercano no es el del primer vuelo vuela otra vez con ese retardo, para que su velocidad de despliegue sea la que da ese retardo. La guía muestra su progreso. **Cancelar** la detiene y conserva los motores ya volados.
3. La tabla tiene una fila por motor y se ordena por cualquier columna: impulso total, empuje medio, velocidad de salida, empuje/peso a la salida, aceleración máxima, apogeo, velocidad máxima, Mach máximo, tiempo hasta el apogeo, retardo ideal, retardo más cercano y estabilidad, y con paracaídas, velocidad de despliegue y de aterrizaje. **Estado** marca una salida lenta, un vuelo cerca de Mach 1, una estabilidad baja, un despliegue rápido y un aterrizaje duro.

Todos los motores vuelan con el mismo paracaídas, como volaría el cohete real. Un diámetro en blanco se dimensiona para el motor elegido en la pestaña, así que la carcasa de un motor más pesado se nota en un aterrizaje más rápido.

**Usar** devuelve ese motor y sus cifras a la pestaña, y conserva el paracaídas con que voló la guía. **⬇ CSV** descarga la tabla, en su orden actual, en tus unidades. **Borrar** vacía la tabla para volar otro grupo.

En un teléfono la tabla es una lista de tarjetas, una por motor, con un menú **Ordenar por** encima. Los filtros se ocultan mientras se muestran los resultados; **Borrar** los vuelve a mostrar.

La guía se guarda con los datos de la pestaña. Si cambias el cohete o el lanzamiento, dice que está desactualizada, y **Usar** se desactiva hasta que se vuele de nuevo.

## Abrir como diseño {#open-as-a-design}

**Abrir como diseño** empieza un diseño nuevo a partir del cohete del Banco y cambia a la pestaña **Diseño**. Contiene:

- la ojiva, el tubo de cuerpo, las aletas, el soporte y el paracaídas descritos en [qué se vuela](#what-is-flown),
- las anulaciones de masa y CG de la etapa, fijadas a tu masa en vacío y tu CG, para toda la etapa,
- una configuración de vuelo con tu motor en el soporte,
- una simulación de ella con tu longitud de varilla, tu altitud y tu temperatura.

A partir de ahí, cambia las piezas sustitutas por las reales: la forma y la longitud de la ojiva, el contorno de las aletas, el sistema de recuperación. Cuando las piezas pesen lo que pesan las reales, desactiva las anulaciones de la etapa para que el diseño calcule su propia masa y su propio CG.
