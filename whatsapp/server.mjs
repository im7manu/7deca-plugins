// Plugin «WhatsApp Web» para 7DeCA: envía el PDF oficial del documento al WhatsApp del conductor desde
// el número de la empresa vinculado como WhatsApp Web. Su sesión es propia (carpeta del plugin) y no usa ni toca el
// puente de WhatsApp de recuperación de contraseñas (WHATSAPP_API).
import { crearWhatsApp, normalizarTelefono, rellenar } from './lib/whatsapp.mjs';

const AJUSTE = 'whatsapp';
const PLANTILLA = 'Hola {nombre_conductor}, te enviamos el documento de control del transporte {referencia} ({origen} → {destino}, {fecha}). Lleva este documento durante el servicio.\n{empresa}';

export function register(ctx) {
  const { router, db, adm, docs, logAudit } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS plugin_whatsapp_envios(
    id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL, referencia TEXT, telefono TEXT NOT NULL, destinatario TEXT DEFAULT '',
    texto TEXT, archivo TEXT, usuario TEXT, fecha TEXT NOT NULL, estado TEXT NOT NULL, error TEXT, mensaje_id TEXT
  ); CREATE INDEX IF NOT EXISTS idx_wa_doc ON plugin_whatsapp_envios(doc_id)`);

  const wa = crearWhatsApp({ carpeta: ctx.dataDir, nombreDispositivo: '7DeCA' });
  wa.arrancar();
  ctx.alParar(() => wa.parar());

  const config = () => ({ plantilla: PLANTILLA, ...(ctx.getAjuste(AJUSTE, {}) || {}) });
  const L = (req, accion, detalle, sev = 'info') => logAudit(req.u.usuario, req.ip, accion, detalle, sev);
  const envolver = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { const st = e.status || 500; if (st === 500) console.error('[whatsapp]', e); res.status(st).json({ error: st === 500 ? 'Error interno' : e.message }); }
  };
  const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

  // ---- Conexión (administradores) ----
  router.get('/estado', envolver(async (req, res) => {
    const s = wa.estado();
    const out = { estado: s.estado, numero: s.numero, nombre: s.nombre, error: s.error, desde: s.desde };
    if (req.u.rol === 'admin' && s.qr) out.qr = await ctx.lib.QR.toString(s.qr, { type: 'svg', margin: 1, width: 260 });
    res.json(out);
  }));
  router.post('/vincular', adm, envolver(async (req, res) => { await wa.conectar(); L(req, 'WHATSAPP_VINCULAR', 'Inicio de vinculación de WhatsApp Web para documentos', 'aviso'); res.json({ ok: 1 }); }));
  router.post('/desconectar', adm, envolver(async (req, res) => { await wa.desconectar(); L(req, 'WHATSAPP_DESCONECTAR', 'WhatsApp Web de documentos desconectado', 'aviso'); res.json({ ok: 1 }); }));
  router.get('/config', (_req, res) => res.json({ ...config(), plantilla_defecto: PLANTILLA }));
  router.put('/config', adm, envolver(async (req, res) => {
    const plantilla = String(req.body?.plantilla || '').trim().slice(0, 2000) || PLANTILLA;
    ctx.setAjuste(AJUSTE, { plantilla });
    L(req, 'WHATSAPP_CONFIG', 'Plantilla de mensaje cambiada');
    res.json({ ok: 1 });
  }));

  // ---- Envío de un documento ----
  function preparar(req) {
    const id = Number(req.params.id);
    const d = docs.obtener(id);
    if (!d || !docs.ve(req.u, id)) throw err('Documento no encontrado', 404);
    const x = d.datos;
    const conductor = x.conductor_dni ? db.prepare('SELECT nombre, telefono FROM conductores WHERE upper(dni)=upper(?)').get(x.conductor_dni) : null;
    const emp = ctx.ajustes();
    const vars = {
      nombre_conductor: x.conductor_nombre || conductor?.nombre || '', referencia: d.num, fecha: x.f_carga ? new Date(`${x.f_carga}T00:00:00`).toLocaleDateString('es-ES') : '',
      origen: x.origen || '', destino: (x.destinos || []).join(' / '), matricula: x.matricula || '', empresa: emp.nombre || '', tipo: d.tipo === 'ecmr' ? 'eCMR' : 'DeCA',
    };
    return { d, conductor, vars, archivo: `${d.num}.pdf` };
  }
  const extras = () => ctx.extensionesDe('documentos.extra').map(({ fn }) => fn).filter((x) => x?.id && x.generar);
  const motivoNoEnviable = (d) => (d.estado === 'borrador' ? 'Emite el documento antes de enviarlo: los borradores no se distribuyen.' : d.estado === 'anulado' ? 'El documento está anulado y no se puede enviar.' : null);

  router.get('/envios/:id', envolver(async (req, res) => {
    const { d, conductor, vars, archivo } = preparar(req);
    res.json({
      referencia: d.num, archivo, estado_doc: d.estado, no_enviable: motivoNoEnviable(d),
      destinatario: { nombre: vars.nombre_conductor, telefono: conductor?.telefono || '' },
      texto: rellenar(config().plantilla, vars), url_pdf: d.url, conexion: wa.estado().estado, extras: extras().map((x) => ({ id: x.id, nombre: x.nombre })),
      historial: db.prepare('SELECT id, telefono, destinatario, archivo, usuario, fecha, estado, error FROM plugin_whatsapp_envios WHERE doc_id=? ORDER BY id DESC LIMIT 20').all(d.id),
    });
  }));

  router.post('/envios/:id', envolver(async (req, res) => {
    const { d, vars, archivo } = preparar(req);
    const motivo = motivoNoEnviable(d);
    if (motivo) throw err(motivo, 409);
    const telefono = normalizarTelefono(req.body?.telefono);
    if (!telefono) throw err('Indica un teléfono válido (con prefijo si no es español).');
    const texto = String(req.body?.texto ?? '').slice(0, 3000);
    const ruta = await docs.pdf(d.id);
    if (!ruta) throw err('No se encuentra el PDF del documento.', 404);
    const { readFileSync } = await import('node:fs');
    const buffer = readFileSync(ruta);
    const ins = db.prepare('INSERT INTO plugin_whatsapp_envios(doc_id, referencia, telefono, destinatario, texto, archivo, usuario, fecha, estado) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(d.id, d.num, telefono, String(req.body?.destinatario || vars.nombre_conductor || '').slice(0, 120), texto, archivo, req.u.usuario, new Date().toISOString(), 'pendiente');
    const reg = Number(ins.lastInsertRowid);
    try {
      const r = await wa.enviarDocumento(telefono, { buffer, nombre: archivo, texto }, (estado) => db.prepare('UPDATE plugin_whatsapp_envios SET estado=? WHERE id=?').run(estado, reg));
      db.prepare('UPDATE plugin_whatsapp_envios SET estado=?, mensaje_id=? WHERE id=?').run('enviado', r.id, reg);
      // Documentos adicionales de otros plugins (p. ej. la hoja de servicio), cada uno como un archivo aparte
      for (const x of extras().filter((x) => (req.body?.extras || []).includes(x.id))) {
        const a = await x.generar(d.id);
        if (a?.buffer) await wa.enviarDocumento(telefono, { buffer: a.buffer, nombre: a.nombre, texto: '', mimetype: a.tipo || 'application/pdf' });
      }
      L(req, 'WHATSAPP_ENVIO', `${d.num} → +${telefono}`);
      res.json({ ok: 1, estado: 'enviado' });
    } catch (e) {
      db.prepare('UPDATE plugin_whatsapp_envios SET estado=?, error=? WHERE id=?').run(wa.estado().estado === 'conectado' ? 'error' : 'sesion_desconectada', String(e.message).slice(0, 300), reg);
      L(req, 'WHATSAPP_ENVIO_ERROR', `${d.num} → +${telefono}: ${e.message}`, 'aviso');
      throw err(e.message, e.status || 502);
    }
  }));
}
