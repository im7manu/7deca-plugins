// Plugin «Copias de seguridad automáticas» para 7DeCA.
// - Destino dentro de la carpeta de datos (persistente en Docker) o de DECA_COPIAS_DIR, nunca en carpetas temporales.
// - Cada copia se hace en una carpeta provisional, se comprueba (integridad de la base de datos y número de PDF) y solo
//   entonces se da por válida. Las antiguas se borran después de que una copia nueva haya salido bien.
// - Restaurar: solo administradores, con confirmación; antes se hace una copia del estado actual y el cambio se aplica al
//   reiniciar (7DeCA 1.5.0 coloca los datos de data/restaurar antes de abrir la base de datos).
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const AJUSTE = 'copias';
const DEFECTO = { activo: false, frecuencia: 'diaria', dia_semana: 1, hora: 3, conservar: 7, incluir_db: true, incluir_pdf: true, carpeta: 'copias-automaticas' };
const ID = /^\d{8}-\d{6}(-[a-z]+)?$/;

export function register(ctx) {
  const { router, adm, logAudit } = ctx;
  const DATA = ctx.dataRoot;
  const raizPermitida = process.env.DECA_COPIAS_DIR ? path.resolve(process.env.DECA_COPIAS_DIR) : DATA;
  const config = () => ({ ...DEFECTO, ...(ctx.getAjuste(AJUSTE, {}) || {}) });
  const destino = (c = config()) => {
    const d = path.resolve(raizPermitida, c.carpeta || DEFECTO.carpeta);
    if (!d.startsWith(raizPermitida + path.sep)) throw new Error('La carpeta de destino debe estar dentro de la carpeta de datos.');
    return d;
  };
  const L = (u, ip, a, d, s = 'info') => logAudit(u, ip, a, d, s);
  const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
  let enCurso = false;
  let ultima = ctx.getAjuste('copias_ultima', null);

  const tamano = (p) => { const s = fs.statSync(p); if (!s.isDirectory()) return s.size; return fs.readdirSync(p).reduce((t, f) => t + tamano(path.join(p, f)), 0); };
  const contarPdf = (p) => (fs.existsSync(p) ? fs.readdirSync(p).filter((f) => f.endsWith('.pdf')).length : 0);

  function listar() {
    let dir;
    try { dir = destino(); } catch { return []; }
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => ID.test(f)).map((f) => {
      try { return { id: f, ...JSON.parse(fs.readFileSync(path.join(dir, f, 'info.json'), 'utf8')) }; } catch { return { id: f, valida: false, error: 'Sin información (copia incompleta)' }; }
    }).sort((a, b) => b.id.localeCompare(a.id));
  }

  /** Crea una copia. motivo: 'automatica' | 'manual' | 'antes-de-restaurar'. Devuelve su información. */
  async function crear(motivo, usuario = 'automático') {
    if (enCurso) throw err('Ya se está haciendo una copia. Espera a que termine.', 409);
    enCurso = true;
    const c = config(), dir = destino(c);
    const ahora = new Date(), id = `${ahora.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}${motivo === 'automatica' ? '' : `-${motivo.split('-')[0]}`}`;
    const tmp = path.join(dir, `.en-curso-${id}`);
    try {
      if (!c.incluir_db && !c.incluir_pdf) throw new Error('Elige qué incluir en la copia (base de datos y/o PDF).');
      fs.mkdirSync(dir, { recursive: true });
      try { fs.accessSync(dir, fs.constants.W_OK); } catch { throw new Error(`No se puede escribir en la carpeta de destino (${dir}). Revisa los permisos.`); }
      // Espacio: lo que ocupan los datos con un margen del 20 %
      const necesario = ((c.incluir_db ? fs.statSync(path.join(DATA, 'app.db')).size : 0) + (c.incluir_pdf ? tamano(path.join(DATA, 'pdf')) : 0)) * 1.2;
      try { const st = fs.statfsSync(dir); if (st.bavail * st.bsize < necesario) throw new Error(`Espacio insuficiente en el disco: hacen falta unos ${Math.ceil(necesario / 1048576)} MB.`); } catch (e) { if (/insuficiente/.test(e.message)) throw e; }
      fs.mkdirSync(tmp, { recursive: true });
      const info = { fecha: ahora.toISOString(), motivo, usuario, version: ctx.version, contenido: [], valida: false };
      if (c.incluir_db) {
        const f = path.join(tmp, 'app.db');
        ctx.db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
        const prueba = new DatabaseSync(f, { readOnly: true });
        try {
          const ok = prueba.prepare('PRAGMA integrity_check').get();
          if (Object.values(ok)[0] !== 'ok') throw new Error('La comprobación de integridad de la copia ha fallado.');
          info.documentos = prueba.prepare('SELECT COUNT(*) AS n FROM docs').get().n;
        } finally { prueba.close(); }
        info.sha256 = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
        info.contenido.push('base de datos');
      }
      if (c.incluir_pdf) {
        const origen = path.join(DATA, 'pdf');
        await fs.promises.cp(origen, path.join(tmp, 'pdf'), { recursive: true });
        info.pdfs = contarPdf(path.join(tmp, 'pdf'));
        if (info.pdfs < contarPdf(origen)) throw new Error('No se han copiado todos los PDF.');
        info.contenido.push('PDF');
      }
      info.tamano = tamano(tmp);
      info.valida = true;
      fs.writeFileSync(path.join(tmp, 'info.json'), JSON.stringify(info, null, 2));
      fs.renameSync(tmp, path.join(dir, id));
      // Retención: solo las automáticas, y solo ahora que la nueva está bien
      if (motivo === 'automatica') {
        const autos = listar().filter((x) => x.motivo === 'automatica' && x.valida);
        for (const vieja of autos.slice(Math.max(1, Number(c.conservar) || 7))) fs.rmSync(path.join(dir, vieja.id), { recursive: true, force: true });
      }
      ultima = { fecha: info.fecha, ok: true, id, tamano: info.tamano, motivo };
      ctx.setAjuste('copias_ultima', ultima);
      L(usuario, '', 'COPIA_CREADA', `${id} (${info.contenido.join(' y ')}, ${Math.round(info.tamano / 1024)} KB)`);
      return { id, ...info };
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      ultima = { fecha: new Date().toISOString(), ok: false, error: e.message, motivo };
      ctx.setAjuste('copias_ultima', ultima);
      L(usuario, '', 'COPIA_ERROR', e.message, 'alerta');
      throw err(e.message, e.status === 409 ? 409 : 502);
    } finally { enCurso = false; }
  }

  /** Próxima copia automática según la programación. */
  function proxima(c = config()) {
    const ult = listar().find((x) => x.motivo === 'automatica' && x.valida);
    const base = ult ? new Date(ult.fecha) : null;
    const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(c.hora);
    if (c.frecuencia === 'semanal') { while (d.getDay() !== Number(c.dia_semana)) d.setDate(d.getDate() + 1); }
    const paso = c.frecuencia === 'semanal' ? 7 : 1;
    // si ya hay una copia en este periodo, la siguiente; sin copias previas, la primera hora programada a partir de ahora
    if (base) while (d - base < (paso === 7 ? 6.5 : 0.9) * 864e5) d.setDate(d.getDate() + paso);
    else while (d < Date.now()) d.setDate(d.getDate() + paso);
    return d;
  }
  ctx.cada(5 * 60_000, async () => {
    const c = config();
    if (!c.activo || enCurso) return;
    if (new Date() >= proxima(c)) await crear('automatica').catch((e) => console.error('[copias]', e.message));
  });

  // ---- API (administradores) ----
  router.get('/estado', adm, (_req, res) => {
    const c = config();
    let dir = ''; try { dir = destino(c); } catch (e) { dir = e.message; }
    res.json({ config: c, destino: dir, raiz: raizPermitida, ultima, proxima: c.activo ? proxima(c).toISOString() : null, en_curso: enCurso, copias: listar(), supervisado: process.env.DECA_SUPERVISADO === '1' });
  });
  router.put('/config', adm, (req, res) => {
    const b = req.body || {};
    const carpeta = String(b.carpeta || DEFECTO.carpeta).trim().replace(/\\/g, '/');
    if (!/^[\w./-]{1,120}$/.test(carpeta) || carpeta.split('/').includes('..') || carpeta.startsWith('/')) return res.status(400).json({ error: 'La carpeta debe ser un nombre dentro de la carpeta de datos (sin «..» ni rutas absolutas).' });
    if (/(^|\/)(tmp|temp)(\/|$)/i.test(carpeta)) return res.status(400).json({ error: 'No guardes las copias en una carpeta temporal.' });
    const c = { activo: !!b.activo, frecuencia: b.frecuencia === 'semanal' ? 'semanal' : 'diaria', dia_semana: Math.max(0, Math.min(6, Number(b.dia_semana) || 0)), hora: Math.max(0, Math.min(23, Number(b.hora) || 0)),
      conservar: Math.max(1, Math.min(90, Number(b.conservar) || 7)), incluir_db: b.incluir_db !== false, incluir_pdf: b.incluir_pdf !== false, carpeta };
    if (!c.incluir_db && !c.incluir_pdf) return res.status(400).json({ error: 'Incluye al menos la base de datos o los PDF.' });
    ctx.setAjuste(AJUSTE, c);
    L(req.u.usuario, req.ip, 'COPIAS_CONFIG', `${c.activo ? 'Activadas' : 'Desactivadas'}: ${c.frecuencia} a las ${c.hora}:00, conservar ${c.conservar}`, 'aviso');
    res.json({ ok: 1 });
  });
  router.post('/crear', adm, async (req, res) => {
    try { res.json(await crear('manual', req.u.usuario)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  router.get('/copias/:id/descargar', adm, (req, res) => {
    const id = String(req.params.id);
    if (!ID.test(id)) return res.status(400).end();
    const dir = path.join(destino(), id);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Copia no encontrada' });
    L(req.u.usuario, req.ip, 'COPIA_DESCARGADA', id, 'aviso');
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="copia-gestor-deca-${id}.tar.gz"`);
    const t = spawn(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-czf', '-', '-C', dir, '.']);
    t.stdout.pipe(res);
    t.on('error', () => res.destroy());
  });
  router.delete('/copias/:id', adm, (req, res) => {
    const id = String(req.params.id);
    if (!ID.test(id)) return res.status(400).end();
    fs.rmSync(path.join(destino(), id), { recursive: true, force: true });
    L(req.u.usuario, req.ip, 'COPIA_ELIMINADA', id, 'aviso');
    res.json({ ok: 1 });
  });
  router.post('/copias/:id/restaurar', adm, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!ID.test(id)) throw err('Copia no válida');
      if (req.body?.confirmacion !== 'RESTAURAR') throw err('Escribe RESTAURAR para confirmar.');
      const dir = path.join(destino(), id);
      const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
      if (!info.valida || !fs.existsSync(path.join(dir, 'app.db'))) throw err('Esa copia no incluye una base de datos válida.');
      if (process.env.DECA_SUPERVISADO !== '1') throw err('La aplicación no se está ejecutando con supervisor (npm start), así que no puede reiniciarse sola para restaurar.', 409);
      // 1) Copia del estado actual (completa)
      const antes = await crear('antes-de-restaurar', req.u.usuario);
      // 2) Preparar los datos y reiniciar: 7DeCA los coloca antes de abrir la base de datos
      const rest = path.join(DATA, 'restaurar');
      fs.rmSync(rest, { recursive: true, force: true });
      fs.mkdirSync(rest, { recursive: true });
      fs.copyFileSync(path.join(dir, 'app.db'), path.join(rest, 'app.db'));
      if (fs.existsSync(path.join(dir, 'pdf'))) await fs.promises.cp(path.join(dir, 'pdf'), path.join(rest, 'pdf'), { recursive: true });
      L(req.u.usuario, req.ip, 'COPIA_RESTAURADA', `${id} (estado anterior guardado en ${antes.id}). Reiniciando.`, 'critico');
      res.json({ ok: 1, copia_previa: antes.id });
      ctx.reiniciar();
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
}
