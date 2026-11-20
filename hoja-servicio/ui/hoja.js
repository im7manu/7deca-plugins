// Plugin «Hoja de servicio»: botones en el detalle del envío.
(function () {
  const D = window.DECA;
  if (!D) return;
  D.extender('envio.detalle', ({ cont, doc }) => {
    if (!cont || doc.estado === 'anulado') return;
    const b = D.accionDetalle(cont, `<button type="button" class="btn-secondary btn-small" data-ver title="Hoja operativa para el conductor (no sustituye al documento oficial). Para enviarla, usa WhatsApp o correo y marca «Enviar también».">${D.I('file')} Hoja de servicio</button>`);
    b.querySelector('[data-ver]').onclick = () => window.open(`/api/p/hoja-servicio/hoja/${doc.id}.pdf`, '_blank');
  });
})();
