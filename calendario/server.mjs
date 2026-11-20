// Plugin «Calendario (.ics)»: exporta transportes a iCalendar (RFC 5545) sin servicios externos.
// Los documentos solo tienen fecha (sin hora): los eventos son de día completo y lo indican. No se inventan horas.
const fechaIcs = (iso) => iso.replace(/-/g, '');
const escapar = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Parte las líneas a 75 octetos como pide el estándar. */
function plegar(linea) {
  const b = Buffer.from(linea, 'utf8');
  if (b.length <= 75) return linea;
  const partes = []; let i = 0, primero = true;
  while (i < b.length) {
    let n = primero ? 75 : 74;
    while (n > 0 && i + n < b.length && (b[i + n] & 0xc0) === 0x80) n--; // no cortar un carácter UTF-8
    partes.push((primero ? '' : ' ') + b.subarray(i, i + n).toString('utf8'));
    i += n; primero = false;
  }
  return partes.join('\r\n');
}
const sumarDia = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function register(ctx) {
  const { router, db, docs } = ctx;
  const sello = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  function eventos(d, empresa, dominio) {
    const x = d.datos;
    const fecha = x.f_carga || String(d.creado || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
    const destinos = (x.destinos?.length ? x.destinos : [x.destino]).filter(Boolean);
    const descripcion = [
      `${d.tipo === 'ecmr' ? 'eCMR' : 'DeCA'} ${d.num}${d.estado === 'anulado' ? ' (ANULADO)' : ''}`,
      x.contraparte_nombre && `Cliente: ${x.contraparte_nombre}`, `Carga: ${x.origen || '—'}`, `Descarga: ${destinos.join(' / ') || '—'}`,
      x.mercancia && `Mercancía: ${x.mercancia}${x.peso ? ` · ${x.peso} kg` : ''}`, (x.conductor_nombre || x.matricula) && `Conductor y vehículo: ${[x.conductor_nombre, x.matricula, x.remolque].filter(Boolean).join(' · ')}`,
      x.instrucciones && `Instrucciones: ${x.instrucciones}`, x.obs && `Observaciones: ${x.obs}`,
      'Hora no indicada en el documento (evento de día completo).', `Documento: ${d.url}`,
    ].filter(Boolean).join('\n');
    return [[
      'BEGIN:VEVENT', `UID:${d.tipo}-${d.id}@${dominio}`, `DTSTAMP:${sello()}`, `DTSTART;VALUE=DATE:${fechaIcs(fecha)}`, `DTEND;VALUE=DATE:${fechaIcs(sumarDia(fecha))}`,
      `SUMMARY:${escapar(`${d.estado === 'anulado' ? '[ANULADO] ' : ''}Carga — ${d.num}${x.contraparte_nombre ? ` · ${x.contraparte_nombre}` : ''}`)}`,
      `LOCATION:${escapar(x.origen || '')}`, `DESCRIPTION:${escapar(descripcion)}`, `URL:${d.url}`, `ORGANIZER;CN=${escapar(empresa || 'Gestor DeCA')}:mailto:noreply@${dominio}`,
      `STATUS:${d.estado === 'anulado' ? 'CANCELLED' : d.estado === 'borrador' ? 'TENTATIVE' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT', 'END:VEVENT',
    ]];
  }
  function ics(lista, req) {
    const emp = ctx.ajustes().nombre || '';
    let dominio = 'gestor-deca.local';
    try { dominio = new URL(ctx.base).hostname || dominio; } catch { /* por defecto */ }
    const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//im7manu//Gestor DeCA y eCMR//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapar(`Transportes ${emp}`.trim())}`,
      ...lista.flatMap((d) => eventos(d, emp, dominio).flat()), 'END:VCALENDAR'];
    return `${lineas.map(plegar).join('\r\n')}\r\n`;
  }
  const enviar = (res, contenido, nombre) => { res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`); res.send(contenido); };

  router.get('/envio/:id.ics', (req, res) => {
    const id = Number(req.params.id);
    const d = docs.obtener(id);
    if (!d || !docs.ve(req.u, id)) return res.status(404).json({ error: 'Documento no encontrado' });
    enviar(res, ics([d], req), `${d.num}.ics`);
  });
  // Varios a la vez: por defecto los de hoy en adelante, sin anulados
  router.get('/envios.ics', (req, res) => {
    const q = req.query, hoy = new Date().toLocaleDateString('sv-SE');
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.desde || '') ? q.desde : hoy, hasta = /^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '') ? q.hasta : '9999-12-31';
    const estados = ['borrador', 'emitido', 'cerrado', ...(q.anulados === '1' ? ['anulado'] : [])];
    const lista = db.prepare(`SELECT id FROM docs WHERE COALESCE(estado,'emitido') IN (${estados.map(() => '?').join(',')}) ${q.tipo === 'deca' || q.tipo === 'ecmr' ? 'AND tipo = ?' : ''} ORDER BY id`)
      .all(...estados, ...(q.tipo === 'deca' || q.tipo === 'ecmr' ? [q.tipo] : []))
      .filter((r) => docs.ve(req.u, r.id)).map((r) => docs.obtener(r.id))
      .filter((d) => { const f = d.datos.f_carga || String(d.creado).slice(0, 10); return f >= desde && f <= hasta && (q.borradores === '1' || d.estado !== 'borrador'); });
    if (q.contar === '1') return res.json({ total: lista.length });
    enviar(res, ics(lista, req), `transportes-${desde}${hasta !== '9999-12-31' ? `-${hasta}` : ''}.ics`);
  });
}
