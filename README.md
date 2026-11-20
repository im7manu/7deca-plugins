# Plugins de 7DeCA

Plugins oficiales de [7DeCA](https://github.com/im7manu/gestor-deca-ecmr) (versión 1.5.0 o posterior). Se instalan desde la página **Plugins** de la aplicación (solo administradores), que lee el `registry.json` de este repositorio.

| Plugin | Qué hace |
|---|---|
| [`whatsapp`](whatsapp/) | Envía el PDF del DeCA o eCMR al conductor por WhatsApp desde el número de la empresa (WhatsApp Web vinculado con QR), separado del WhatsApp de recuperación de contraseñas |
| [`correo`](correo/) | Envía los documentos por correo con la cuenta SMTP de la empresa, con plantillas e historial |
| [`plantillas`](plantillas/) | Plantillas de transportes frecuentes para crear envíos sin repetir datos |
| [`hoja-servicio`](hoja-servicio/) | Hoja operativa en PDF para el conductor (no sustituye al documento oficial) |
| [`calendario`](calendario/) | Exporta los transportes a cualquier calendario en .ics |
| [`copias`](copias/) | Copias de seguridad automáticas con comprobación, retención y restauración segura |
| [`rutas`](rutas/) | 7Ruta: busca las ubicaciones o pon sus coordenadas, muestra la ruta de cada envío (camión o coche, evitando peajes, autopistas o ferris) y guarda los km para facturarlos por kilómetro en 7Factura. OpenRouteService (gratis) o Google Maps (con tu clave) |

## Instalar

En 7DeCA, como administrador: **Plugins** → *Disponibles* → **Instalar**. La aplicación descarga el paquete de la *Release* y comprueba su SHA-256 con el de `registry.json`. Las actualizaciones aparecen en la misma página.

Sin conexión: descarga el `.tar.gz` de la [Release](https://github.com/im7manu/gestor-deca-plugins/releases) y súbelo en *Instalar desde un archivo*.

Los plugins y sus datos se guardan en la carpeta `data/` de la instalación: las actualizaciones de la aplicación no los borran.

## Publicar una versión

```bash
npm test                              # pruebas
node scripts/empaquetar.mjs rutas     # dist/rutas-<versión>.tar.gz y su entrada en registry.json
gh release create rutas-v1.0.0 dist/rutas-1.0.0.tar.gz --title "7Ruta 1.0.0"
git add registry.json && git commit -m "rutas 1.0.0" && git push
```

`empaquetar.mjs` solo vuelve a empaquetar los plugins que le indicas, así que no cambia el SHA-256 de los demás. Antes, instala las dependencias de los plugins que las tienen (`npm ci --omit=dev` en `whatsapp` y `correo`); se excluyen `sharp`, los tipos y `node_modules/.bin`.

Las pruebas (`npm test`) necesitan 7DeCA 1.5.0 clonado al lado (`../gestor-deca-ecmr`).

## Crear un plugin

Mira [`docs/plugins.md`](https://github.com/im7manu/gestor-deca-ecmr/blob/main/docs/plugins.md) en el repositorio de la aplicación.

## Licencia

MIT. El plugin `rutas` incluye [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2-Clause, ver `rutas/ui/leaflet/LICENSE`).
