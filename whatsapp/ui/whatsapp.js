// Plugin «WhatsApp Web» — interfaz en Gestor DeCA y eCMR (usa window.DECA).
(function () {
  const D = window.DECA;
  if (!D) return;
  const P = '/api/p/whatsapp';
  const e = (s) => D.esc(s == null ? '' : String(s));
  const ESTADOS = { desconectado: 'Desconectado', conectando: 'Conectando…', esperando_qr: 'Esperando a que escanees el código', reconectando: 'Reconectando…', conectado: 'Conectado' };
  const ESTADO_ENVIO = { pendiente: 'Enviando…', enviado: 'Enviado (aceptado por WhatsApp)', entregado: 'Entregado en el teléfono', error: 'Error', sesion_desconectada: 'No enviado: WhatsApp desconectado' };
  const fecha = (s) => new Date(s).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const AVISO = 'WhatsApp Web no es la API oficial de Meta: puede dejar de funcionar si WhatsApp cambia su web y la sesión puede caducar y pedir volver a vincular el teléfono. Úsalo solo para enviar documentos de uno en uno.';

  // =========== Página de conexión (administradores) ===========
  D.pagina({
    id: 'whatsapp', label: 'WhatsApp', icon: 'phone', show: () => D.state.user?.rol === 'admin',
    async render(view) {
      let t = null;
      const pintar = async () => {
        if (!document.body.contains(view) || D.state.hash !== 'whatsapp') { clearTimeout(t); return; }
        const [s, c] = await Promise.all([D.api(`${P}/estado`), D.api(`${P}/config`)]);
        view.innerHTML = `${D.head('WhatsApp para documentos', 'Envía los PDF de DeCA y eCMR a los conductores desde el WhatsApp de la empresa')}
          <div class="info-note">${D.I('alert')}<div>${e(AVISO)} Esta conexión es independiente del WhatsApp que se usa para recuperar contraseñas.</div></div>
          <div class="card wa-card"><div class="wa-fila"><div><div class="small muted">Estado</div><div class="wa-estado wa-${e(s.estado)}">${e(ESTADOS[s.estado] || s.estado)}</div>
            ${s.numero ? `<div class="small">Número vinculado: <strong>+${e(s.numero)}</strong>${s.nombre ? ` (${e(s.nombre)})` : ''}</div>` : ''}
            ${s.error ? `<div class="wa-error">${e(s.error)}</div>` : ''}</div>
            <div class="actions">${s.estado === 'conectado' || s.estado === 'reconectando' ? `<button class="btn-danger" id="waDesc">${D.I('logout')} Desconectar</button>` : `<button class="btn-primary" id="waVinc">${D.I('phone')} Vincular WhatsApp</button>`}</div></div>
            ${s.qr ? `<div class="wa-qr"><div class="wa-qr-img">${s.qr}</div><ol class="small"><li>Abre WhatsApp en el teléfono de la empresa.</li><li>Ve a <strong>Ajustes › Dispositivos vinculados › Vincular un dispositivo</strong>.</li><li>Escanea este código. Se renueva solo cada poco tiempo.</li></ol></div>` : ''}
          </div>
          <div class="card wa-card"><strong>Mensaje que acompaña al PDF</strong>
            <div class="small muted" style="margin:6px 0">Variables: {nombre_conductor}, {referencia}, {fecha}, {origen}, {destino}, {matricula}, {tipo}, {empresa}. Se puede cambiar antes de cada envío.</div>
            <textarea class="input" id="waPlantilla" rows="4" style="width:100%">${e(c.plantilla)}</textarea>
            <div class="actions mt4"><button class="btn-primary" id="waGuardar">${D.I('save')} Guardar</button><button class="btn-secondary" id="waDefecto">Volver al texto por defecto</button></div></div>`;
        view.querySelector('#waVinc')?.addEventListener('click', async (ev) => { ev.target.disabled = true; try { await D.api(`${P}/vincular`, { method: 'POST', body: {} }); } catch (x) { D.toast(x.message, true); } pintar(); });
        view.querySelector('#waDesc')?.addEventListener('click', async () => { if (!confirm('¿Desconectar el WhatsApp de documentos? Habrá que volver a vincularlo con el código QR.')) return; await D.api(`${P}/desconectar`, { method: 'POST', body: {} }); D.toast('WhatsApp desconectado'); pintar(); });
        view.querySelector('#waGuardar').onclick = async () => { await D.api(`${P}/config`, { method: 'PUT', body: { plantilla: view.querySelector('#waPlantilla').value } }); D.toast('Mensaje guardado'); };
        view.querySelector('#waDefecto').onclick = () => { view.querySelector('#waPlantilla').value = c.plantilla_defecto; };
        clearTimeout(t);
        if (['conectando', 'esperando_qr', 'reconectando'].includes(s.estado)) t = setTimeout(pintar, 2500);
      };
      await pintar();
    },
  });

  // =========== Detalle del envío: botón y ventana de envío ===========
  D.extender('envio.detalle', ({ cont, doc }) => {
    if (!cont || doc.estado === 'borrador' || doc.estado === 'anulado') return;
    const b = D.accionDetalle(cont, `<button type="button" class="btn-secondary btn-small">${D.I('phone')} Enviar por WhatsApp</button>`);
    b.querySelector('button').onclick = () => abrir(doc);
  });

  async function abrir(doc) {
    let info;
    try { info = await D.api(`${P}/envios/${doc.id}`); } catch (x) { return D.toast(x.message, true); }
    const m = document.createElement('div');
    m.innerHTML = `<div class="modal-backdrop" style="z-index:9000"><div class="modal small"><div class="modal-head"><div class="modal-title">Enviar ${e(info.referencia)} por WhatsApp</div><button class="close-btn" data-cerrar>${D.I('x')}</button></div>
      <div class="modal-body">
        ${info.conexion !== 'conectado' ? `<div class="wa-error">WhatsApp no está conectado${D.state.user?.rol === 'admin' ? ': vincúlalo en <a href="#whatsapp" data-cerrar>WhatsApp</a>.' : '. Avisa a un administrador.'}</div>` : ''}
        ${info.no_enviable ? `<div class="wa-error">${e(info.no_enviable)}</div>` : ''}
        <label class="field"><span>Teléfono del destinatario</span><input class="input" data-tel value="${e(info.destinatario.telefono)}" placeholder="600 000 000 o +351…" inputmode="tel"></label>
        <div class="small muted" style="margin:-4px 0 8px">${info.destinatario.telefono ? `Conductor: ${e(info.destinatario.nombre)}` : info.destinatario.nombre ? `El conductor ${e(info.destinatario.nombre)} no tiene teléfono en su ficha: escríbelo.` : 'El envío no tiene conductor asociado: escribe el teléfono.'}</div>
        <label class="field"><span>Mensaje</span><textarea class="input" data-texto rows="5">${e(info.texto)}</textarea></label>
        ${(info.extras || []).map((x) => `<label class="wa-extra"><input type="checkbox" data-extra="${e(x.id)}"> Enviar también: ${e(x.nombre)}</label>`).join('')}
        <div class="wa-adjunto">${D.I('file')} <a href="${e(info.url_pdf)}" target="_blank" rel="noreferrer">${e(info.archivo)}</a> <span class="small muted">(PDF oficial del documento)</span></div>
        <div class="small muted">${e(AVISO)}</div>
        ${info.historial.length ? `<div class="wa-hist"><strong class="small">Envíos anteriores</strong>${info.historial.map((h) => `<div class="small"><span class="wa-est wa-e-${e(h.estado)}">${e(ESTADO_ENVIO[h.estado] || h.estado)}</span> · +${e(h.telefono)} · ${e(fecha(h.fecha))} · ${e(h.usuario)}${h.error ? ` · <span class="wa-error-t">${e(h.error)}</span>` : ''}</div>`).join('')}</div>` : ''}
        <div class="error" data-err></div>
      </div>
      <div class="modal-foot"><button class="btn-secondary" data-cerrar>Cancelar</button><button class="btn-primary" data-enviar ${info.no_enviable ? 'disabled' : ''}>${D.I('phone')} ${info.historial.length ? 'Enviar de nuevo' : 'Enviar'}</button></div></div></div>`;
    document.body.appendChild(m);
    const cerrar = () => m.remove();
    m.querySelectorAll('[data-cerrar]').forEach((x) => x.addEventListener('click', cerrar));
    m.querySelector('[data-enviar]').onclick = async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Enviando…';
      m.querySelector('[data-err]').textContent = '';
      try {
        await D.api(`${P}/envios/${doc.id}`, { method: 'POST', body: { telefono: m.querySelector('[data-tel]').value, texto: m.querySelector('[data-texto]').value, destinatario: info.destinatario.nombre, extras: [...m.querySelectorAll('[data-extra]:checked')].map((x) => x.dataset.extra) } });
        D.toast('Enviado: WhatsApp ha aceptado el mensaje');
        cerrar();
      } catch (x) { m.querySelector('[data-err]').textContent = x.message; btn.disabled = false; btn.textContent = 'Reintentar'; }
    };
  }
})();
