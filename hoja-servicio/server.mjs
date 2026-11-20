// Plugin «Hoja de servicio»: PDF operativo para el conductor a partir de los datos del transporte.
// Es una hoja interna: no altera el PDF oficial, no se presenta como documento de control y no inventa datos
// (lo que no existe se omite o se indica como «no indicado»).
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function register(ctx) {
  const { router, db, docs } = ctx;
  const existeTabla = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

  function ubicacion(texto) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const nombre = norm(t.split(' — ')[0]);
    const u = db.prepare('SELECT * FROM ubicaciones').all().find((x) => norm(x.nombre) === nombre || norm(x.empresa) === nombre);
    if (!u) return { titulo: t, direccion: '' };
    return { titulo: u.nombre, direccion: [u.direccion, [u.cp, u.ciudad].filter(Boolean).join(' '), u.provincia].filter(Boolean).join(', '), empresa: u.empresa || '', tipo: u.tipo };
  }

  async function generar(id) {
    const d = docs.obtener(id);
    if (!d) return null;
    const x = d.datos, emp = ctx.ajustes();
    const conductor = x.conductor_dni ? db.prepare('SELECT nombre, telefono FROM conductores WHERE upper(dni)=upper(?)').get(x.conductor_dni) : null;
    const vehiculo = x.matricula ? db.prepare('SELECT tipo, modelo FROM vehiculos WHERE upper(matricula)=upper(?)').get(x.matricula) : null;
    const contraparte = x.contraparte_nif ? db.prepare('SELECT nombre, tel, email FROM empresas WHERE upper(nif)=upper(?)').get(x.contraparte_nif) : null;
    const ruta = existeTabla('plugin_rutas_envios') ? db.prepare('SELECT km, minutos FROM plugin_rutas_envios WHERE doc_id=?').get(d.id) : null;

    const { PDFDocument, QR } = ctx.lib;
    const pdf = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Hoja de servicio ${d.num}`, Author: emp.nombre || '' } });
    const M = 36, W = pdf.page.width, ancho = W - 2 * M, GRIS = '#555';
    // Banda de aviso
    pdf.rect(0, 0, W, 30).fill('#FFF4CE');
    pdf.fillColor('#7A4D00').font('Helvetica-Bold').fontSize(10).text('HOJA OPERATIVA INTERNA · No sustituye al DeCA ni a la carta de porte (CMR/eCMR)', M, 10, { width: ancho, align: 'center' });
    let y = 46;
    pdf.fillColor('#000').font('Helvetica-Bold').fontSize(22).text('Hoja de servicio', M, y);
    pdf.font('Helvetica').fontSize(12).fillColor(GRIS).text(`${d.tipo === 'ecmr' ? 'eCMR' : 'DeCA'} ${d.num} · ${emp.nombre || ''}`, M, pdf.y + 2);
    // QR del documento oficial
    try {
      const png = await QR.toBuffer(d.url, { margin: 1, width: 220 });
      pdf.image(png, W - M - 96, 42, { width: 96 });
      pdf.fontSize(7).fillColor(GRIS).text('Documento oficial', W - M - 96, 140, { width: 96, align: 'center' });
    } catch { /* sin QR */ }
    y = Math.max(pdf.y + 14, 158);

    const seccion = (titulo) => { if (y > pdf.page.height - 120) { pdf.addPage(); y = M; } pdf.font('Helvetica-Bold').fontSize(13).fillColor('#1F4E8C').text(titulo.toUpperCase(), M, y); y = pdf.y + 2; pdf.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor('#1F4E8C').stroke(); y += 6; };
    const dato = (etiqueta, valor, grande = false) => {
      if (valor == null || valor === '') return;
      if (y > pdf.page.height - 70) { pdf.addPage(); y = M; }
      pdf.font('Helvetica').fontSize(9).fillColor(GRIS).text(etiqueta, M, y, { width: 110 });
      pdf.font(grande ? 'Helvetica-Bold' : 'Helvetica').fontSize(grande ? 14 : 12).fillColor('#000').text(String(valor), M + 115, y - (grande ? 2 : 1), { width: ancho - 115 });
      y = Math.max(pdf.y, y + 14) + 5;
    };
    const lugar = (u, n) => { if (!u) return; dato(n, u.titulo, true); dato('Dirección', u.direccion || 'No indicada en Ubicaciones frecuentes'); if (u.empresa && u.empresa !== u.titulo) dato('Empresa', u.empresa); };

    seccion('Servicio');
    dato('Fecha prevista', x.f_carga ? new Date(`${x.f_carga}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'No indicada', true);
    dato('Hora', 'No indicada en el documento');
    if (ruta?.km) dato('Ruta prevista', `${Number(ruta.km).toLocaleString('es-ES')} km${ruta.minutos ? ` · unos ${Math.floor(ruta.minutos / 60)} h ${ruta.minutos % 60} min` : ''}`);
    dato('Albarán', x.nalbaran);
    seccion('Conductor y vehículo');
    dato('Conductor', [x.conductor_nombre || conductor?.nombre, x.conductor_dni].filter(Boolean).join(' · ') || 'No asignado', true);
    dato('Teléfono', conductor?.telefono);
    dato('Vehículo', [x.matricula, vehiculo && [vehiculo.tipo, vehiculo.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'No asignado', true);
    dato('Remolque', x.remolque);
    seccion(d.tipo === 'ecmr' ? 'Recogida' : 'Carga');
    lugar(ubicacion(x.origen), d.tipo === 'ecmr' ? 'Lugar de toma' : 'Lugar de carga');
    seccion(d.tipo === 'ecmr' ? 'Entrega' : 'Descarga');
    (x.destinos?.length ? x.destinos : [x.destino]).filter(Boolean).forEach((t, i, l) => lugar(ubicacion(t), l.length > 1 ? `${i + 1}.ª descarga` : 'Lugar de descarga'));
    dato('Destinatario', x.destinatario);
    seccion('Contactos');
    dato(x.mi_papel === 'cargador' ? 'Transportista' : 'Cliente / cargador', x.contraparte_nombre || contraparte?.nombre);
    dato('Teléfono', contraparte?.tel);
    dato('Correo', contraparte?.email);
    dato('Mi empresa', [emp.nombre, emp.telefono].filter(Boolean).join(' · '));
    seccion('Mercancía');
    dato('Mercancía', x.mercancia, true);
    dato('Peso', x.peso ? `${Number(x.peso).toLocaleString('es-ES')} kg` : '');
    dato('Bultos', x.bultos);
    if (x.instrucciones || x.obs || x.obs_transportista || x.autorizacion || x.reservas) {
      seccion('Instrucciones y observaciones');
      dato('Instrucciones', x.instrucciones);
      dato('Observaciones', x.obs);
      dato('Transportista', x.obs_transportista);
      dato('Autorización', x.autorizacion);
      dato('Reservas', x.reservas);
    }
    pdf.page.margins.bottom = 0; // el pie va por debajo del margen sin crear otra página
    pdf.font('Helvetica').fontSize(8).fillColor(GRIS).text(`Generada el ${new Date().toLocaleString('es-ES')} a partir de los datos del transporte. Durante el servicio debe llevarse el documento oficial (${d.tipo === 'ecmr' ? 'eCMR' : 'DeCA'}), accesible con el QR.`, M, pdf.page.height - 42, { width: ancho, align: 'center' });
    const buffer = await new Promise((ok, ko) => { const t = []; pdf.on('data', (c) => t.push(c)); pdf.on('end', () => ok(Buffer.concat(t))); pdf.on('error', ko); pdf.end(); });
    return { buffer, nombre: `hoja-servicio-${d.num}.pdf`, tipo: 'application/pdf' };
  }

  // Disponible para los plugins de WhatsApp y correo como adjunto adicional
  ctx.extender('documentos.extra', { id: 'hoja-servicio', nombre: 'Hoja de servicio (operativa)', generar });

  router.get('/hoja/:id.pdf', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!docs.ve(req.u, id)) return res.status(404).json({ error: 'Documento no encontrado' });
      const h = await generar(id);
      if (!h) return res.status(404).json({ error: 'Documento no encontrado' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename="${h.nombre}"`);
      res.send(h.buffer);
    } catch (e) { console.error('[hoja-servicio]', e); res.status(500).json({ error: 'No se pudo generar la hoja' }); }
  });
}
