# Plugins de Gestor DeCA y eCMR

Plugins oficiales de [Gestor DeCA y eCMR](https://github.com/im7manu/gestor-deca-ecmr) (versión 1.5.0 o posterior). Se instalan desde la página **Plugins** de la aplicación (solo administradores), que lee el `registry.json` de este repositorio.

| Plugin | Qué hace |
|---|---|
| [`rutas`](rutas/) | Rutas y mapas: busca las ubicaciones o pon sus coordenadas, muestra la ruta de cada envío (camión o coche, evitando peajes, autopistas o ferris) y guarda los km para facturarlos por kilómetro en Facturador. OpenRouteService (gratis) o Google Maps (con tu clave) |

## Instalar

En Gestor DeCA, como administrador: **Plugins** → *Disponibles* → **Instalar**. La aplicación descarga el paquete de la *Release* y comprueba su SHA-256 con el de `registry.json`. Las actualizaciones aparecen en la misma página.

Sin conexión: descarga el `.tar.gz` de la [Release](https://github.com/im7manu/gestor-deca-plugins/releases) y súbelo en *Instalar desde un archivo*.

Los plugins y sus datos se guardan en la carpeta `data/` de la instalación: las actualizaciones de la aplicación no los borran.

## Publicar una versión

```bash
npm test                              # pruebas
node scripts/empaquetar.mjs rutas     # dist/rutas-<versión>.tar.gz y su entrada en registry.json
gh release create rutas-v1.0.0 dist/rutas-1.0.0.tar.gz --title "Rutas y mapas 1.0.0"
git add registry.json && git commit -m "rutas 1.0.0" && git push
```

`empaquetar.mjs` solo vuelve a empaquetar los plugins que le indicas, así que no cambia el SHA-256 de los demás.

## Crear un plugin

Mira [`docs/plugins.md`](https://github.com/im7manu/gestor-deca-ecmr/blob/main/docs/plugins.md) en el repositorio de la aplicación.

## Licencia

MIT. El plugin `rutas` incluye [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2-Clause, ver `rutas/ui/leaflet/LICENSE`).
