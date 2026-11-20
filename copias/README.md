# Copias de seguridad automáticas

Plugin para Gestor DeCA 1.5.0 o posterior.

## Qué hace

- Copias **diarias o semanales** a la hora elegida, con la base de datos y/o los PDF, y botón **«Crear copia ahora»**.
- Cada copia se comprueba (integridad de la base de datos y número de PDF) antes de darla por válida. Se conservan las N últimas automáticas; las antiguas se borran solo después de una copia nueva correcta.
- Estado de la última copia (fecha, tamaño, errores de espacio, permisos o escritura), descarga en `.tar.gz` y **restauración** con confirmación (antes se guarda una copia del estado actual).

## A tener en cuenta

- Las copias se guardan dentro de la carpeta de datos (persistente en Docker) o de `DECA_COPIAS_DIR`; no se admiten rutas fuera ni carpetas temporales.
- Restaurar necesita que la aplicación se ejecute con supervisor (`npm start`): se reinicia y Gestor DeCA coloca los datos antes de abrir la base de datos. La copia manual de siempre sigue disponible.
