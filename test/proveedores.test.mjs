import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRutas, configLimpia, configPublica, decodificarPolilinea, leerCoordenadas, simplificar } from '../rutas/lib/proveedores.mjs';

const respuesta = (cuerpo, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(cuerpo) });
function falso(fn) { const llamadas = []; const f = async (url, init = {}) => { llamadas.push({ url: String(url), init }); return fn(String(url), init); }; f.llamadas = llamadas; return f; }
const A = { lat: 40.4, lon: -3.7 }, B = { lat: 39.86, lon: -4.02 }, C = { lat: 39.5, lon: -3.0 };

test('coordenadas y utilidades', () => {
  assert.deepEqual(leerCoordenadas('40.4168, -3.7038'), { lat: 40.4168, lon: -3.7038 });
  assert.deepEqual(leerCoordenadas('40,4168; -3,7038'), { lat: 40.4168, lon: -3.7038 });
  assert.equal(leerCoordenadas('Calle Mayor 1'), null);
  assert.equal(leerCoordenadas('95, 10'), null);
  assert.deepEqual(decodificarPolilinea('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.equal(simplificar(Array.from({ length: 1000 }, (_, i) => [i, i]), 10).length, 10);
});

test('configuración: valores por defecto, límites y sin claves en la parte pública', () => {
  const c = configLimpia({ proveedor: 'raro', opciones: { camion: { peso_t: 500 } } });
  assert.equal(c.proveedor, 'ors');
  assert.equal(c.opciones.camion.peso_t, 40);
  assert.equal(c.opciones.evitar_ferris, true);
  const p = configPublica({ proveedor: 'google', google: { clave_servidor: 'SECRETA', clave_navegador: 'PUBLICA' } });
  assert.equal(p.clave_navegador, 'PUBLICA');
  assert.equal(p.configurado, true);
  assert.ok(!JSON.stringify(p).includes('SECRETA'));
});

test('OpenRouteService: camión, evitar peajes y restricciones', async () => {
  const f = falso(() => respuesta({ features: [{ properties: { summary: { distance: 75432, duration: 4000 } }, geometry: { coordinates: [[-3.7, 40.4], [-4.02, 39.86]] } }] }));
  const r = await crearRutas({ ors: { clave: 'CLAVE' }, opciones: { evitar_peajes: true } }, { fetch: f }).ruta([A, B]);
  const { url, init } = f.llamadas[0];
  assert.equal(url, 'https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson');
  assert.equal(init.headers.Authorization, 'CLAVE');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.coordinates, [[-3.7, 40.4], [-4.02, 39.86]]);
  assert.deepEqual(body.options.avoid_features, ['tollways', 'ferries']);
  assert.equal(body.options.vehicle_type, 'hgv');
  assert.equal(body.options.profile_params.restrictions.weight, 40);
  assert.equal(r.km, 75.4);
  assert.equal(r.minutos, 67);
  assert.deepEqual(r.linea[0], [40.4, -3.7]);
});

test('OpenRouteService: coche sin restricciones, varios destinos y errores de clave', async () => {
  const f = falso(() => respuesta({ features: [{ properties: { summary: { distance: 1000, duration: 60 } }, geometry: { coordinates: [] } }] }));
  await crearRutas({ ors: { clave: 'K' } }, { fetch: f }).ruta([A, B, C], { perfil: 'coche', evitar_ferris: false });
  const body = JSON.parse(f.llamadas[0].init.body);
  assert.match(f.llamadas[0].url, /driving-car/);
  assert.equal(body.coordinates.length, 3);
  assert.equal(body.options.vehicle_type, undefined);
  assert.equal(body.options.avoid_features, undefined);
  const mal = falso(() => respuesta({ error: { message: 'Access to this API has been disallowed' } }, 403));
  await assert.rejects(crearRutas({ ors: { clave: 'K' } }, { fetch: mal }).ruta([A, B]), /rechazado la clave/);
  await assert.rejects(crearRutas({}).ruta([A, B]), /Falta la clave de OpenRouteService/);
});

test('Google: Routes API con avoidTolls y aviso de camión', async () => {
  const f = falso(() => respuesta({ routes: [{ distanceMeters: 80000, duration: '3600s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] }));
  const r = await crearRutas({ proveedor: 'google', google: { clave_servidor: 'G' }, opciones: { evitar_peajes: true, evitar_autopistas: true } }, { fetch: f }).ruta([A, C, B]);
  const { url, init } = f.llamadas[0];
  assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(init.headers['X-Goog-Api-Key'], 'G');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.routeModifiers, { avoidTolls: true, avoidHighways: true, avoidFerries: true });
  assert.equal(body.intermediates.length, 1);
  assert.equal(r.km, 80);
  assert.equal(r.minutos, 60);
  assert.match(r.avisos[0], /no calcula rutas para camiones/);
});

test('búsqueda de direcciones: Nominatim sin clave, Pelias con clave, Google y caché', async () => {
  const nom = falso(() => respuesta([{ display_name: 'Toledo, España', lat: '39.86', lon: '-4.02' }]));
  const r1 = crearRutas({}, { fetch: nom });
  assert.equal((await r1.geocodificar('Toledo'))[0].lat, 39.86);
  await r1.geocodificar('toledo');
  assert.equal(nom.llamadas.length, 1, 'la segunda búsqueda sale de la caché');
  assert.match(nom.llamadas[0].url, /nominatim\.openstreetmap\.org\/search\?q=Toledo.*countrycodes=es/);
  assert.ok(nom.llamadas[0].init.headers['User-Agent']);

  const pel = falso(() => respuesta({ features: [{ properties: { label: 'Toledo, CM, España' }, geometry: { coordinates: [-4.02, 39.86] } }] }));
  const r2 = await crearRutas({ ors: { clave: 'K' } }, { fetch: pel }).geocodificar('Toledo');
  assert.match(pel.llamadas[0].url, /^https:\/\/api\.heigit\.org\/pelias\/v1\/search\?text=Toledo/);
  assert.equal(r2[0].lon, -4.02);

  const goo = falso(() => respuesta({ status: 'OK', results: [{ formatted_address: 'Toledo', geometry: { location: { lat: 39.86, lng: -4.02 } } }] }));
  const r3 = await crearRutas({ proveedor: 'google', google: { clave_servidor: 'G' } }, { fetch: goo }).geocodificar('Toledo');
  assert.match(goo.llamadas[0].url, /maps\.googleapis\.com\/maps\/api\/geocode\/json\?address=Toledo/);
  assert.equal(r3[0].etiqueta, 'Toledo');
  const coords = await crearRutas({}, { fetch: nom }).geocodificar('39.86, -4.02');
  assert.equal(coords[0].fuente, 'coordenadas');
});

test('los archivos compartidos son iguales que en facturador-plugins', async (t) => {
  const fs = await import('node:fs');
  const otro = new URL('../../facturador-plugins/rutas/', import.meta.url);
  if (!fs.existsSync(otro)) return t.skip('falta ../facturador-plugins');
  for (const f of ['lib/proveedores.mjs', 'ui/mapa.js']) {
    assert.equal(fs.readFileSync(new URL(`../rutas/${f}`, import.meta.url), 'utf8'), fs.readFileSync(new URL(f, otro), 'utf8'), `${f} es distinto en facturador-plugins`);
  }
});
