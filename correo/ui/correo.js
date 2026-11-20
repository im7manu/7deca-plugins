// Plugin «Envío por correo» — interfaz en Gestor DeCA y eCMR.
(function () {
  const D = window.DECA;
  if (!D) return;
  const P = '/api/p/correo';
  const e = (s) => D.esc(s == null ? '' : String(s));
  const ESTADO = { aceptado: 'Aceptado por el servidor de correo', aceptado_parcial: 'Aceptado en parte (alguna dirección rechazada)', rechazado: 'Rechazado por el servidor', error: 'Error al enviar' };
  const fecha = (s) => new Date(s).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

  D.pagina({
    id: 'correo', label: 'Correo', icon: 'mail', show: () => D.state.user?.rol === 'admin',
    async render(view) {
      const c = await D.api(`${P}/config`);
      view.innerHTML = `${D.head('Correo', 'Cuenta SMTP para enviar los documentos por correo')}
        <div class="info-note">${D.I('mail')}<div>Usa la cuenta de correo de tu empresa o de tu proveedor (Gmail, Outlook, IONOS…). Los límites de envío dependen de esa cuenta. La contraseña se guarda cifrada y no se vuelve a mostrar.</div></div>
        <div class="card" style="padding:16px 18px"><form id="cfgCorreo" class="grid grid2">
          <label class="field"><span>Servidor SMTP *</span><input class="input" name="host" value="${e(c.host)}" placeholder="smtp.ionos.es"></label>
          <label class="field"><span>Puerto</span><input class="input" type="number" name="puerto" value="${e(c.puerto)}"></label>
          <label class="field"><span>Conexión segura</span><select class="select" name="seguridad"><option value="starttls" ${c.seguridad === 'starttls' ? 'selected' : ''}>STARTTLS (normalmente puerto 587)</option><option value="ssl" ${c.seguridad === 'ssl' ? 'selected' : ''}>SSL/TLS (normalmente puerto 465)</option><option value="ninguna" ${c.seguridad === 'ninguna' ? 'selected' : ''}>Ninguna (no recomendado)</option></select></label>
          <label class="field"><span>Usuario</span><input class="input" name="usuario" value="${e(c.usuario)}" autocomplete="off"></label>
          <label class="field"><span>Contraseña o contraseña de aplicación</span><input class="input" type="password" name="password" autocomplete="new-password" placeholder="${c.tiene_password ? 'Guardada (déjala vacía para mantenerla)' : ''}"></label>
          <label class="field"><span>Nombre del remitente</span><input class="input" name="nombre" value="${e(c.nombre)}" placeholder="Transportes …"></label>
          <label class="field"><span>Correo del remitente *</span><input class="input" type="email" name="desde" value="${e(c.desde)}"></label>
          <label class="field"><span>Responder a (opcional)</span><input class="input" type="email" name="responder" value="${e(c.responder)}"></label>
          <label class="field" style="grid-column:1/-1"><span>Asunto por defecto</span><input class="input" name="asunto" value="${e(c.plantilla.asunto)}"></label>
          <label class="field" style="grid-column:1/-1"><span>Mensaje por defecto</span><textarea class="input" name="cuerpo" rows="7">${e(c.plantilla.cuerpo)}</textarea></label>
          <div class="small muted" style="grid-column:1/-1">Variables: {referencia}, {tipo}, {fecha}, {origen}, {destino}, {nombre_conductor}, {matricula}, {cliente}, {empresa}, {enlace}, {nombre_destinatario}, {enlace_txt}.</div>
          <div class="actions" style="grid-column:1/-1"><button class="btn-primary">${D.I('save')} Guardar</button></div>
        </form></div>
        <div class="card" style="padding:16px 18px;margin-top:14px"><strong>Enviar un correo de prueba</strong><div class="actions mt4"><input class="input" id="pruebaPara" type="email" placeholder="tu@correo.es" style="max-width:300px"><button class="btn-secondary" id="pruebaBtn">${D.I('mail')} Enviar prueba</button></div><div class="small muted" id="pruebaRes"></div></div>`;
      const fm = view.querySelector('#cfgCorreo');
      fm.onsubmit = async (ev) => {
        ev.preventDefault();
        const v = Object.fromEntries(new FormData(fm).entries());
        try { await D.api(`${P}/config`, { method: 'PUT', body: { ...v, plantilla: { asunto: v.asunto, cuerpo: v.cuerpo } } }); D.toast('Correo guardado'); fm.password.value = ''; } catch (x) { D.toast(x.message, true); }
      };
      view.querySelector('#pruebaBtn').onclick = async (ev) => {
        ev.target.disabled = true; view.querySelector('#pruebaRes').textContent = 'Enviando…';
        try { await D.api(`${P}/prueba`, { method: 'POST', body: { para: view.querySelector('#pruebaPara').value } }); view.querySelector('#pruebaRes').textContent = 'El servidor ha aceptado el correo de prueba. Comprueba que llega a la bandeja de entrada (o a spam).'; }
        catch (x) { view.querySelector('#pruebaRes').textContent = x.message; } finally { ev.target.disabled = false; }
      };
    },
  });

  D.extender('envio.detalle', ({ cont, doc }) => {
    if (!cont || doc.estado === 'borrador' || doc.estado === 'anulado') return;
    const b = D.accionDetalle(cont, `<button type="button" class="btn-secondary btn-small">${D.I('mail')} Enviar por correo</button>`);
    b.querySelector('button').onclick = () => abrir(doc);
  });

  async function abrir(doc) {
    let i;
    try { i = await D.api(`${P}/envios/${doc.id}`); } catch (x) { return D.toast(x.message, true); }
    const m = document.createElement('div');
    m.innerHTML = `<div class="modal-backdrop" style="z-index:9000"><div class="modal small"><div class="modal-head"><div class="modal-title">Enviar ${e(i.referencia)} por correo</div><button class="close-btn" data-x>${D.I('x')}</button></div>
      <div class="modal-body">
        ${i.configurado ? '' : `<div class="correo-error">El correo no está configurado${D.state.user?.rol === 'admin' ? ': hazlo en <a href="#correo" data-x>Correo</a>.' : '. Avisa a un administrador.'}</div>`}
        ${i.sugeridos.length ? `<div class="small muted">Destinatarios sugeridos:</div><div class="correo-sug">${i.sugeridos.map((s, n) => `<label class="correo-chk"><input type="checkbox" data-sug="${n}"> ${e(s.tipo)}: ${e(s.nombre)} &lt;${e(s.email)}&gt;</label>`).join('')}</div>` : '<div class="small muted">El conductor y el cliente no tienen correo en su ficha: escríbelo.</div>'}
        <label class="field"><span>Para (separa varios con comas)</span><input class="input" data-para></label>
        <label class="field"><span>Asunto</span><input class="input" data-asunto value="${e(i.asunto)}"></label>
        <label class="field"><span>Mensaje</span><textarea class="input" rows="6" data-cuerpo>${e(i.cuerpo)}</textarea></label>
        <label class="correo-chk"><input type="checkbox" data-enlace> Incluir también el enlace de consulta pública</label>
        ${i.extras.map((x) => `<label class="correo-chk"><input type="checkbox" data-extra="${e(x.id)}"> Adjuntar también: ${e(x.nombre)}</label>`).join('')}
        <div class="small" style="margin:8px 0">${D.I('file')} Adjunto: <a href="${e(i.url_pdf)}" target="_blank" rel="noreferrer">${e(i.archivo)}</a></div>
        ${i.historial.length ? `<div class="correo-hist"><strong class="small">Envíos anteriores</strong>${i.historial.map((h) => `<div class="small"><span class="${h.estado.startsWith('aceptado') ? 'correo-ok' : 'correo-mal'}">${e(ESTADO[h.estado] || h.estado)}</span> · ${e(h.para)} · ${e(fecha(h.fecha))} · ${e(h.usuario)}${h.error ? ` · ${e(h.error)}` : ''}</div>`).join('')}</div>` : ''}
        <div class="error" data-err></div>
      </div>
      <div class="modal-foot"><button class="btn-secondary" data-x>Cancelar</button><button class="btn-primary" data-enviar>${D.I('mail')} ${i.historial.length ? 'Reenviar' : 'Enviar'}</button></div></div></div>`;
    document.body.appendChild(m);
    const cerrar = () => m.remove();
    m.querySelectorAll('[data-x]').forEach((x) => x.addEventListener('click', cerrar));
    const para = m.querySelector('[data-para]');
    m.querySelectorAll('[data-sug]').forEach((c) => c.onchange = () => {
      const marcados = [...m.querySelectorAll('[data-sug]:checked')].map((x) => i.sugeridos[Number(x.dataset.sug)]);
      const otros = para.value.split(/[,;]+/).map((x) => x.trim()).filter((x) => x && !i.sugeridos.some((s) => s.email === x));
      para.value = [...marcados.map((s) => s.email), ...otros].join(', ');
      const unico = marcados.length === 1 ? marcados[0].nombre : '';
      m.querySelector('[data-cuerpo]').value = i.cuerpo_plantilla.replace(/\{(\w+)\}/g, (_, k) => (k === 'nombre_destinatario' ? (unico ? ` ${unico}` : '') : k === 'enlace_txt' ? '' : i.vars[k] ?? '')).replace(/\n{3,}/g, '\n\n').trim();
    });
    const sug0 = m.querySelector('[data-sug="0"]'); if (sug0) { sug0.checked = true; sug0.onchange(); }
    m.querySelector('[data-enviar]').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Enviando…'; m.querySelector('[data-err]').textContent = '';
      try {
        const r = await D.api(`${P}/envios/${doc.id}`, { method: 'POST', body: { para: para.value, asunto: m.querySelector('[data-asunto]').value, cuerpo: m.querySelector('[data-cuerpo]').value, enlace: m.querySelector('[data-enlace]').checked, extras: [...m.querySelectorAll('[data-extra]:checked')].map((x) => x.dataset.extra) } });
        D.toast(r.rechazados?.length ? `Enviado, pero el servidor rechazó: ${r.rechazados.join(', ')}` : 'El servidor de correo ha aceptado el mensaje', !!r.rechazados?.length);
        cerrar();
      } catch (x) { m.querySelector('[data-err]').textContent = x.message; b.disabled = false; b.textContent = 'Reintentar'; }
    };
  }
})();
