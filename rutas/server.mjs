// Plugin «Rutas y mapas» para Gestor DeCA y eCMR.
//
// - Ubicaciones: busca la dirección (o acepta coordenadas) y guarda su posición para verla en el mapa.
// - Envíos: calcula la ruta (camión o coche, evitando peajes, autopistas o ferris) con vista previa y guarda los km.
//   Los km se pueden corregir a mano. Facturador los recibe por la API de integración (campo «ruta»).
// - Proveedor: OpenRouteService por defecto (clave gratuita) o Google Maps con la clave del administrador.
//   Las claves se guardan cifradas y nunca llegan al navegador (salvo la clave de navegador de Google, pública).
import crypto from 'node:crypto';
import { crearRutas, configLimpia, configPublica, ErrorMapa, leerCoordenadas } from './lib/proveedores.mjs';

const AJUSTE = 'rutas';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function register(ctx) {
  const { router, db, adm, can, logAudit } = ctx;

  db.exec(`CREATE TABLE IF NOT EXISTS plugin_rutas_ubicaciones(
      ubicacion_id INTEGER PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL, etiqueta TEXT DEFAULT '', fuente TEXT DEFAULT '', actualizado TEXT
    );
    CREATE TABLE IF NOT EXISTS plugin_rutas_envios(
      doc_id INTEGER PRIMARY KEY, km REAL, km_calculado REAL, minutos INTEGER, manual INTEGER DEFAULT 0, revisar INTEGER DEFAULT 0,
      opciones TEXT, puntos TEXT, linea TEXT, proveedor TEXT, calculado TEXT, error TEXT
    )`);

  // ---------------- Configuración ----------------
  const leer = () => ctx.getAjuste(AJUSTE, {}) || {};
  const des = (v) => { try { return v ? ctx.descifrar(v) : ''; } catch { return ''; } };
  /** Configuración completa con las claves descifradas (solo para el servidor). */
  function config() {
    const c = leer();
    return configLimpia({ ...c, ors: { ...c.ors, clave: des(c.ors?.clave) }, google: { ...c.google, clave_servidor: des(c.google?.clave_servidor) } });
  }
  const auto = () => leer().auto !== false;
  let motor = null, firma = '';
  function rutas() {
    const c = config(), f = JSON.stringify(c);
    if (!motor || f !== firma) { motor = crearRutas(c); firma = f; }
    return motor;
  }

  const envolver = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      const st = e instanceof ErrorMapa || e.status ? e.status || 502 : 500;
      if (st === 500) console.error('[rutas]', e);
      res.status(st).json({ error: st === 500 ? 'Error interno' : e.message });
    }
  };
  const L = (req, accion, detalle, sev = 'info') => logAudit(req.u.usuario, req.ip, accion, detalle, sev);

  router.get('/config', (req, res) => {
    const c = leer(), pub = { ...configPublica(config()), auto: auto() };
    if (req.u.rol === 'admin') {
      Object.assign(pub, {
        ors: { tiene_clave: !!c.ors?.clave, base_ruta: config().ors.base_ruta, base_geo: config().ors.base_geo },
        google: { tiene_clave_servidor: !!c.google?.clave_servidor, clave_navegador: config().google.clave_navegador },
      });
    }
    res.json(pub);
  });

  router.put('/config', adm, envolver(async (req, res) => {
    const b = req.body || {}, ant = leer();
    const nueva = configLimpia({
      proveedor: b.proveedor, pais: b.pais, opciones: b.opciones,
      ors: { base_ruta: b.ors?.base_ruta, base_geo: b.ors?.base_geo },
      google: { clave_navegador: String(b.google?.clave_navegador || '').trim().slice(0, 200) },
    });
    const claveOrs = String(b.ors?.clave || '').trim();
    const claveGoogle = String(b.google?.clave_servidor || '').trim();
    if (claveOrs.length > 2000 || claveGoogle.length > 200) throw new ErrorMapa('La clave es demasiado larga.', 400);
    const guardar = {
      ...nueva,
      ors: { ...nueva.ors, clave: claveOrs ? ctx.cifrar(claveOrs) : b.ors?.borrar_clave ? '' : ant.ors?.clave || '' },
      google: { ...nueva.google, clave_servidor: claveGoogle ? ctx.cifrar(claveGoogle) : b.google?.borrar_clave ? '' : ant.google?.clave_servidor || '' },
      auto: b.auto !== false,
    };
    ctx.setAjuste(AJUSTE, guardar);
    L(req, 'RUTAS_CONFIG', `Proveedor de mapas: ${nueva.proveedor === 'google' ? 'Google Maps' : 'OpenRouteService'}${claveOrs || claveGoogle ? ' (clave cambiada)' : ''}`, 'aviso');
    res.json({ ok: 1 });
  }));

  router.post('/probar', adm, envolver(async (_req, res) => res.json(await rutas().probar())));

  // ---------------- Búsqueda y cálculo ----------------
  router.get('/geocodificar', envolver(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json({ resultados: [] });
    res.json({ resultados: await rutas().geocodificar(q) });
  }));

  // Sugerencias mientras se escribe una dirección (autocompletar)
  router.get('/sugerir', envolver(async (req, res) => {
    const q = String(req.query.q || '').trim();
    res.json({ resultados: q.length < 3 ? [] : await rutas().sugerir(q) });
  }));

  // Coordenadas de las ubicaciones frecuentes
  const coordsUbicaciones = () => db.prepare(`SELECT u.id, u.nombre, u.direccion, u.cp, u.ciudad, u.provincia, u.empresa, r.lat, r.lon, r.etiqueta, r.fuente
    FROM ubicaciones u LEFT JOIN plugin_rutas_ubicaciones r ON r.ubicacion_id = u.id`).all();
  router.get('/ubicaciones', (_req, res) => res.json(coordsUbicaciones().filter((u) => u.lat != null).map((u) => ({ id: u.id, lat: u.lat, lon: u.lon, etiqueta: u.etiqueta, fuente: u.fuente }))));

  /** Punto de un texto sin llamar a ningún servicio: coordenadas escritas o ubicación frecuente con posición. */
  function resolverLocal(texto, ubis = coordsUbicaciones()) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const c = leerCoordenadas(t);
    if (c) return { texto: t, ...c, etiqueta: t, fuente: 'coordenadas' };
    const nombre = norm(t.split(' — ')[0]);
    const cand = ubis.filter((u) => u.lat != null && (norm(u.nombre) === nombre || norm(u.empresa) === nombre));
    const exacta = cand.find((u) => norm(`${u.nombre} — ${[u.direccion, [u.cp, u.ciudad].filter(Boolean).join(' '), u.provincia].filter(Boolean).join(', ')}`) === norm(t)) || cand[0];
    return exacta ? { texto: t, lat: exacta.lat, lon: exacta.lon, etiqueta: exacta.nombre, fuente: 'ubicacion', ubicacion_id: exacta.id } : null;
  }
  /** Convierte el texto de un campo de carga/descarga en un punto: coordenadas, ubicación frecuente o búsqueda. */
  async function resolver(texto, ubis = coordsUbicaciones()) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const local = resolverLocal(t, ubis);
    if (local) return local;
    const r = (await rutas().geocodificar(t.replace(' — ', ', '), { max: 1 }))[0];
    return r ? { texto: t, lat: r.lat, lon: r.lon, etiqueta: r.etiqueta, fuente: r.fuente } : { texto: t, error: 'No se ha encontrado' };
  }

  async function calcular(textos, opciones = {}) {
    const ubis = coordsUbicaciones();
    const puntos = [];
    for (const t of textos.filter((x) => String(x || '').trim()).slice(0, 25)) puntos.push(await resolver(t, ubis));
    const sin = puntos.filter((p) => !p || p.error);
    if (sin.length) {
      const e = new ErrorMapa(`No se ha encontrado: ${sin.map((p) => `«${p.texto}»`).join(', ')}. Elige una ubicación frecuente con posición en el mapa, escribe una dirección más completa o pon coordenadas (p. ej. 40.4168, -3.7038).`, 422);
      e.puntos = puntos; throw e;
    }
    const r = await rutas().ruta(puntos, opciones);
    return { ...r, puntos };
  }

  router.post('/ruta', async (req, res) => {
    const b = req.body || {};
    const textos = Array.isArray(b.textos) ? b.textos.map((x) => String(x || '').slice(0, 300)) : [];
    try { res.json(await calcular(textos, b.opciones || {})); }
    catch (e) {
      const st = e.status || 500;
      if (st === 500) console.error('[rutas]', e);
      res.status(st).json({ error: st === 500 ? 'Error interno' : e.message, puntos: e.puntos });
    }
  });

  // ---------------- Envíos ----------------
  const pendientes = new Map(); // ref -> línea del mapa calculada en el navegador (no se guarda en los datos del envío)
  const textosDe = (datos) => [datos.origen, ...(Array.isArray(datos.destinos) && datos.destinos.length ? datos.destinos : [datos.destino])].filter(Boolean);
  const numero = (v, max) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 10) / 10 : null; };

  // El formulario de envío manda la ruta elegida en el campo oculto «_ruta» (JSON). Se valida y se aparta la línea.
  ctx.extender('doc.datos', (datos) => {
    if (datos._ruta === undefined) return datos;
    let r = datos._ruta;
    delete datos._ruta;
    try { if (typeof r === 'string') r = JSON.parse(r); } catch { return datos; }
    if (!r || typeof r !== 'object') return datos;
    const km = numero(r.km, 20000), kmc = numero(r.km_calculado, 20000);
    if (km == null) return datos;
    const ref = crypto.randomBytes(8).toString('hex');
    if (Array.isArray(r.linea)) {
      pendientes.set(ref, r.linea.slice(0, 500).filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)));
      setTimeout(() => pendientes.delete(ref), 60_000).unref();
    }
    datos._ruta = {
      ref, km, km_calculado: kmc, minutos: Number.isInteger(r.minutos) ? r.minutos : null, manual: kmc == null || km !== kmc,
      proveedor: r.proveedor === 'google' ? 'google' : 'ors', opciones: configLimpia({ opciones: r.opciones || {} }).opciones,
      puntos: Array.isArray(r.puntos) ? r.puntos.slice(0, 25).map((p) => ({ lat: Number(p.lat), lon: Number(p.lon), etiqueta: String(p.etiqueta || '').slice(0, 200) })) : [],
    };
    return datos;
  });

  function guardarRuta(docId, r, { manual = false, error = null } = {}) {
    db.prepare(`INSERT INTO plugin_rutas_envios(doc_id, km, km_calculado, minutos, manual, revisar, opciones, puntos, linea, proveedor, calculado, error)
      VALUES (?,?,?,?,?,0,?,?,?,?,?,?) ON CONFLICT(doc_id) DO UPDATE SET km=excluded.km, km_calculado=excluded.km_calculado, minutos=excluded.minutos,
      manual=excluded.manual, revisar=0, opciones=excluded.opciones, puntos=excluded.puntos, linea=excluded.linea, proveedor=excluded.proveedor,
      calculado=excluded.calculado, error=excluded.error`)
      .run(docId, r?.km ?? null, r && 'km_calculado' in r ? r.km_calculado : r?.km ?? null, r?.minutos ?? null, manual ? 1 : 0, JSON.stringify(r?.opciones || {}),
        JSON.stringify(r?.puntos || []), JSON.stringify(r?.linea || []), r?.proveedor || null, new Date().toISOString(), error);
  }

  async function calcularYGuardar(doc, datos) {
    try {
      const r = await calcular(textosDe(datos));
      guardarRuta(doc.id, { ...r, km_calculado: r.km });
    } catch (e) {
      db.prepare(`INSERT INTO plugin_rutas_envios(doc_id, error, calculado) VALUES (?,?,?)
        ON CONFLICT(doc_id) DO UPDATE SET error=excluded.error, calculado=excluded.calculado`).run(doc.id, e.message, new Date().toISOString());
    }
  }

  ctx.hooks.on('doc.guardado', async ({ doc, datos, nuevo, cambios }) => {
    if (nuevo) {
      if (datos._ruta?.km != null) {
        const r = datos._ruta;
        guardarRuta(doc.id, { ...r, linea: pendientes.get(r.ref) || [] }, { manual: r.manual });
        pendientes.delete(r.ref);
      } else if (auto() && configPublica(config()).configurado) await calcularYGuardar(doc, datos);
      return;
    }
    // Modificación: si cambian los lugares, la ruta se recalcula (o se marca para revisar si los km se pusieron a mano)
    if (!cambios?.some((c) => c.k === 'origen' || c.k === 'destinos')) return;
    const ant = db.prepare('SELECT manual FROM plugin_rutas_envios WHERE doc_id=?').get(doc.id);
    if (ant?.manual) db.prepare('UPDATE plugin_rutas_envios SET revisar=1 WHERE doc_id=?').run(doc.id);
    else if (configPublica(config()).configurado) await calcularYGuardar(doc, datos);
  });

  const rutaDe = (docId) => {
    const r = db.prepare('SELECT * FROM plugin_rutas_envios WHERE doc_id=?').get(docId);
    if (!r) return null;
    const j = (s, d) => { try { return JSON.parse(s || ''); } catch { return d; } };
    return { km: r.km, km_calculado: r.km_calculado, minutos: r.minutos, manual: !!r.manual, revisar: !!r.revisar, opciones: j(r.opciones, {}), puntos: j(r.puntos, []), linea: j(r.linea, []), proveedor: r.proveedor, calculado: r.calculado, error: r.error };
  };

  // Para la API de integración (Facturador): km y coordenadas de los puntos (así Facturador puede calcular la vuelta
  // o los km desde su base aunque los nombres de las ubicaciones solo existan en Gestor DeCA)
  ctx.extender('integracion.envio', ({ envio, datos }) => {
    const r = rutaDe(envio.id);
    const textos = textosDe(datos);
    let puntos = r?.puntos?.length === textos.length && r.puntos.every((p) => Number.isFinite(p.lat)) ? r.puntos.map((p) => ({ lat: p.lat, lon: p.lon })) : null;
    if (!puntos) { const ubis = coordsUbicaciones(); const l = textos.map((t) => resolverLocal(t, ubis)); puntos = l.map((p) => (p ? { lat: p.lat, lon: p.lon } : null)); }
    if (!puntos.some(Boolean)) puntos = null;
    if (!r || r.km == null) return { ruta: null, puntos };
    const o = r.opciones || {};
    return { puntos, ruta: { km: r.km, km_calculado: r.km_calculado, minutos: r.minutos, manual: r.manual, revisar: r.revisar, proveedor: r.proveedor, perfil: o.perfil, evitar_peajes: !!o.evitar_peajes, evitar_autopistas: !!o.evitar_autopistas, evitar_ferris: !!o.evitar_ferris, calculado: r.calculado } };
  });

  const docVisible = (req) => {
    const d = db.prepare('SELECT id, tipo, datos, asignado, creador_id FROM docs WHERE id=?').get(Number(req.params.id));
    if (!d) throw Object.assign(new Error('Documento no encontrado'), { status: 404 });
    const u = req.u, propio = Number(d.asignado) === Number(u.id) || Number(d.creador_id) === Number(u.id);
    if (!(can(u, `${d.tipo}_ver`) || can(u, `${d.tipo}_crear`) || propio)) throw Object.assign(new Error('No tienes permiso'), { status: 403 });
    return d;
  };
  router.get('/envios/:id', envolver(async (req, res) => { docVisible(req); res.json({ ruta: rutaDe(Number(req.params.id)) }); }));

  // Corregir los km a mano (p. ej. un desvío o una obra)
  router.put('/envios/:id/km', envolver(async (req, res) => {
    const d = docVisible(req);
    if (!can(req.u, `${d.tipo}_crear`)) throw Object.assign(new Error('No tienes permiso para modificar este envío'), { status: 403 });
    const km = numero(req.body?.km, 20000);
    if (km == null) throw Object.assign(new Error('Indica los km (número positivo).'), { status: 400 });
    const ant = rutaDe(d.id);
    if (ant) db.prepare('UPDATE plugin_rutas_envios SET km=?, manual=?, revisar=0 WHERE doc_id=?').run(km, ant.km_calculado == null || km !== ant.km_calculado ? 1 : 0, d.id);
    else guardarRuta(d.id, { km, km_calculado: null }, { manual: true });
    L(req, 'RUTAS_KM', `Envío ${d.id}: ${ant?.km ?? '—'} → ${km} km`);
    res.json({ ruta: rutaDe(d.id) });
  }));

  router.post('/envios/:id/recalcular', envolver(async (req, res) => {
    const d = docVisible(req);
    if (!can(req.u, `${d.tipo}_crear`)) throw Object.assign(new Error('No tienes permiso para modificar este envío'), { status: 403 });
    const datos = JSON.parse(d.datos || '{}');
    const r = await calcular(textosDe({ ...datos, destinos: datos.destinos || [datos.destino] }), req.body?.opciones || {});
    guardarRuta(d.id, { ...r, km_calculado: r.km });
    L(req, 'RUTAS_RECALCULADA', `Envío ${d.id}: ${r.km} km`);
    res.json({ ruta: rutaDe(d.id) });
  }));

  // ---------------- Ubicaciones ----------------
  ctx.hooks.on('ubicacion.guardada', async ({ id, body }) => {
    const lat = Number(body?.rutas_lat), lon = Number(body?.rutas_lon);
    const ok = String(body?.rutas_lat ?? '') !== '' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const up = db.prepare(`INSERT INTO plugin_rutas_ubicaciones(ubicacion_id, lat, lon, etiqueta, fuente, actualizado) VALUES (?,?,?,?,?,?)
      ON CONFLICT(ubicacion_id) DO UPDATE SET lat=excluded.lat, lon=excluded.lon, etiqueta=excluded.etiqueta, fuente=excluded.fuente, actualizado=excluded.actualizado`);
    if (ok) return up.run(id, lat, lon, String(body.rutas_etiqueta || '').slice(0, 300), String(body.rutas_fuente || 'manual').slice(0, 30), new Date().toISOString());
    if (body?.rutas_quitar === '1') return db.prepare('DELETE FROM plugin_rutas_ubicaciones WHERE ubicacion_id=?').run(id);
    // Sin posición elegida: se busca la dirección automáticamente (si aún no tenía)
    if (db.prepare('SELECT 1 FROM plugin_rutas_ubicaciones WHERE ubicacion_id=?').get(id)) return;
    const dir = [body?.direccion, [body?.cp, body?.ciudad].filter(Boolean).join(' '), body?.provincia].filter(Boolean).join(', ');
    if (!dir) return;
    try {
      const r = (await rutas().geocodificar(dir, { max: 1 }))[0];
      if (r) up.run(id, r.lat, r.lon, r.etiqueta, `${r.fuente} (automática)`, new Date().toISOString());
    } catch (e) { console.error('[rutas] No se pudo localizar la ubicación', id, e.message); }
  });
  ctx.hooks.on('ubicacion.borrada', ({ id }) => db.prepare('DELETE FROM plugin_rutas_ubicaciones WHERE ubicacion_id=?').run(id));
}
