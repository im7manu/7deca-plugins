// Plugin «Plantillas de transportes»: datos habituales de un transporte para reutilizarlos al crear otro.
// Una plantilla nunca es un documento: no tiene número, token/QR, estado, historial ni fechas. Tampoco guarda datos propios de
// cada viaje (peso, bultos, fecha, albarán, reservas). El vehículo y el conductor se guardan aparte como «preferidos» y
// solo se aplican si el usuario lo confirma al usarla.
export const CAMPOS = ['mi_papel', 'contraparte_id', 'contraparte_nombre', 'contraparte_nif', 'contraparte_direccion', 'destinatario', 'origen', 'destinos', 'mercancia', 'instrucciones', 'obs', 'obs_transportista', 'autorizacion'];
export const PREFERIDOS = ['matricula', 'remolque', 'conductor_nombre', 'conductor_dni'];

export function register(ctx) {
  const { router, db, docs, logAudit, can } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS plugin_plantillas(
    id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL, datos TEXT NOT NULL, preferidos TEXT NOT NULL DEFAULT '{}',
    creado TEXT NOT NULL, creado_por TEXT, actualizado TEXT, usos INTEGER DEFAULT 0, ultimo_uso TEXT
  )`);
  const L = (req, a, d) => logAudit(req.u.usuario, req.ip, a, d);
  const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
  const envolver = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { const st = e.status || 500; if (st === 500) console.error('[plantillas]', e); res.status(st).json({ error: st === 500 ? 'Error interno' : e.message }); } };
  const puede = (u, tipo) => can(u, `${tipo}_crear`);
  const limpiar = (src, campos) => {
    const o = {};
    for (const k of campos) {
      if (src[k] == null || src[k] === '') continue;
      o[k] = k === 'destinos' ? (Array.isArray(src.destinos) ? src.destinos : [src.destino]).map((x) => String(x || '').trim().slice(0, 300)).filter(Boolean).slice(0, 20) : String(src[k]).slice(0, 2000);
    }
    return o;
  };
  const salida = (p) => ({ ...p, datos: JSON.parse(p.datos), preferidos: JSON.parse(p.preferidos) });

  router.get('/plantillas', (req, res) => res.json(db.prepare('SELECT * FROM plugin_plantillas ORDER BY usos DESC, nombre COLLATE NOCASE').all().map(salida).filter((p) => puede(req.u, p.tipo))));
  router.post('/plantillas', envolver(async (req, res) => {
    const b = req.body || {};
    const tipo = b.tipo === 'ecmr' ? 'ecmr' : 'deca';
    if (!puede(req.u, tipo)) throw err('No tienes permiso para crear documentos de este tipo.', 403);
    const nombre = String(b.nombre || '').trim().slice(0, 100);
    if (!nombre) throw err('Pon un nombre a la plantilla.');
    const datos = limpiar(b.datos || {}, CAMPOS), pref = limpiar(b.preferidos || {}, PREFERIDOS);
    if (!Object.keys(datos).length) throw err('La plantilla no tiene datos.');
    const ahora = new Date().toISOString();
    if (b.id) {
      const r = db.prepare('UPDATE plugin_plantillas SET nombre=?, tipo=?, datos=?, preferidos=?, actualizado=? WHERE id=?').run(nombre, tipo, JSON.stringify(datos), JSON.stringify(pref), ahora, Number(b.id));
      if (!r.changes) throw err('Plantilla no encontrada', 404);
      L(req, 'PLANTILLA_EDITADA', nombre);
      return res.json({ id: Number(b.id) });
    }
    const id = Number(db.prepare('INSERT INTO plugin_plantillas(nombre, tipo, datos, preferidos, creado, creado_por) VALUES (?,?,?,?,?,?)').run(nombre, tipo, JSON.stringify(datos), JSON.stringify(pref), ahora, req.u.usuario).lastInsertRowid);
    L(req, 'PLANTILLA_CREADA', nombre);
    res.status(201).json({ id });
  }));
  // Desde un envío existente: solo los campos permitidos
  router.post('/desde-envio/:id', envolver(async (req, res) => {
    const id = Number(req.params.id);
    const d = docs.obtener(id);
    if (!d || !docs.ve(req.u, id)) throw err('Documento no encontrado', 404);
    if (!puede(req.u, d.tipo)) throw err('No tienes permiso para crear documentos de este tipo.', 403);
    const nombre = String(req.body?.nombre || '').trim().slice(0, 100);
    if (!nombre) throw err('Pon un nombre a la plantilla.');
    const datos = limpiar(d.datos, CAMPOS), pref = req.body?.preferidos ? limpiar(d.datos, PREFERIDOS) : {};
    const nid = Number(db.prepare('INSERT INTO plugin_plantillas(nombre, tipo, datos, preferidos, creado, creado_por) VALUES (?,?,?,?,?,?)').run(nombre, d.tipo, JSON.stringify(datos), JSON.stringify(pref), new Date().toISOString(), req.u.usuario).lastInsertRowid);
    L(req, 'PLANTILLA_CREADA', `${nombre} (desde ${d.num})`);
    res.status(201).json({ id: nid, campos: Object.keys(datos), preferidos: Object.keys(pref) });
  }));
  router.post('/plantillas/:id/usada', (req, res) => { db.prepare('UPDATE plugin_plantillas SET usos = usos + 1, ultimo_uso = ? WHERE id = ?').run(new Date().toISOString(), Number(req.params.id)); res.json({ ok: 1 }); });
  router.delete('/plantillas/:id', envolver(async (req, res) => {
    const p = db.prepare('SELECT * FROM plugin_plantillas WHERE id = ?').get(Number(req.params.id));
    if (!p) throw err('Plantilla no encontrada', 404);
    if (!puede(req.u, p.tipo)) throw err('No tienes permiso.', 403);
    db.prepare('DELETE FROM plugin_plantillas WHERE id = ?').run(p.id);
    L(req, 'PLANTILLA_ELIMINADA', p.nombre);
    res.json({ ok: 1 });
  }));
}
