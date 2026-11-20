# Rutas y mapas

Mapas y rutas para [Gestor DeCA y eCMR](https://github.com/im7manu/gestor-deca-ecmr) 1.5.0 o posterior.

## Qué hace

- **Direcciones que se completan solas**: al escribir en el campo de dirección (ubicaciones, empresas, nueva contraparte y Mi entidad) aparecen sugerencias. Al elegir una se rellenan la dirección, el código postal, la población y la provincia (y la posición en el mapa en las ubicaciones). Con OpenRouteService se usa su autocompletado; sin clave, Photon (OpenStreetMap); con Google, Geocoding API.
- **Ubicaciones frecuentes**: la posición se toma de la dirección elegida; también puedes poner coordenadas (`40.4168, -3.7038`) o pulsar en el mapa. Si no eliges nada, la dirección se busca sola al guardar. La lista marca qué ubicaciones están en el mapa.
- **Envíos**: en el formulario, el panel **Ruta y kilómetros** calcula la ruta del lugar de carga a las descargas, con vista previa en el mapa, km y duración. Puedes elegir camión o turismo y evitar peajes, autopistas y autovías o ferris, y **corregir los km a mano**. Si cambias los lugares, la ruta se recalcula.
- **Detalle del envío**: km guardados, ver la ruta en el mapa, corregir los km o recalcular. Si cambian los lugares después de corregir los km a mano, avisa para revisarlos.
- **Cálculo automático**: los envíos guardados sin ruta (por ejemplo, desde otra pantalla) la calculan solos si está activada la opción.
- **Facturador**: la API de integración devuelve en cada envío `ruta` (km, km calculados, duración, opciones) y `puntos` (coordenadas de carga y descargas). El plugin `gestor-deca` de Facturador los usa para **facturar por kilómetro**.

## Configuración (menú Mapas y rutas, administradores)

| | OpenRouteService (por defecto) | Google Maps |
|---|---|---|
| Precio | Gratis (cuenta en [account.heigit.org](https://account.heigit.org); unas 2.000 rutas al día) | Necesita una cuenta de facturación en Google Cloud; Google incluye un uso mensual gratuito por servicio |
| Camiones | Sí, con peso, altura, anchura, longitud y carga por eje | No: calcula como turismo (se avisa) |
| Evitar peajes, autopistas o ferris | Sí (los peajes, fiable dentro de un país) | Sí |
| Mapa | OpenStreetMap con Leaflet (incluido) | Google Maps |
| Búsqueda de direcciones | OpenRouteService; sin clave, Nominatim de OpenStreetMap | Geocoding API |

Con Google hacen falta dos claves: una **de servidor** (Routes API y Geocoding API, restringida a la IP del servidor) y una **de navegador** (Maps JavaScript API, restringida a la dirección del gestor). Las rutas de Google solo se muestran sobre un mapa de Google.

**Probar conexión** calcula una ruta corta para comprobar la clave.

## Seguridad y privacidad

- Las claves se guardan cifradas con la clave de la instalación y nunca llegan al navegador (salvo la clave de navegador de Google, pública por diseño).
- Las rutas y las búsquedas las pide el servidor. Al proveedor solo se envían direcciones o coordenadas.
- El plugin añade a la política de seguridad de contenidos solo los orígenes del mapa (teselas de OpenStreetMap y Google Maps).

## Archivos compartidos

`lib/proveedores.mjs` y `ui/mapa.js` son los mismos que en el plugin «Rutas y mapas» de [Facturador](https://github.com/im7manu/facturador-plugins). Si cambias uno, cópialo en el otro repositorio.
