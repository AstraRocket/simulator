---
title: "Sincronizar tu trabajo"
sidebar_position: 5.5
---
**AstraRocket no sincroniza.** No hay planes de tener un servidor. Tus diseños, motores, materiales, piezas, ubicaciones y ajustes viven en **este navegador en este dispositivo**, y en ningún otro sitio.

Para tener tu trabajo en otro ordenador o en tu teléfono, guarda sus **archivos** en una carpeta que ya sincronice un servicio en la nube: **Google Drive**, **OneDrive**, **Dropbox** o **iCloud Drive**. El servicio se encarga de sincronizar; tú **exportas** desde AstraRocket a esa carpeta e **importas** desde ella en el otro dispositivo.

Esa es también tu **copia de seguridad**. Borrar los datos del navegador, o perder el dispositivo, elimina todo lo que guarda la app (consulta [Sin conexión e instalación](./offline-and-installing.md#clearing-it)). Un archivo en una carpeta sincronizada sobrevive a ambas cosas.

Dos tipos de archivo llevan tu trabajo, y se mueven por separado:

- **Tus diseños**, cada uno en su propio archivo `.ork`.
- **Todo lo demás que configuras**: materiales, piezas, ubicaciones, motores, plantillas y ajustes, juntos en un archivo de copia de seguridad.

## Preparar la carpeta {#setting-up-the-folder}

Instala la app del propio servicio en cada dispositivo e inicia sesión. Crea en tu disco una carpeta que es la misma en todas partes:

- **Google Drive**: **Google Drive para ordenadores** (Windows y Mac) añade una unidad o carpeta **Google Drive**.
- **OneDrive**: viene con Windows, y hay una app para Mac; añade una carpeta **OneDrive**.
- **Dropbox**: la app de escritorio de **Dropbox** añade una carpeta **Dropbox**.
- **iCloud Drive**: viene en todo Mac, iPhone y iPad, e **iCloud para Windows** lo añade en Windows.

Crea dentro una carpeta para tus cohetes, por ejemplo **Cohetes**, y usa siempre esa.

## Tus diseños: archivos `.ork` {#your-designs-ork-files}

Un `.ork` contiene un cohete, con sus configuraciones de vuelo y sus simulaciones. También se abre en OpenRocket de escritorio, así que la misma carpeta sirve para ambos.

- **Exportar:** **Menú → Exportar → OpenRocket**, y guárdalo en la carpeta sincronizada.
- **Importar:** **Menú → Importar → OpenRocket**, y elige el `.ork` de la carpeta sincronizada.

La biblioteca de **Abrir…** y **Guardar como…** no se sincroniza: se queda en este navegador. Exporta cada diseño que quieras tener en otro dispositivo.

Para pasar de un dispositivo a otro:

1. **Antes de cambiar**, exporta el diseño en el que trabajabas, siempre con el mismo nombre.
2. **Dale un momento al servicio** para subirlo. Su icono indica cuándo ha terminado.
3. **En el otro dispositivo**, importa ese `.ork`. Trabaja y luego expórtalo de nuevo con el mismo nombre.

La sincronización es por archivo, no en directo. Si dos dispositivos editan el mismo diseño a la vez, cada uno guarda su propia copia y gana la última guardada; la mayoría de los servicios conservan la otra como "copia en conflicto" a su lado. Termina en un dispositivo antes de empezar en el siguiente.

## Tus materiales, piezas, ubicaciones y ajustes: la copia de seguridad {#your-materials-parts-locations-and-settings-the-backup-file}

Un archivo de copia de seguridad (`.json`) contiene Materiales personalizados, Piezas personalizadas, ubicaciones de lanzamiento, motores importados, plantillas de trayectoria de vuelo y tus ajustes. Los diseños no van en él.

- **Exportar:** **Menú → Exportar → Copia de seguridad**, desmarca lo que quieras dejar fuera y luego **Guardar copia de seguridad** en la carpeta sincronizada.
- **Importar:** **Menú → Importar → Copia de seguridad**, pulsa **Abrir copia de seguridad…** y elígela de la carpeta sincronizada, elige qué traer y pulsa **Restaurar**.

Restaurar combina tus listas: una entrada que coincide con otra ya existente la reemplaza, y el resto se añade. Tus ajustes se reemplazan por los del archivo. Consulta las [preguntas frecuentes](./faq.md#how-do-i-move-my-materials-parts-and-locations-to-another-computer) para los detalles.

Tus claves de API de mapas y meteorología no van en la copia de seguridad, porque es un archivo que podrías pasar a otra persona. Vuelve a introducirlas en cada dispositivo.

Guarda una nueva copia de seguridad cada vez que cambies algo de esto, para que la carpeta tenga lo último.

## Guardar en la carpeta, según el dispositivo {#saving-into-the-folder-by-device}

**Chrome y Edge** en un ordenador preguntan dónde guardar cada archivo, así que elige la carpeta sincronizada. Es **Preguntar dónde guardar cada archivo** en [Ajustes](./settings.md), activado por defecto.

**Firefox y Safari** en un ordenador guardan en tu carpeta de descargas. Mueve después el archivo a la carpeta sincronizada, o haz que el navegador descargue allí: en Firefox, **Ajustes → General → Descargas**; en Safari, **Ajustes → General → Ubicación de descarga de archivos**.

**En un iPhone o iPad**, un archivo guardado desde Safari va a la carpeta **Descargas** de la app Archivos, que está en iCloud Drive salvo que lo hayas cambiado. Con la app instalada en tu pantalla de inicio, guardar abre la hoja de compartir: elige **Guardar en Archivos** y luego iCloud Drive, o Google Drive, OneDrive o Dropbox si tienes sus apps instaladas.

**En un teléfono o tableta Android**, el archivo va a **Descargas**. Súbelo desde ahí con la app de Google Drive, OneDrive o Dropbox, o compártelo con esa app.

## Elegir de la carpeta, según el dispositivo {#picking-from-the-folder-by-device}

Importar abre el selector de archivos de tu dispositivo, que llega a la carpeta sincronizada:

- **En un ordenador**, ve a ella como a cualquier carpeta.
- **En un iPhone o iPad**, el selector muestra iCloud Drive, y Google Drive, OneDrive o Dropbox si tienes sus apps instaladas.
- **En Android**, el selector muestra Google Drive y cualquier otra app de almacenamiento que tengas.
