---
title: "Motores"
sidebar_position: 9
---
Un motor se asigna al **soporte de motor** (tubo interior) del cohete. Los motores viven en una [configuración de vuelo](./flight-configurations.md), y la pestaña **Configuraciones** es donde se eligen: una tarjeta por soporte, cada una con el motor que lleva y un botón **Cambiar…** para elegir otro.

## El selector de motores {#the-motor-picker}

El selector busca en un catálogo incluido de **~1.150 motores reales** de [thrustcurve.org](https://www.thrustcurve.org): filtra por fabricante, diámetro, clase de impulso, impulso total (un mínimo y un máximo, ambos opcionales) y designación. Al seleccionar un motor se muestran sus dimensiones y su impulso total.

- **Cabe en el soporte**: solo los motores que caben en este soporte, por su diámetro interior y la longitud disponible, incluido el saliente del motor. La etiqueta muestra el diámetro interior. Está activado por defecto cuando el selector se abre para un soporte; desactívalo para ver todo el catálogo.
- **Taponado**: solo los motores que el fabricante ofrece sin carga de eyección, para separación de etapas o recuperación electrónica. Cualquier motor se puede volar taponado desde el control de retardo (consulta [Retardo de eyección](#ejection-delay)).
- **Más filtros**: límites para **empuje medio**, **empuje máximo**, **tiempo de combustión**, **peso total**, **peso del propelente**, **longitud** e **Isp** (estimado a partir del impulso total y el peso del propelente), cada uno con un mínimo y un máximo en tus propias unidades, ambos opcionales. Quedan plegados hasta que los abres, y el botón cuenta cuántos hay puestos. Un motor para el que el catálogo no da un valor queda oculto en cuanto ese valor tiene un límite, porque no hay nada con qué comprobarlo. El Panel de motores y la [guía de motores](#motor-guide) tienen los mismos filtros.
- **Empuje/peso**: en el selector abierto desde un soporte, y en la guía de motores, Más filtros también limita el empuje medio del motor dividido por el peso del cohete al despegue: la estructura, los motores que ya están en los otros soportes y todos los motores que lleva el soporte, así que un racimo cuenta cada uno. Es la cifra en la que se expresa la regla habitual de 5 : 1. El Panel de motores no tiene un cohete que levantar, así que no lo ofrece.

Tres filtros más funcionan como en el selector de motores de OpenRocket de escritorio:

- **Ocultar motores fuera de producción regular**: el catálogo incluye unos 340 motores fuera de producción, para quien aún tenga uno. Quedan ocultos hasta que desmarcas esta casilla, y el detalle de un motor dice **Fuera de producción**. La elección se recuerda.
- **Ocultar motores ya usados en el soporte**: deja fuera los motores que este soporte ya vuela en sus otras configuraciones de vuelo. Aparece cuando hay alguno.
- **Ocultar curvas de empuje muy parecidas**: muchos motores tienen más de una curva (certificada, del fabricante, enviada por usuarios). Con esto activado, la lista de curvas deja fuera las que se parecen más de un 95 % a la mostrada, según la medida del propio OpenRocket. Activado por defecto, y se recuerda.

- El **catálogo** (las especificaciones de cada motor) viene con la aplicación, así que no hace falta ninguna consulta para explorarlo.
- La **curva de empuje** viene incluida en el catálogo, así que elegir un motor se resuelve al instante y funciona sin conexión. Unos 90 motores no tienen curva publicada. El selector los sigue mostrando con sus datos, marcados **sin curva**, pero no se pueden elegir ni volar. Para volar uno, importa un archivo `.eng` o `.rse` para él (consulta [Importar tus propios motores](#importing-your-own-motors)).

## Guía de motores {#motor-guide}

La guía de motores responde a «cuál de estos vuelo»: vuela un conjunto de motores candidatos en tu cohete y muestra todos los vuelos en una sola tabla. Ábrela con **Guía de motores** en la pestaña **Simulaciones**. Trabaja sobre la simulación activa, con sus condiciones de lanzamiento, su configuración de vuelo y sus ajustes.

1. Si el diseño tiene más de un soporte de motor, elige el **Soporte** en el que probar motores. Los demás soportes conservan el motor que ya tiene su configuración.
2. Reduce la lista con los mismos filtros que el selector de motores. **Cabe en el soporte** está activado por defecto. Los motores que coinciden aparecen debajo de los filtros, todos marcados; desmarca los que no quieras hasta que queden 8 o menos. La guía solo vuela motores cuya curva de empuje está en tu dispositivo: la que viene con el catálogo o una que hayas importado. Un motor sin curva publicada se deja fuera, y la guía dice cuántos.
3. Pulsa **Volar**. Cada motor se vuela una vez para hallar su **mejor retardo**, y otra vez con el retardo que ofrece más cercano a ese, así que la velocidad de despliegue de su fila es la que da ese retardo. En caso de empate gana el retardo más corto. Todos los vuelos usan la misma semilla de turbulencia, así que las diferencias entre filas vienen de los motores.

La tabla tiene una fila por motor y se ordena por cualquier columna: el retardo con que se voló, el impulso total, el empuje medio y el tiempo de combustión del motor, el apogeo, la velocidad y la aceleración máximas, la velocidad de salida del lanzador, el margen de estabilidad y el empuje/peso a la salida del lanzador, el tiempo hasta el apogeo, el mejor retardo, la velocidad de despliegue y la de aterrizaje. **Estado** da a cada vuelo los mismos avisos que darían sus resultados: salida del lanzador por debajo del mínimo de **Ajustes**, un margen a la salida en el límite o inestable, un despliegue demasiado rápido o demasiado lento, y cuántos avisos de vuelo dio el motor de simulación. Pasa el puntero sobre el estado para leer los avisos.

Un motor que una simulación normal rechazaría aparece debajo de la tabla con el motivo. Por ejemplo, un motor de alta potencia hace que el límite del ángulo del lanzador sea de 20°, así que un lanzamiento a 25° se rechaza solo para ese motor.

- **Usar** conserva un motor: añade una configuración de vuelo con ese motor en el soporte, y una simulación de ella junto a la de partida. Ejecútala para ver todos sus resultados. Es un solo paso de deshacer.
- **⬇ CSV** descarga la tabla en tus unidades.
- **Cancelar** detiene la guía y conserva los motores ya volados.

Los vuelos no se guardan ni añaden simulaciones. La tabla se queda hasta que la borras, vuelves a volar la guía o abres otro diseño. Si cambias el diseño o la simulación después de volar, la tabla lo indica y **Usar** se desactiva hasta que vuelvas a volarla.

## Retardo de eyección {#ejection-delay}

Cuando un motor ofrece varios retardos de eyección, elige el que vas a volar (o la opción **taponado** para motores usados sin carga de eyección). El retardo alimenta el momento de apertura de la recuperación en la simulación.

## Importar tus propios motores {#importing-your-own-motors}

### Archivos `.eng` (RASP) {#eng-files-rasp}
Importa un archivo de curva de empuje **`.eng`** estándar: lleva su propia curva, así que no hace falta ninguna consulta. Los motores importados aparecen en el selector (señalados y eliminables) y se guardan en tu navegador. Puedes elegir varios archivos a la vez; un archivo que no se puede leer se nombra y los demás se importan.

### Archivos `.rse` (RockSim) {#rse-files-rocksim}
El mismo botón acepta **`.rse`**, que es el formato indicado para un **híbrido**. RASP no tiene forma de registrar el tipo de un motor, así que un motor importado desde `.eng` es de tipo desconocido, mientras que uno importado desde `.rse` aparece como híbrido (o recargable, o de un solo uso) en el panel de detalle del motor. Los dos formatos pueden indicar que un motor se vende **taponado** (en `.eng`, una `P` en la lista de retardos), que es lo que busca el filtro correspondiente del selector.

`.rse` también lleva más datos que afectan a la simulación. `.eng` da un único peso de propelente y deja que la curva de masa se reconstruya a partir de la curva de empuje; `.rse` registra la masa en cada muestra, y la simulación usa esas cifras medidas directamente cuando el archivo las aporta. También lleva el CG real del motor en el despegue, en lugar de la aproximación a media longitud que obliga a usar un archivo RASP. Un archivo que pide que se recalculen su masa o su CG (`auto-calc-mass`, `auto-calc-cg`) recibe la misma reconstrucción que `.eng`, que es lo que hace OpenRocket con él.

Un `.rse` puede contener un motor o toda la gama de un fabricante; se importan todos los motores del archivo y el selector indica cuántos se importaron. El formato se detecta por el contenido del archivo y no por su nombre, así que un `.rse` guardado como `.eng` se lee igualmente bien.

### Motores personalizados {#custom-motors}
Los motores personalizados o importados se conservan localmente junto a tus materiales personalizados, así que están disponibles en todos tus diseños en ese navegador.

## Varios soportes {#multiple-mounts}

Un diseño puede tener más de un soporte de motor (por ejemplo, en clúster o por etapas). Cada soporte tiene su propia tarjeta en la pestaña Configuraciones, de punta a cola, y cada configuración lleva un motor para todos ellos. Los soportes conservan los motores con los que se importaron o abrieron, y un soporte recién añadido empieza con un **motor por defecto** para que el diseño siempre esté listo para volar: pulsa **Cambiar…** en su tarjeta para elegir el real. Si eliminas un soporte, su motor se descarta automáticamente. Consulta [Configuraciones de vuelo](./flight-configurations.md) para la ignición, las etapas y cómo una preparación se comparte entre simulaciones.
