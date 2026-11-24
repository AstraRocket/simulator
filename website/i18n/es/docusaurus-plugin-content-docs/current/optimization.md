---
title: "Optimización del cohete"
sidebar_position: 12.3
---
El optimizador responde a "¿qué medida debería tener esta pieza?": vuela una simulación una y otra vez cambiando las medidas elegidas y conserva el diseño que mejor cumple un objetivo, como el apogeo más alto o una velocidad de aterrizaje de exactamente 5 m/s. Funciona como el optimizador de OpenRocket de escritorio, con los mismos objetivos, límites de estabilidad y métodos de búsqueda. Ábrelo con **Optimizar** en la pestaña **Simulaciones**. Trabaja sobre la simulación activa, con sus condiciones de lanzamiento, su configuración de vuelo y sus ajustes.

## Prepararlo {#set-it-up}

El cuadro tiene dos columnas. La izquierda contiene los parámetros: arriba la lista a optimizar y debajo el árbol de parámetros disponibles. La derecha contiene el objetivo, los límites de estabilidad y **Optimizar**, con los resultados debajo. En una pantalla estrecha las columnas se apilan.

1. **Objetivo.** Elige **Maximizar**, **Minimizar** o **Buscar** y un dato de vuelo: apogeo, velocidad máxima, aceleración máxima, estabilidad, velocidad de aterrizaje, velocidad de despliegue, distancia de aterrizaje desde la plataforma o tiempo de vuelo. **Buscar** pide el valor que hay que alcanzar.
2. **Límites de estabilidad.** Un diseño fuera de ellos nunca se elige, y no se vuela. **Mínimo** empieza activado en 1 calibre y **Máximo** desactivado en 5, como en el escritorio. **Estabilidad en** cambia ambos entre calibres y la longitud del CP al CG. La estabilidad es la que muestra el panel del diseño en la plataforma, con los motores puestos.
3. **Parámetros.** Como en el escritorio, **Parámetros disponibles** lista las piezas del cohete con el mismo anidamiento que el árbol del diseño, y los parámetros de cada pieza debajo de ella. Una pieza que contiene otras guarda sus propios parámetros en un grupo plegado, **Parámetros de optimización**. Haz doble clic en un parámetro, o selecciónalo y pulsa **Añadir** (Ctrl+clic selecciona varios), para pasarlo a **Parámetros a optimizar**, y fija ahí su **Mínimo** y su **Máximo**. Un parámetro que ya está en la lista aparece atenuado en el árbol. **Quitar** saca las filas con la casilla marcada y **Quitar todos** vacía la lista. Cada rango empieza entre la mitad y el doble de su valor actual, como en el escritorio. Los retardos empiezan de 0 a 5 s para el encendido y de 0 a 10 s para el despliegue, y una posición empieza en todos los sitios que mantienen la pieza dentro de la que la contiene.
4. Selecciona **Optimizar**.

## Los parámetros {#the-parameters}

La lista se construye a partir del diseño. Se deja fuera una pieza de una etapa que la configuración deja en tierra.

| Pieza | Qué puede variar |
| --- | --- |
| Ojiva | Longitud; diámetro de la base, salvo que sea automático |
| Transición | Longitud; diámetros delantero y trasero, salvo que sean automáticos; parámetro de forma, en una forma que lo tenga |
| Tubo de cuerpo | Longitud; diámetro, salvo que sea automático |
| Aletas trapezoidales | Cuerda de raíz, cuerda de punta, flecha, altura, posición |
| Aletas elípticas | Cuerda de raíz, altura, posición |
| Aletas libres | Posición |
| Piezas interiores (tubos interiores, acopladores, anillos, mamparos, topes de motor, dispositivos de recuperación, cuerdas de choque, componentes de masa) | Posición |
| Componente de masa | Masa |
| Soporte de motor | Sobresaliente del motor; retardo de encendido, para un motor de una etapa superior |
| Paracaídas | Diámetro |
| Serpentina | Longitud, anchura |
| Paracaídas o serpentina | Retardo de despliegue; altitud de despliegue, cuando se despliega a una altitud |

Cada valor se fija como lo haría escribirlo en el editor del diseño, así que los diámetros automáticos y los hombros lo siguen. Un retardo de despliegue o de encendido que la configuración de vuelo fija por su cuenta se cambia en esa configuración, como hace el escritorio.

### Lo que ofrece el escritorio y aquí no está {#what-desktop-offers-that-this-does-not}

El optimizador del escritorio lista algunos valores que ninguno de sus objetivos puede aprovechar. Cada uno acaba siempre en un extremo de su rango o no cambia nada de lo que mide un objetivo, así que aquí se dejan fuera:

- **Inclinación de las aletas.** Solo cambia la velocidad de giro, y ningún objetivo mide el giro.
- **Grosor de pared** de ojivas, transiciones y tubos de cuerpo. Solo añade masa, así que la búsqueda siempre lo lleva al mínimo de su rango. Para cambiar masa por un objetivo, varía un componente de masa.
- **Sustituciones de masa y CG.** Son medidas de una pieza construida, no una decisión de diseño.
- **Coeficientes de resistencia de paracaídas y serpentinas.** Vienen con el que compras. Varía su tamaño.
- **Relación de aspecto de la serpentina.** Es la longitud entre la anchura, y ambas se ofrecen.
- **Longitud, diámetro, grosor y posición de la guía de lanzamiento.** Apenas cambian el vuelo.
- **Retardo de encendido de un motor de la etapa inferior.** Solo retiene más tiempo el cohete en la plataforma.

## Cómo busca {#how-it-searches}

Cada parámetro se escala de 0 en su mínimo a 1 en su máximo, y la búsqueda parte del diseño tal como está. Con un parámetro a optimizar usa una búsqueda de la sección áurea. Con más usa una búsqueda multidireccional. Ambas terminan cuando un paso baja del 0,5 % de cada rango, como las del escritorio.

A diferencia del escritorio, la búsqueda nunca sale de los rangos que fijas. Cuando un paso en el borde de un rango no encuentra nada mejor, prueba un paso en cada parámetro antes de dar pasos más pequeños, así que también encuentra el mejor diseño si está en el borde de un rango. Se detiene tras 500 diseños si no ha terminado antes.

Todos los vuelos usan la misma semilla de turbulencia, así que las diferencias entre diseños vienen del diseño. Un diseño que el motor de simulación se niega a construir o volar recibe la peor puntuación, y la búsqueda continúa.

## Los resultados {#the-results}

- **Pasos** lista el inicio y cada diseño mejor que encontró la búsqueda, con su estabilidad y su dato objetivo. La última fila es la mejor.
- **Aplicar** lleva el diseño al mejor, en un solo paso de deshacer. Está desactivado cuando nada fue mejor que el inicio, y cuando el diseño o la simulación han cambiado desde la ejecución.
- **⬇ CSV** descarga todos los diseños probados, en tus unidades: cada parámetro, su estabilidad y su dato objetivo. Un diseño fuera de los límites de estabilidad tiene el dato objetivo vacío.
- **Cancelar** detiene la búsqueda y conserva el mejor diseño hasta entonces.

Los resultados no se guardan. Permanecen hasta que los borras, optimizas de nuevo o abres otro diseño.
