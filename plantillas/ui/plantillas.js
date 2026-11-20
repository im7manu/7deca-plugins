// Plugin «Plantillas de transportes» — interfaz.
(function () {
  const D = window.DECA;
  if (!D) return;
  const P = '/api/p/plantillas';
  const e = (s) => D.esc(s == null ? '' : String(s));
  const NOMBRES = { mi_papel: 'Papel de tu empresa', contraparte_id: 'Empresa contraparte', contraparte_nombre: 'Contraparte', contraparte_nif: 'NIF contraparte', contraparte_direccion: 'Dirección contraparte', destinatario: 'Destinatario', origen: 'Lugar de carga', destinos: 'Lugares de descarga', mercancia: 'Mercancía', instrucciones: 'Instrucciones', obs: 'Observaciones', obs_transportista: 'Observaciones del transportista', autorizacion: 'Autorización', matricula: 'Vehículo', remolque: 'Remolque', conductor_nombre: 'Conductor', conductor_dni: 'DNI del conductor' };
  let cache = null;
  const lista = async (forzar) => (cache && !forzar ? cache : (cache = await D.api(`${P}/plantillas`)));

  function aplicar(p, conPreferidos) {
    const datos = { ...p.datos, ...(conPreferidos ? p.preferidos : {}) };
    D.state.dup = { tipo: p.tipo, datos, asignado: null, titulo: 'Nuevo envío desde plantilla' };
    D.state.__plantilla = { nombre: p.nombre, campos: Object.keys(datos), preferidos: conPreferidos && Object.keys(p.preferidos).length > 0 };
    D.api(`${P}/plantillas/${p.id}/usada`, { method: 'POST', body: {} }).catch(() => {});
    if (D.state.hash === 'nuevo-envio') D.renderApp(); else D.go('nuevo-envio');
  }

  // ---- Formulario de envío: elegir plantilla (arriba) y marcar los campos rellenados ----
  D.extender('envio.form', async ({ form, inicio, estado }) => {
    if (!inicio) return;
    if (D.state.__plantilla) { estado.__plantilla = D.state.__plantilla; delete D.state.__plantilla; }
    const caja = inicio.appendChild(document.createElement('div'));
    const ap = estado.__plantilla;
    if (ap) {
      caja.innerHTML = `<div class="plt-aviso">${D.I('copy')} <div>Rellenado desde la plantilla <strong>«${e(ap.nombre)}»</strong>. Revisa los campos marcados y completa los datos de este viaje (fecha, peso, bultos${ap.preferidos ? '' : ', vehículo y conductor'}…). El documento tendrá su propio número y QR al guardarlo. <button type="button" class="btn-ghost btn-small" data-quitar>Quitar marcas</button></div></div>`;
      caja.querySelector('[data-quitar]').onclick = () => { delete estado.__plantilla; form.querySelectorAll('.plt-rellenado').forEach((x) => x.classList.remove('plt-rellenado')); caja.remove(); };
      for (const k of ap.campos) {
        const sel = k === 'destinos' ? '[data-dest]' : `[name="${k}"]`;
        form.querySelectorAll(sel).forEach((x) => { if (x.type !== 'hidden' && x.type !== 'radio') x.classList.add('plt-rellenado'); });
      }
      return;
    }
    const l = (await lista().catch(() => [])).filter((p) => D.perm(`${p.tipo}_crear`));
    if (!l.length) return;
    caja.innerHTML = `<div class="plt-elegir">${D.I('copy')} <select class="select" data-plt><option value="">Crear desde una plantilla…</option>${l.map((p) => `<option value="${p.id}">${e(p.nombre)} (${p.tipo === 'ecmr' ? 'eCMR' : 'DeCA'})</option>`).join('')}</select>
      <label class="small plt-pref" hidden><input type="checkbox" data-pref> Rellenar también el vehículo y el conductor preferidos</label><button type="button" class="btn-secondary btn-small" data-usar disabled>Usar</button></div>`;
    const sel = caja.querySelector('[data-plt]'), pref = caja.querySelector('.plt-pref');
    sel.onchange = () => { const p = l.find((x) => String(x.id) === sel.value); caja.querySelector('[data-usar]').disabled = !p; pref.hidden = !p || !Object.keys(p.preferidos).length; if (p && pref.hidden === false) pref.lastChild.textContent = ` Rellenar también: ${Object.keys(p.preferidos).map((k) => NOMBRES[k]).join(', ')} (${Object.values(p.preferidos).join(' · ')})`; };
    caja.querySelector('[data-usar]').onclick = () => {
      const p = l.find((x) => String(x.id) === sel.value);
      if (!p) return;
      const hayDatos = [...form.querySelectorAll('input[type=text],input:not([type]),textarea')].some((x) => x.value.trim() && !x.readOnly && x.name !== 'f_carga');
      if (hayDatos && !confirm('Se sustituirán los datos que ya has escrito por los de la plantilla. ¿Continuar?')) return;
      aplicar(p, caja.querySelector('[data-pref]').checked);
    };
  });

  // ---- Detalle del envío: guardar como plantilla ----
  D.extender('envio.detalle', ({ cont, doc }) => {
    if (!cont || !D.perm(`${doc.tipo}_crear`)) return;
    const b = D.accionDetalle(cont, `<button type="button" class="btn-secondary btn-small">${D.I('copy')} Guardar como plantilla</button>`);
    b.querySelector('button').onclick = () => {
      const m = document.createElement('div');
      const x = doc.datos || {};
      m.innerHTML = `<div class="modal-backdrop" style="z-index:9000"><div class="modal small"><div class="modal-head"><div class="modal-title">Guardar ${e(doc.num)} como plantilla</div><button class="close-btn" data-x>${D.I('x')}</button></div>
        <div class="modal-body"><label class="field"><span>Nombre de la plantilla</span><input class="input" data-nombre value="${e([x.origen, (x.destinos || [])[0]].filter(Boolean).map((t) => String(t).split(' — ')[0]).join(' → ') || x.contraparte_nombre || '')}"></label>
        <p class="small muted">Se guardan la contraparte, el destinatario, los lugares, la mercancía y las instrucciones. No se guardan el número, el QR, el estado, la fecha, el peso, los bultos ni el albarán.</p>
        ${x.matricula || x.conductor_nombre ? `<label class="small" style="display:flex;gap:6px"><input type="checkbox" data-pref> Guardar también el vehículo y el conductor como preferidos (${e([x.matricula, x.conductor_nombre].filter(Boolean).join(' · '))})</label>` : ''}
        <div class="error" data-err></div></div>
        <div class="modal-foot"><button class="btn-secondary" data-x>Cancelar</button><button class="btn-primary" data-ok>${D.I('save')} Guardar plantilla</button></div></div></div>`;
      document.body.appendChild(m);
      const cerrar = () => m.remove();
      m.querySelectorAll('[data-x]').forEach((y) => y.onclick = cerrar);
      m.querySelector('[data-ok]').onclick = async () => {
        try { await D.api(`${P}/desde-envio/${doc.id}`, { method: 'POST', body: { nombre: m.querySelector('[data-nombre]').value, preferidos: !!m.querySelector('[data-pref]')?.checked } }); cache = null; D.toast('Plantilla guardada'); cerrar(); }
        catch (er) { m.querySelector('[data-err]').textContent = er.message; }
      };
    };
  });

  // ---- Página de plantillas ----
  function editor(p, alGuardar) {
    const x = p?.datos || {}, pr = p?.preferidos || {};
    const m = document.createElement('div');
    const campo = (k, l, v, area) => `<label class="field" ${area ? 'style="grid-column:1/-1"' : ''}><span>${l}</span>${area ? `<textarea class="input" rows="2" data-k="${k}">${e(v)}</textarea>` : `<input class="input" data-k="${k}" value="${e(v)}">`}</label>`;
    m.innerHTML = `<div class="modal-backdrop" style="z-index:9000"><div class="modal"><div class="modal-head"><div class="modal-title">${p ? 'Editar plantilla' : 'Nueva plantilla'}</div><button class="close-btn" data-x>${D.I('x')}</button></div>
      <div class="modal-body"><div class="grid grid2">
        <label class="field"><span>Nombre *</span><input class="input" data-nombre value="${e(p?.nombre || '')}"></label>
        <label class="field"><span>Tipo</span><select class="select" data-tipo>${D.perm('deca_crear') ? `<option value="deca" ${p?.tipo !== 'ecmr' ? 'selected' : ''}>DeCA</option>` : ''}${D.perm('ecmr_crear') ? `<option value="ecmr" ${p?.tipo === 'ecmr' ? 'selected' : ''}>eCMR</option>` : ''}</select></label>
        ${campo('contraparte_nombre', 'Contraparte (cliente o transportista)', x.contraparte_nombre)}${campo('contraparte_nif', 'NIF de la contraparte', x.contraparte_nif)}
        ${campo('contraparte_direccion', 'Dirección de la contraparte', x.contraparte_direccion)}${campo('destinatario', 'Destinatario', x.destinatario)}
        ${campo('origen', 'Lugar de carga', x.origen)}<label class="field"><span>Lugares de descarga (uno por línea)</span><textarea class="input" rows="2" data-k="destinos">${e((x.destinos || []).join('\n'))}</textarea></label>
        ${campo('mercancia', 'Mercancía', x.mercancia)}${campo('autorizacion', 'Autorización especial', x.autorizacion)}
        ${campo('instrucciones', 'Instrucciones', x.instrucciones, true)}${campo('obs', 'Observaciones', x.obs, true)}
      </div><h4 style="margin:12px 0 4px">Preferidos (solo se usan si lo confirmas al crear el envío)</h4><div class="grid grid2">
        <label class="field"><span>Vehículo (matrícula)</span><input class="input" data-p="matricula" value="${e(pr.matricula || '')}"></label><label class="field"><span>Remolque</span><input class="input" data-p="remolque" value="${e(pr.remolque || '')}"></label>
        <label class="field"><span>Conductor</span><input class="input" data-p="conductor_nombre" value="${e(pr.conductor_nombre || '')}"></label><label class="field"><span>DNI del conductor</span><input class="input" data-p="conductor_dni" value="${e(pr.conductor_dni || '')}"></label>
      </div><div class="error" data-err></div></div>
      <div class="modal-foot"><button class="btn-secondary" data-x>Cancelar</button><button class="btn-primary" data-ok>${D.I('save')} Guardar</button></div></div></div>`;
    document.body.appendChild(m);
    const cerrar = () => m.remove();
    m.querySelectorAll('[data-x]').forEach((y) => y.onclick = cerrar);
    m.querySelector('[data-ok]').onclick = async () => {
      const datos = { ...(p?.datos || {}) };
      m.querySelectorAll('[data-k]').forEach((i) => { datos[i.dataset.k] = i.dataset.k === 'destinos' ? i.value.split('\n').map((t) => t.trim()).filter(Boolean) : i.value.trim(); });
      if (datos.contraparte_id && (datos.contraparte_nombre !== p?.datos.contraparte_nombre)) delete datos.contraparte_id;
      const preferidos = Object.fromEntries([...m.querySelectorAll('[data-p]')].map((i) => [i.dataset.p, i.value.trim()]));
      try { await D.api(`${P}/plantillas`, { method: 'POST', body: { id: p?.id, nombre: m.querySelector('[data-nombre]').value, tipo: m.querySelector('[data-tipo]').value, datos, preferidos } }); cache = null; D.toast('Plantilla guardada'); cerrar(); alGuardar(); }
      catch (er) { m.querySelector('[data-err]').textContent = er.message; }
    };
  }

  D.pagina({
    id: 'plantillas', label: 'Plantillas', icon: 'copy', show: () => D.perm('deca_crear') || D.perm('ecmr_crear'),
    async render(view) {
      const pintar = async () => {
        const l = await lista(true);
        view.innerHTML = `${D.head('Plantillas de transportes', 'Transportes habituales para crear envíos más rápido', `<button class="btn-primary" id="pltNueva">${D.I('plus')} Nueva plantilla</button>`)}
          <div class="info-note">${D.I('copy')}<div>Usa una plantilla desde «Registrar nuevo envío» o con el botón «Usar». También puedes guardar cualquier envío como plantilla desde su detalle. Cada envío nuevo tendrá su propio número, QR y estado.</div></div>
          <div class="tile-grid">${l.map((p) => `<div class="tile-btn"><div class="tile-top"><div class="tile-icon">${D.I('copy')}</div><div class="tile-main"><div class="tile-title">${e(p.nombre)}</div><div class="tile-sub">${e([p.datos.origen, (p.datos.destinos || []).join(' / ')].filter(Boolean).map((t) => String(t).split(' — ')[0]).join(' → '))}</div></div><span class="badge gray">${p.tipo === 'ecmr' ? 'eCMR' : 'DeCA'}</span></div>
            <div class="tile-meta"><span>${e(p.datos.contraparte_nombre || '')}</span><span>${p.usos ? `Usada ${p.usos} ${p.usos === 1 ? 'vez' : 'veces'}` : 'Sin usar'}</span></div>
            <div class="actions mt4"><button class="btn-primary btn-small" data-usar="${p.id}">Usar</button><button class="btn-secondary btn-small" data-ed="${p.id}">${D.I('edit')} Editar</button><button class="btn-danger btn-small" data-bo="${p.id}">${D.I('trash')}</button></div></div>`).join('') || '<div class="card empty" style="grid-column:1/-1">Aún no hay plantillas.</div>'}</div>`;
        view.querySelector('#pltNueva').onclick = () => editor(null, pintar);
        view.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => editor(l.find((p) => p.id === Number(b.dataset.ed)), pintar));
        view.querySelectorAll('[data-bo]').forEach((b) => b.onclick = async () => { if (!confirm('¿Eliminar la plantilla? Los envíos creados con ella no cambian.')) return; await D.api(`${P}/plantillas/${b.dataset.bo}`, { method: 'DELETE' }); pintar(); });
        view.querySelectorAll('[data-usar]').forEach((b) => b.onclick = () => { const p = l.find((x) => x.id === Number(b.dataset.usar)); aplicar(p, Object.keys(p.preferidos).length ? confirm(`¿Rellenar también el vehículo y el conductor preferidos (${Object.values(p.preferidos).join(' · ')})?`) : false); });
      };
      await pintar();
    },
  });
})();
