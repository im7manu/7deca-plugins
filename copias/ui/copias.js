// Plugin «Copias de seguridad automáticas» — página para administradores.
(function () {
  const D = window.DECA;
  if (!D) return;
  const P = '/api/p/copias';
  const e = (s) => D.esc(s == null ? '' : String(s));
  const f = (s) => (s ? new Date(s).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const tam = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const MOTIVO = { automatica: 'Automática', manual: 'Manual', 'antes-de-restaurar': 'Antes de restaurar' };
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  D.pagina({
    id: 'copias', label: 'Copias automáticas', icon: 'shield', show: () => D.state.user?.rol === 'admin',
    async render(view) {
      const pintar = async () => {
        const s = await D.api(`${P}/estado`), c = s.config;
        view.innerHTML = `${D.head('Copias de seguridad automáticas', 'Base de datos y PDF, en una carpeta persistente', `<button class="btn-primary" id="cpAhora" ${s.en_curso ? 'disabled' : ''}>${D.I('shield')} Crear copia ahora</button>`)}
          ${s.ultima ? `<div class="info-note" ${s.ultima.ok ? '' : 'style="border-color:var(--danger)"'}>${D.I(s.ultima.ok ? 'check' : 'alert')}<div>Última copia: <strong>${f(s.ultima.fecha)}</strong> · ${s.ultima.ok ? `correcta (${tam(s.ultima.tamano)})` : `<span style="color:var(--danger)">ERROR: ${e(s.ultima.error)}</span>`}${s.proxima ? ` · próxima automática: ${f(s.proxima)}` : ''}</div></div>` : ''}
          <div class="card" style="padding:16px 18px"><form id="cpCfg" class="grid grid2">
            <label class="small" style="grid-column:1/-1;display:flex;gap:6px"><input type="checkbox" name="activo" ${c.activo ? 'checked' : ''}> <strong>Hacer copias automáticas</strong></label>
            <label class="field"><span>Frecuencia</span><select class="select" name="frecuencia"><option value="diaria" ${c.frecuencia === 'diaria' ? 'selected' : ''}>Diaria</option><option value="semanal" ${c.frecuencia === 'semanal' ? 'selected' : ''}>Semanal</option></select></label>
            <label class="field" id="cpDia"><span>Día</span><select class="select" name="dia_semana">${DIAS.map((d, i) => `<option value="${i}" ${Number(c.dia_semana) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
            <label class="field"><span>Hora</span><input class="input" type="number" min="0" max="23" name="hora" value="${c.hora}"></label>
            <label class="field"><span>Copias automáticas que se conservan</span><input class="input" type="number" min="1" max="90" name="conservar" value="${c.conservar}"></label>
            <label class="small" style="display:flex;gap:6px"><input type="checkbox" name="incluir_db" ${c.incluir_db ? 'checked' : ''}> Incluir la base de datos</label>
            <label class="small" style="display:flex;gap:6px"><input type="checkbox" name="incluir_pdf" ${c.incluir_pdf ? 'checked' : ''}> Incluir los PDF</label>
            <label class="field" style="grid-column:1/-1"><span>Carpeta (dentro de ${e(s.raiz)})</span><input class="input" name="carpeta" value="${e(c.carpeta)}"></label>
            <div class="small muted" style="grid-column:1/-1">Destino actual: <code>${e(s.destino)}</code>. Está dentro de la carpeta de datos, que es la que se conserva al actualizar o recrear el contenedor. Para tener copias fuera del servidor, descárgalas de vez en cuando.</div>
            <div class="actions" style="grid-column:1/-1"><button class="btn-primary">${D.I('save')} Guardar</button></div></form></div>
          <h2 class="section-title" style="margin-top:18px">Copias</h2>
          <div class="card"><table class="table" style="width:100%"><thead><tr><th style="text-align:left">Fecha</th><th style="text-align:left">Tipo</th><th style="text-align:left">Contenido</th><th style="text-align:right">Tamaño</th><th></th></tr></thead><tbody>
          ${s.copias.map((x) => `<tr><td>${f(x.fecha)}</td><td>${e(MOTIVO[x.motivo] || x.motivo || '')}</td><td>${x.valida ? `${e((x.contenido || []).join(' y '))}${x.documentos != null ? ` · ${x.documentos} documentos` : ''}${x.pdfs != null ? ` · ${x.pdfs} PDF` : ''}` : `<span style="color:var(--danger)">${e(x.error || 'No válida')}</span>`}</td><td style="text-align:right">${tam(x.tamano)}</td>
            <td style="white-space:nowrap;text-align:right"><a class="btn-secondary btn-small" href="${P}/copias/${e(x.id)}/descargar">Descargar</a> ${x.valida && (x.contenido || []).includes('base de datos') ? `<button class="btn-secondary btn-small" data-rest="${e(x.id)}">Restaurar</button>` : ''} <button class="btn-danger btn-small" data-bo="${e(x.id)}">${D.I('trash')}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="padding:14px;text-align:center">Aún no hay copias.</td></tr>'}
          </tbody></table></div>
          <p class="small muted">La copia manual de siempre (descargar la base de datos) sigue disponible. Restaurar sustituye los datos actuales por los de la copia: antes se guarda una copia del estado actual y la aplicación se reinicia${s.supervisado ? '' : ' (necesita ejecutarse con supervisor, «npm start»)'}.</p>`;
        const fm = view.querySelector('#cpCfg');
        const dia = () => { view.querySelector('#cpDia').hidden = fm.frecuencia.value !== 'semanal'; };
        fm.frecuencia.onchange = dia; dia();
        fm.onsubmit = async (ev) => {
          ev.preventDefault();
          const v = Object.fromEntries(new FormData(fm).entries());
          try { await D.api(`${P}/config`, { method: 'PUT', body: { ...v, activo: fm.activo.checked, incluir_db: fm.incluir_db.checked, incluir_pdf: fm.incluir_pdf.checked } }); D.toast('Guardado'); pintar(); } catch (x) { D.toast(x.message, true); }
        };
        view.querySelector('#cpAhora').onclick = async (ev) => { ev.target.disabled = true; ev.target.textContent = 'Creando copia…'; try { await D.api(`${P}/crear`, { method: 'POST', body: {} }); D.toast('Copia creada y comprobada'); } catch (x) { D.toast(x.message, true); } pintar(); };
        view.querySelectorAll('[data-bo]').forEach((b) => b.onclick = async () => { if (!confirm('¿Eliminar esta copia?')) return; await D.api(`${P}/copias/${b.dataset.bo}`, { method: 'DELETE' }); pintar(); });
        view.querySelectorAll('[data-rest]').forEach((b) => b.onclick = async () => {
          const t = prompt(`Restaurar la copia ${b.dataset.rest}\n\nSe sustituirán TODOS los datos actuales por los de la copia (antes se guarda una copia del estado actual) y la aplicación se reiniciará.\n\nEscribe RESTAURAR para confirmar:`);
          if (t === null) return;
          try { const r = await D.api(`${P}/copias/${b.dataset.rest}/restaurar`, { method: 'POST', body: { confirmacion: t.trim() } }); D.toast(`Restaurando… (estado anterior guardado en ${r.copia_previa})`); setTimeout(() => location.reload(), 6000); }
          catch (x) { D.toast(x.message, true); }
        });
      };
      await pintar();
    },
  });
})();
