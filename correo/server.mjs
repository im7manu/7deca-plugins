// Plugin «Envío por correo» para Gestor DeCA y eCMR: envía el PDF oficial de un documento por SMTP.
// - Credenciales cifradas con la clave de la instalación; nunca se devuelven ni aparecen en registros o errores.
// - «Aceptado por el servidor» no significa entregado ni leído: así se muestra.
import fs from 'node:fs';
import nodemailer from 'nodemailer';

const AJUSTE = 'correo';
const PLANTILLA = {
  asunto: '{tipo} {referencia} · {origen} → {destino} ({fecha})',
  cuerpo: 'Hola{nombre_destinatario}:\n\nTe enviamos el documento de control del transporte {referencia} ({origen} → {destino}, {fecha}).\n{enlace_txt}\nUn saludo,\n{empresa}',
};
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function register(ctx) {
  const { router, db, adm, docs, logAudit } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS plugin_correo_envios(
    id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL, referencia TEXT, para TEXT NOT NULL, asunto TEXT, enlace INTEGER DEFAULT 0, usuario TEXT,
    fecha TEXT NOT NULL, estado TEXT NOT NULL, respuesta TEXT, error TEXT
  ); CREATE INDEX IF NOT EXISTS idx_correo_doc ON plugin_correo_envios(doc_id)`);

  const leer = () => ctx.getAjuste(AJUSTE, {}) || {};
  const smtp = () => { const c = leer(); let pass = ''; try { pass = c.password ? ctx.descifrar(c.password) : ''; } catch { /* clave cambiada */ } return { ...c, password: pass }; };
  const configurado = () => { const c = leer(); return !!(c.host && c.desde); };
  const plantilla = () => ({ ...PLANTILLA, ...(leer().plantilla || {}) });
  const L = (req, a, d, s = 'info') => logAudit(req.u.usuario, req.ip, a, d, s);
  const envolver = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { const st = e.status || 500; if (st === 500) console.error('[correo]', e.message); res.status(st).json({ error: st === 500 ? 'Error interno' : e.message }); }
  };
  const err = (m, s = 400) => Object.assign(new Error(m), { status: s });

  /** Mensaje de error comprensible y sin datos sensibles. */
  function explicar(e) {
    const c = e.code || '', r = e.responseCode;
    if (c === 'EAUTH' || r === 535 || r === 534) return 'El servidor de correo ha rechazado el usuario o la contraseña. Revisa las credenciales (algunos proveedores piden una «contraseña de aplicación»).';
    if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'].includes(c)) return 'No se pudo conectar con el servidor de correo. Revisa el servidor, el puerto y el tipo de conexión segura.';
    if (r >= 500 && r < 600) return `El servidor de correo ha rechazado el mensaje (${r}). Revisa las direcciones de destino o del remitente.`;
    if (r >= 400) return `El servidor de correo no ha podido enviarlo ahora (${r}). Inténtalo más tarde.`;
    return 'No se pudo enviar el correo.';
  }
  function transporte(c = smtp()) {
    return nodemailer.createTransport({ host: c.host, port: Number(c.puerto) || 587, secure: c.seguridad === 'ssl', requireTLS: c.seguridad === 'starttls',
      auth: c.usuario ? { user: c.usuario, pass: c.password } : undefined, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
  }
  const remitente = (c) => (c.nombre ? `"${String(c.nombre).replace(/"/g, '')}" <${c.desde}>` : c.desde);

  // ---- Configuración ----
  router.get('/config', adm, (_req, res) => {
    const c = leer();
    res.json({ host: c.host || '', puerto: c.puerto || 587, seguridad: c.seguridad || 'starttls', usuario: c.usuario || '', tiene_password: !!c.password, nombre: c.nombre || '', desde: c.desde || '', responder: c.responder || '', plantilla: plantilla(), plantilla_defecto: PLANTILLA });
  });
  router.get('/estado', (_req, res) => res.json({ configurado: configurado() }));
  router.put('/config', adm, envolver(async (req, res) => {
    const b = req.body || {}, ant = leer();
    const host = String(b.host || '').trim().slice(0, 200), desde = String(b.desde || '').trim();
    if (!host) throw err('Indica el servidor SMTP.');
    if (!EMAIL.test(desde)) throw err('La dirección del remitente no es válida.');
    if (b.responder && !EMAIL.test(String(b.responder).trim())) throw err('La dirección de respuesta no es válida.');
    const puerto = Number(b.puerto) || 587;
    if (puerto < 1 || puerto > 65535) throw err('Puerto no válido.');
    ctx.setAjuste(AJUSTE, {
      host, puerto, seguridad: ['ssl', 'starttls', 'ninguna'].includes(b.seguridad) ? b.seguridad : 'starttls', usuario: String(b.usuario || '').trim().slice(0, 200),
      password: b.password ? ctx.cifrar(String(b.password)) : b.borrar_password ? '' : ant.password || '', nombre: String(b.nombre || '').trim().slice(0, 100), desde, responder: String(b.responder || '').trim(),
      plantilla: { asunto: String(b.plantilla?.asunto || PLANTILLA.asunto).slice(0, 250), cuerpo: String(b.plantilla?.cuerpo || PLANTILLA.cuerpo).slice(0, 5000) },
    });
    L(req, 'CORREO_CONFIG', `Servidor SMTP ${host}:${puerto}${b.password ? ' (contraseña cambiada)' : ''}`, 'aviso');
    res.json({ ok: 1 });
  }));
  router.post('/prueba', adm, envolver(async (req, res) => {
    const c = smtp();
    if (!configurado()) throw err('Guarda primero la configuración.');
    const para = String(req.body?.para || '').trim();
    if (!EMAIL.test(para)) throw err('Indica a qué correo enviar la prueba.');
    try {
      const info = await transporte(c).sendMail({ from: remitente(c), to: para, replyTo: c.responder || undefined, subject: 'Prueba de correo de Gestor DeCA', text: 'Si recibes este mensaje, el envío de documentos por correo está bien configurado.' });
      L(req, 'CORREO_PRUEBA', `Prueba aceptada por el servidor para ${para}`);
      res.json({ ok: 1, respuesta: String(info.response || '').slice(0, 200) });
    } catch (e) { L(req, 'CORREO_PRUEBA_ERROR', explicar(e), 'aviso'); throw err(explicar(e), 502); }
  }));

  // ---- Envío de un documento ----
  function preparar(req) {
    const id = Number(req.params.id);
    const d = docs.obtener(id);
    if (!d || !docs.ve(req.u, id)) throw err('Documento no encontrado', 404);
    const x = d.datos, emp = ctx.ajustes();
    const conductor = x.conductor_dni ? db.prepare('SELECT nombre, email FROM conductores WHERE upper(dni)=upper(?)').get(x.conductor_dni) : null;
    const contraparte = x.contraparte_nif ? db.prepare('SELECT nombre, email FROM empresas WHERE upper(nif)=upper(?)').get(x.contraparte_nif) : null;
    const sugeridos = [
      conductor?.email && { tipo: 'Conductor', nombre: conductor.nombre, email: conductor.email },
      contraparte?.email && { tipo: x.mi_papel === 'cargador' ? 'Transportista' : 'Cliente', nombre: contraparte.nombre, email: contraparte.email },
    ].filter(Boolean);
    const vars = { referencia: d.num, tipo: d.tipo === 'ecmr' ? 'eCMR' : 'DeCA', fecha: x.f_carga ? new Date(`${x.f_carga}T12:00:00`).toLocaleDateString('es-ES') : '', origen: x.origen || '', destino: (x.destinos || []).join(' / '),
      nombre_conductor: x.conductor_nombre || '', matricula: x.matricula || '', cliente: x.contraparte_nombre || '', empresa: emp.nombre || '', enlace: d.url };
    return { d, sugeridos, vars };
  }
  const rellenar = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '').replace(/\n{3,}/g, '\n\n').trim();
  const extras = () => ctx.extensionesDe('documentos.extra').map(({ id, fn }) => ({ plugin: id, ...fn })).filter((x) => x.id && x.generar);

  router.get('/envios/:id', envolver(async (req, res) => {
    const { d, sugeridos, vars } = preparar(req);
    const p = plantilla();
    res.json({
      referencia: d.num, estado_doc: d.estado, configurado: configurado(), archivo: `${d.num}.pdf`, url_pdf: d.url, sugeridos,
      asunto: rellenar(p.asunto, vars), cuerpo: rellenar(p.cuerpo, { ...vars, nombre_destinatario: '', enlace_txt: '' }), cuerpo_plantilla: p.cuerpo, vars,
      extras: extras().map((x) => ({ id: x.id, nombre: x.nombre })),
      historial: db.prepare('SELECT id, para, asunto, enlace, usuario, fecha, estado, error FROM plugin_correo_envios WHERE doc_id=? ORDER BY id DESC LIMIT 20').all(d.id),
    });
  }));

  router.post('/envios/:id', envolver(async (req, res) => {
    const { d, vars } = preparar(req);
    if (d.estado === 'borrador') throw err('Emite el documento antes de enviarlo: los borradores no se distribuyen.', 409);
    if (d.estado === 'anulado') throw err('El documento está anulado y no se puede enviar.', 409);
    if (!configurado()) throw err('El correo no está configurado. Un administrador debe hacerlo en «Correo».', 409);
    const para = [...new Set(String(req.body?.para || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
    if (!para.length || para.length > 20 || !para.every((x) => EMAIL.test(x))) throw err('Revisa las direcciones de destino (separadas por comas, máximo 20).');
    const asunto = String(req.body?.asunto || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 250);
    if (!asunto) throw err('El asunto no puede estar vacío.');
    const enlace = !!req.body?.enlace;
    let texto = String(req.body?.cuerpo || '').slice(0, 20000);
    if (enlace && !texto.includes(d.url)) texto += `\n\nConsulta del documento: ${d.url}`;
    const ruta = await docs.pdf(d.id);
    if (!ruta) throw err('No se encuentra el PDF del documento.', 404);
    const adjuntos = [{ filename: `${d.num}.pdf`, content: fs.readFileSync(ruta), contentType: 'application/pdf' }];
    for (const x of extras().filter((x) => (req.body?.extras || []).includes(x.id))) {
      const a = await x.generar(d.id);
      if (a?.buffer) adjuntos.push({ filename: a.nombre, content: a.buffer, contentType: a.tipo || 'application/pdf' });
    }
    const c = smtp();
    const ins = db.prepare('INSERT INTO plugin_correo_envios(doc_id, referencia, para, asunto, enlace, usuario, fecha, estado, respuesta, error) VALUES (?,?,?,?,?,?,?,?,?,?)');
    try {
      const info = await transporte(c).sendMail({ from: remitente(c), to: para.join(', '), replyTo: c.responder || undefined, subject: asunto, text: texto, attachments: adjuntos });
      const rechazados = (info.rejected || []).map(String);
      const estado = rechazados.length ? (rechazados.length === para.length ? 'rechazado' : 'aceptado_parcial') : 'aceptado';
      ins.run(d.id, d.num, para.join(', '), asunto, enlace ? 1 : 0, req.u.usuario, new Date().toISOString(), estado, String(info.response || '').slice(0, 200), rechazados.length ? `Rechazados por el servidor: ${rechazados.join(', ')}` : null);
      L(req, 'CORREO_ENVIO', `${d.num} → ${para.join(', ')} (${estado})`);
      if (estado === 'rechazado') throw err('El servidor ha rechazado todas las direcciones.', 502);
      res.json({ ok: 1, estado, rechazados });
    } catch (e) {
      if (e.status) throw e;
      const msg = explicar(e);
      ins.run(d.id, d.num, para.join(', '), asunto, enlace ? 1 : 0, req.u.usuario, new Date().toISOString(), 'error', null, msg);
      L(req, 'CORREO_ENVIO_ERROR', `${d.num}: ${msg}`, 'aviso');
      throw err(msg, 502);
    }
  }));
}
