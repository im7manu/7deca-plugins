// Plugin «Calendario (.ics)»: botón en el envío y página para exportar varios.
(function () {
  const D = window.DECA;
  if (!D) return;
  const P = '/api/p/calendario';
  D.extender('envio.detalle', ({ cont, doc }) => {
    if (!cont) return;
    D.accionDetalle(cont, `<a class="btn-secondary btn-small" href="${P}/envio/${doc.id}.ics" title="Descarga un evento para tu calendario">${D.I('clock')} Calendario (.ics)</a>`);
  });
  D.pagina({
    id: 'calendario', label: 'Calendario', icon: 'clock', show: () => D.perm('deca_ver') || D.perm('deca_crear') || D.perm('ecmr_ver') || D.perm('ecmr_crear'),
    render(view) {
      const hoy = new Date().toLocaleDateString('sv-SE');
      view.innerHTML = `${D.head('Calendario', 'Exporta los transportes a tu calendario (Apple, Google, Outlook…)')}
        <div class="info-note">${D.I('clock')}<div>Se descarga un archivo .ics que puedes abrir o importar en tu calendario. Los documentos solo tienen fecha, así que los eventos son de día completo. No se conecta con ninguna cuenta.</div></div>
        <div class="card" style="padding:16px 18px"><div class="grid grid2">
          <label class="field"><span>Desde</span><input class="input" type="date" id="calDesde" value="${hoy}"></label>
          <label class="field"><span>Hasta (opcional)</span><input class="input" type="date" id="calHasta"></label>
          <label class="field"><span>Tipo</span><select class="select" id="calTipo"><option value="">DeCA y eCMR</option><option value="deca">Solo DeCA</option><option value="ecmr">Solo eCMR</option></select></label>
        </div>
        <label class="small" style="display:flex;gap:6px;margin:8px 0"><input type="checkbox" id="calBorr"> Incluir borradores</label>
        <label class="small" style="display:flex;gap:6px;margin:8px 0"><input type="checkbox" id="calAnul"> Incluir anulados (aparecen como cancelados)</label>
        <div class="actions"><a class="btn-primary" id="calDesc">${D.I('clock')} Descargar .ics</a><span class="small muted" id="calN"></span></div></div>`;
      const url = (extra = '') => `${P}/envios.ics?desde=${view.querySelector('#calDesde').value}&hasta=${view.querySelector('#calHasta').value}&tipo=${view.querySelector('#calTipo').value}&borradores=${view.querySelector('#calBorr').checked ? 1 : 0}&anulados=${view.querySelector('#calAnul').checked ? 1 : 0}${extra}`;
      const contar = async () => { view.querySelector('#calDesc').href = url(); const r = await D.api(url('&contar=1')).catch(() => null); view.querySelector('#calN').textContent = r ? `${r.total} transporte(s)` : ''; };
      view.querySelectorAll('input, select').forEach((x) => x.addEventListener('change', contar));
      contar();
    },
  });
})();
