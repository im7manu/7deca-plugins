// Plugin «7Ruta» — interfaz dentro de 7DeCA (usa window.DECA y window.RutasMapa).
(function () {
  const D = window.DECA;
  if (!D) return;
  const P = '/api/p/rutas';
  const e = (s) => D.esc(s == null ? '' : String(s));
  let cfg = null;
  const config = async (forzar) => (cfg && !forzar ? cfg : (cfg = await D.api(`${P}/config`)));
  const km = (n) => `${Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
  const dur = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`);
  const nombreProv = (p) => (p === 'google' ? 'Google Maps' : 'OpenRouteService');
  const textoOpc = (o = {}) => [o.perfil === 'coche' ? 'turismo' : 'camión', o.evitar_peajes && 'sin peajes', o.evitar_autopistas && 'sin autopistas', o.evitar_ferris && 'sin ferris'].filter(Boolean).join(', ');

  function opcionesHtml(o, pref = 'r') {
    return `<div class="rutas-opc">
      <label class="field"><span>Vehículo</span><select class="select" data-${pref}="perfil"><option value="camion" ${o.perfil !== 'coche' ? 'selected' : ''}>Camión (restricciones de peso y altura)</option><option value="coche" ${o.perfil === 'coche' ? 'selected' : ''}>Turismo / furgoneta</option></select></label>
      <label class="rutas-check"><input type="checkbox" data-${pref}="evitar_peajes" ${o.evitar_peajes ? 'checked' : ''}> Evitar peajes</label>
      <label class="rutas-check"><input type="checkbox" data-${pref}="evitar_autopistas" ${o.evitar_autopistas ? 'checked' : ''}> Evitar autopistas y autovías</label>
      <label class="rutas-check"><input type="checkbox" data-${pref}="evitar_ferris" ${o.evitar_ferris ? 'checked' : ''}> Evitar ferris</label>
    </div>`;
  }
  const leerOpciones = (raiz, pref = 'r') => {
    const v = (k) => raiz.querySelector(`[data-${pref}="${k}"]`);
    return { perfil: v('perfil').value, evitar_peajes: v('evitar_peajes').checked, evitar_autopistas: v('evitar_autopistas').checked, evitar_ferris: v('evitar_ferris').checked };
  };

  // =====================================================================
  // Página de configuración (administradores)
  // =====================================================================
  D.pagina({
    id: 'mapas-rutas', label: 'Mapas y rutas', icon: 'map', show: () => D.state.user?.rol === 'admin',
    async render(view) {
      const c = await config(true);
      const o = c.opciones, cam = o.camion;
      view.innerHTML = `${D.head('Mapas y rutas', 'Proveedor de mapas, opciones de ruta por defecto y cálculo de kilómetros')}
      <div class="card"><form id="rutasCfg" class="rutas-cfg">
        <h3>Proveedor de mapas</h3>
        <label class="rutas-radio"><input type="radio" name="proveedor" value="ors" ${c.proveedor !== 'google' ? 'checked' : ''}> <span><strong>OpenRouteService</strong> (recomendado) — gratis, con rutas para camión. Mapa de OpenStreetMap.</span></label>
        <label class="rutas-radio"><input type="radio" name="proveedor" value="google" ${c.proveedor === 'google' ? 'checked' : ''}> <span><strong>Google Maps</strong> — con tu propia clave de Google Cloud (necesita una cuenta de facturación; Google incluye un uso mensual gratuito). No tiene rutas para camión.</span></label>
        <div data-prov="ors" class="rutas-bloque">
          <ol class="small muted"><li>Crea una cuenta gratuita en <a href="https://account.heigit.org" target="_blank" rel="noreferrer">account.heigit.org</a> (OpenRouteService).</li><li>Copia tu clave de API y pégala aquí.</li></ol>
          <label class="field"><span>Clave de OpenRouteService</span><input class="input" type="password" name="ors_clave" autocomplete="off" placeholder="${c.ors?.tiene_clave ? 'Guardada (déjalo vacío para mantenerla)' : 'Pega aquí tu clave'}"></label>
          <details class="small"><summary>Direcciones del servicio (avanzado)</summary>
            <label class="field"><span>Rutas</span><input class="input" name="ors_base_ruta" value="${e(c.ors?.base_ruta)}"></label>
            <label class="field"><span>Búsqueda de direcciones</span><input class="input" name="ors_base_geo" value="${e(c.ors?.base_geo)}"></label>
          </details>
          <div class="small muted">Sin clave, las direcciones se buscan con OpenStreetMap (Nominatim), pero las rutas necesitan la clave.</div>
        </div>
        <div data-prov="google" class="rutas-bloque">
          <ol class="small muted"><li>En <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noreferrer">Google Cloud</a>, activa <em>Routes API</em>, <em>Geocoding API</em> y <em>Maps JavaScript API</em>.</li><li>Crea una <strong>clave de servidor</strong> (restríngela a esas API y a la IP del servidor) y una <strong>clave de navegador</strong> (restríngela a la dirección de este gestor).</li></ol>
          <label class="field"><span>Clave de servidor (rutas y direcciones)</span><input class="input" type="password" name="google_clave_servidor" autocomplete="off" placeholder="${c.google?.tiene_clave_servidor ? 'Guardada (déjalo vacío para mantenerla)' : 'AIza…'}"></label>
          <label class="field"><span>Clave de navegador (para ver el mapa)</span><input class="input" name="google_clave_navegador" autocomplete="off" value="${e(c.google?.clave_navegador)}" placeholder="AIza…"></label>
        </div>
        <h3>Opciones de ruta por defecto</h3>
        ${opcionesHtml(o)}
        <div class="rutas-camion grid grid2">
          <label class="field"><span>Peso máximo (t)</span><input class="input" type="number" step="0.5" name="peso_t" value="${cam.peso_t}"></label>
          <label class="field"><span>Altura (m)</span><input class="input" type="number" step="0.05" name="altura_m" value="${cam.altura_m}"></label>
          <label class="field"><span>Anchura (m)</span><input class="input" type="number" step="0.05" name="ancho_m" value="${cam.ancho_m}"></label>
          <label class="field"><span>Longitud (m)</span><input class="input" type="number" step="0.1" name="largo_m" value="${cam.largo_m}"></label>
          <label class="field"><span>Carga por eje (t)</span><input class="input" type="number" step="0.5" name="eje_t" value="${cam.eje_t}"></label>
        </div>
        <label class="rutas-check"><input type="checkbox" name="auto" ${c.auto ? 'checked' : ''}> Calcular la ruta automáticamente al guardar un envío que no la tenga</label>
        <div class="rutas-acciones"><button class="btn-primary" type="submit">${D.I('save')} Guardar</button><button class="btn-secondary" type="button" id="rutasProbar">${D.I('check')} Probar conexión</button><span id="rutasEstado" class="small muted"></span></div>
      </form></div>`;
      const f = view.querySelector('#rutasCfg');
      const prov = () => f.querySelector('[name=proveedor]:checked').value;
      const pintar = () => {
        f.querySelectorAll('[data-prov]').forEach((b) => { b.hidden = b.dataset.prov !== prov(); });
        f.querySelector('.rutas-camion').hidden = f.querySelector('[data-r=perfil]').value !== 'camion';
      };
      f.addEventListener('change', pintar); pintar();
      const guardar = async () => {
        const v = (n) => f.querySelector(`[name=${n}]`).value;
        await D.api(`${P}/config`, { method: 'PUT', body: {
          proveedor: prov(), auto: f.querySelector('[name=auto]').checked,
          ors: { clave: v('ors_clave'), base_ruta: v('ors_base_ruta'), base_geo: v('ors_base_geo') },
          google: { clave_servidor: v('google_clave_servidor'), clave_navegador: v('google_clave_navegador') },
          opciones: { ...leerOpciones(f), camion: { peso_t: v('peso_t'), altura_m: v('altura_m'), ancho_m: v('ancho_m'), largo_m: v('largo_m'), eje_t: v('eje_t') } },
        } });
        f.querySelector('[name=ors_clave]').value = ''; f.querySelector('[name=google_clave_servidor]').value = '';
        await config(true);
      };
      f.onsubmit = async (ev) => { ev.preventDefault(); try { await guardar(); D.toast('Configuración de mapas guardada'); D.go('mapas-rutas'); } catch (x) { D.toast(x.message, true); } };
      view.querySelector('#rutasProbar').onclick = async () => {
        const est = view.querySelector('#rutasEstado');
        est.textContent = 'Probando…';
        try { await guardar(); const r = await D.api(`${P}/probar`, { method: 'POST', body: {} }); est.textContent = `Funciona: ruta de prueba de ${km(r.km)} con ${nombreProv(r.proveedor)}.`; }
        catch (x) { est.textContent = x.message; }
      };
    },
  });

  // =====================================================================
  // Autocompletar direcciones mientras se escribe (ubicaciones, empresas, contraparte y Mi entidad)
  // Al elegir un resultado se rellenan la dirección, el código postal, la población y la provincia del mismo formulario,
  // y se avisa con el evento «rutas:direccion» (lo usa el mapa de la ubicación).
  // =====================================================================
  const CAMPOS_DIR = 'input[name=direccion], input[name=domicilio], input[name=contraparte_direccion]';
  let lista = null, activo = null;
  const cerrarLista = () => { lista?.remove(); lista = null; activo = null; };
  document.addEventListener('scroll', (ev) => { if (lista && !lista.contains(ev.target)) cerrarLista(); }, true);
  window.addEventListener('resize', cerrarLista);

  function rellenar(input, r) {
    const form = input.form || input.closest('form');
    const completa = input.name === 'contraparte_direccion' || !form?.querySelector('[name=cp]');
    const poner = (nombre, valor) => {
      const el = form?.querySelector(`[name=${nombre}]`);
      if (!el || !valor) return;
      el.value = valor; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const calle = r.calle || (r.fuente === 'coordenadas' ? input.value : '');
    input.value = completa ? [calle, [r.cp, r.ciudad].filter(Boolean).join(' '), r.provincia !== r.ciudad ? r.provincia : ''].filter(Boolean).join(', ') : calle || input.value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    if (!completa) { poner('cp', r.cp); poner('ciudad', r.ciudad); poner('provincia', r.provincia); }
    form?.dispatchEvent(new CustomEvent('rutas:direccion', { detail: r }));
  }

  function autocompletar(input) {
    if (input.dataset.rutasAc) return;
    input.dataset.rutasAc = '1';
    input.setAttribute('autocomplete', 'off');
    let t = null, n = 0, res = [], idx = -1;
    const pintar = () => {
      if (!res.length || document.activeElement !== input) { if (activo === input) cerrarLista(); return; }
      if (!lista || activo !== input) { cerrarLista(); lista = document.createElement('div'); lista.className = 'rutas-ac'; lista.setAttribute('role', 'listbox'); document.body.appendChild(lista); activo = input; }
      const b = input.getBoundingClientRect();
      Object.assign(lista.style, { left: `${b.left}px`, top: `${b.bottom + 2}px`, width: `${Math.max(b.width, 320)}px` });
      lista.innerHTML = res.map((r, i) => `<div class="rutas-ac-op${i === idx ? ' on' : ''}" role="option" data-i="${i}">${D.I('pin', 14)}<div><div>${e(r.calle || r.etiqueta)}</div><div class="rutas-ac-sub">${e([r.cp, r.ciudad, r.provincia !== r.ciudad ? r.provincia : ''].filter(Boolean).join(' · ') || r.etiqueta)}</div></div></div>`).join('')
        + '<div class="rutas-ac-pie">Elige una dirección para rellenar el resto de campos</div>';
      lista.querySelectorAll('[data-i]').forEach((o) => o.addEventListener('mousedown', (ev) => { ev.preventDefault(); elegir(Number(o.dataset.i)); }));
    };
    const elegir = (i) => { const r = res[i]; if (!r) return; res = []; cerrarLista(); rellenar(input, r); };
    input.addEventListener('input', (ev) => {
      if (!ev.isTrusted) return; // cambios hechos por código (p. ej. al rellenar)
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 3) { res = []; pintar(); return; }
      t = setTimeout(async () => {
        const mio = ++n;
        try {
          const r = await D.api(`${P}/sugerir?q=${encodeURIComponent(q)}`);
          if (mio !== n) return;
          res = r.resultados || []; idx = -1; pintar();
        } catch { /* sin conexión con el servicio: se escribe a mano */ }
      }, 300);
    });
    input.addEventListener('keydown', (ev) => {
      if (activo !== input || !res.length) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); idx = (idx + (ev.key === 'ArrowDown' ? 1 : -1) + res.length) % res.length; pintar(); }
      else if (ev.key === 'Enter' && idx >= 0) { ev.preventDefault(); elegir(idx); }
      else if (ev.key === 'Escape') { res = []; cerrarLista(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (activo === input) cerrarLista(); }, 150));
  }
  const engancharDirecciones = (raiz) => raiz.querySelectorAll?.(CAMPOS_DIR).forEach(autocompletar);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((nodo) => { if (nodo.nodeType === 1) { if (nodo.matches?.(CAMPOS_DIR)) autocompletar(nodo); engancharDirecciones(nodo); } })))
    .observe(document.body, { childList: true, subtree: true });
  engancharDirecciones(document);

  // =====================================================================
  // Ubicaciones: posición en el mapa (de la dirección elegida, de coordenadas o pulsando en el mapa)
  // =====================================================================
  D.extender('ubicacion.form', async ({ form, cont: hueco, ubicacion }) => {
    const c = await config().catch(() => null);
    if (!c || !hueco) return;
    const cont = hueco.appendChild(document.createElement('div'));
    form.closest('.modal')?.classList.remove('small');
    const guardadas = ubicacion.id ? await D.api(`${P}/ubicaciones`).catch(() => []) : [];
    const g = guardadas.find((x) => x.id === ubicacion.id);
    cont.innerHTML = `<div class="rutas-ubi">
      <div class="rutas-ubi-cab">${D.I('map')} <strong>Posición en el mapa</strong> <span class="small muted">Al escribir la dirección, elige una de las sugerencias. También puedes pulsar en el mapa o poner coordenadas.</span></div>
      <div class="rutas-mapa" data-mapa></div>
      <div class="rutas-coord"><label class="field"><span>Coordenadas</span><input class="input" data-coord placeholder="40.4168, -3.7038" autocomplete="off"></label><span class="small muted" data-estado></span></div>
      <input type="hidden" name="rutas_lat" value="${g ? g.lat : ''}"><input type="hidden" name="rutas_lon" value="${g ? g.lon : ''}">
      <input type="hidden" name="rutas_etiqueta" value="${e(g?.etiqueta || '')}"><input type="hidden" name="rutas_fuente" value="${e(g?.fuente || '')}">
    </div>`;
    const $ = (s) => cont.querySelector(s);
    const mapa = await window.RutasMapa.crear($('[data-mapa]'), c);
    const poner = (lat, lon, etiqueta, fuente) => {
      form.querySelector('[name=rutas_lat]').value = lat; form.querySelector('[name=rutas_lon]').value = lon;
      form.querySelector('[name=rutas_etiqueta]').value = etiqueta || ''; form.querySelector('[name=rutas_fuente]').value = fuente || 'manual';
      $('[data-coord]').value = `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
      mapa.puntos([{ lat, lon, etiqueta }]);
      $('[data-estado]').textContent = etiqueta || '';
    };
    if (g) poner(g.lat, g.lon, g.etiqueta, g.fuente);
    else $('[data-estado]').textContent = 'Sin posición. Si no eliges ninguna sugerencia, se buscará la dirección al guardar.';
    form.addEventListener('rutas:direccion', (ev) => { const r = ev.detail; poner(r.lat, r.lon, r.etiqueta, r.fuente); });
    mapa.alClic((lat, lon) => poner(lat, lon, 'Punto elegido en el mapa', 'manual'));
    const coord = () => {
      const m = $('[data-coord]').value.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
      if (!m) { if ($('[data-coord]').value.trim()) $('[data-estado]').textContent = 'Escribe las coordenadas como «latitud, longitud» (p. ej. 40.4168, -3.7038).'; return; }
      const lat = Number(m[1].replace(',', '.')), lon = Number(m[2].replace(',', '.'));
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { $('[data-estado]').textContent = 'Coordenadas fuera de rango.'; return; }
      poner(lat, lon, 'Coordenadas escritas a mano', 'coordenadas');
    };
    $('[data-coord]').addEventListener('change', coord);
    $('[data-coord]').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); coord(); } });
  });

  D.extender('ubicaciones.lista', async ({ view }) => {
    const con = new Set((await D.api(`${P}/ubicaciones`).catch(() => [])).map((x) => String(x.id)));
    view.querySelectorAll('[data-ubicacion]').forEach((t) => {
      const meta = t.querySelector('.tile-meta');
      if (meta) meta.insertAdjacentHTML('beforeend', con.has(t.dataset.ubicacion) ? `<span class="rutas-ok">${D.I('pin', 12)} En el mapa</span>` : '<span class="rutas-no">Sin posición</span>');
    });
  });

  // =====================================================================
  // Formulario de envío: vista previa de la ruta y km
  // =====================================================================
  D.extender('envio.form', async ({ form, cont: hueco, estado }) => {
    const c = await config().catch(() => null);
    if (!c || !hueco) return;
    const cont = hueco.appendChild(document.createElement('div'));
    const r = (estado.__ruta ||= { opciones: { ...c.opciones }, res: null, km: '', firma: '' });
    cont.innerHTML = `<section class="card form-card rutas-panel"><div class="form-card-head"><strong>Ruta y kilómetros</strong></div><div class="form-card-body">
      ${c.configurado ? '' : `<div class="rutas-aviso">Falta configurar el proveedor de mapas${D.state.user?.rol === 'admin' ? ' en <a href="#mapas-rutas">Mapas y rutas</a>' : ' (avisa al administrador)'}. Puedes poner los km a mano.</div>`}
      ${opcionesHtml(r.opciones, 'env')}
      <div class="rutas-acciones"><button type="button" class="btn-secondary" data-calc ${c.configurado ? '' : 'disabled'}>${D.I('route')} Calcular ruta</button><span class="small muted" data-msg></span></div>
      <div class="rutas-mapa" data-mapa hidden></div>
      <div class="rutas-resumen" data-resumen></div>
      <div class="grid grid2"><label class="field"><span>Km a facturar</span><input class="input" type="number" min="0" step="0.1" data-km value="${e(r.km)}" placeholder="Se rellena al calcular la ruta"></label></div>
      <input type="hidden" name="_ruta" value="">
    </div></section>`;
    const $ = (s) => cont.querySelector(s);
    let mapa = null;
    const textos = () => [form.querySelector('[name=origen]')?.value, ...[...form.querySelectorAll('[data-dest]')].map((i) => i.value)].map((x) => String(x || '').trim()).filter(Boolean);
    const oculto = () => {
      const kmv = $('[data-km]').value;
      if (kmv === '' || !(Number(kmv) >= 0)) { $('[name=_ruta]').value = ''; return; }
      const x = r.res;
      $('[name=_ruta]').value = JSON.stringify(x ? { km: Number(kmv), km_calculado: x.km, minutos: x.minutos, proveedor: x.proveedor, opciones: x.opciones, puntos: x.puntos.map((p) => ({ lat: p.lat, lon: p.lon, etiqueta: p.etiqueta })), linea: x.linea } : { km: Number(kmv), km_calculado: null });
    };
    const pintar = async () => {
      const x = r.res;
      if (!x) { $('[data-resumen]').innerHTML = ''; oculto(); return; }
      $('[data-mapa]').hidden = false;
      if (!mapa) mapa = await window.RutasMapa.crear($('[data-mapa]'), c);
      mapa.puntos(x.puntos); mapa.linea(x.linea);
      const editado = r.km !== '' && Number(r.km) !== x.km;
      $('[data-resumen]').innerHTML = `<strong>${km(x.km)}</strong> · ${dur(x.minutos)} · ${nombreProv(x.proveedor)} (${textoOpc(x.opciones)})${editado ? ' · <span class="rutas-no">km corregidos a mano</span>' : ''}
        ${x.avisos?.length ? `<div class="rutas-aviso">${x.avisos.map(e).join('<br>')}</div>` : ''}
        <div class="small muted">${x.puntos.map((p, i) => `${i + 1}. ${e(p.etiqueta)}${p.fuente === 'ubicacion' ? '' : p.fuente === 'coordenadas' ? ' (coordenadas)' : ' (dirección buscada)'}`).join(' → ')}</div>`;
      oculto();
    };
    const calcular = async () => {
      const t = textos();
      if (t.length < 2) { $('[data-msg]').textContent = 'Indica el lugar de carga y al menos un destino.'; return; }
      r.opciones = leerOpciones(cont, 'env');
      $('[data-msg]').textContent = 'Calculando…'; $('[data-calc]').disabled = true;
      try {
        const kmAntes = r.res?.km;
        r.res = await D.api(`${P}/ruta`, { method: 'POST', body: { textos: t, opciones: r.opciones } });
        r.firma = JSON.stringify([t, r.opciones]);
        if (r.km === '' || Number(r.km) === kmAntes) r.km = String(r.res.km);
        $('[data-km]').value = r.km;
        $('[data-msg]').textContent = '';
        await pintar();
      } catch (x) { $('[data-msg]').textContent = x.message; } finally { $('[data-calc]').disabled = !c.configurado; }
    };
    $('[data-calc]').onclick = calcular;
    $('[data-km]').addEventListener('input', () => { r.km = $('[data-km]').value; pintar(); });
    cont.addEventListener('change', (ev) => { if (ev.target.matches('[data-env]')) { r.opciones = leerOpciones(cont, 'env'); if (r.res) calcular(); } });
    // Recalcular solo cuando cambian los lugares (sin gastar peticiones mientras se escribe)
    let t = null;
    form.addEventListener('change', (ev) => {
      if (!c.configurado || !c.auto || !(ev.target.name === 'origen' || ev.target.matches('[data-dest]'))) return;
      clearTimeout(t);
      t = setTimeout(() => { const tx = textos(); if (tx.length >= 2 && JSON.stringify([tx, r.opciones]) !== r.firma) calcular(); }, 800);
    });
    await pintar();
  });

  // =====================================================================
  // Detalle del envío: km guardados, mapa, corrección y recálculo
  // =====================================================================
  D.extender('envio.detalle', async ({ cont: hueco, doc }) => {
    if (!hueco) return;
    const c = await config().catch(() => null);
    if (!c) return;
    const cont = hueco.insertBefore(document.createElement('div'), hueco.firstChild);
    const puede = D.perm(`${doc.tipo}_crear`) && ['borrador', 'emitido'].includes(doc.estado);
    const pintar = async (ruta) => {
      cont.innerHTML = `<div class="rutas-detalle"><div class="rutas-ubi-cab">${D.I('route')} <strong>Ruta</strong>
        ${ruta?.km != null ? `<span><strong>${km(ruta.km)}</strong>${ruta.km_calculado != null && ruta.manual ? ` <span class="rutas-no">(calculados ${km(ruta.km_calculado)}, corregidos a mano)</span>` : ''} · ${dur(ruta.minutos)} ${ruta.opciones?.perfil ? `· ${textoOpc(ruta.opciones)}` : ''}</span>` : `<span class="small muted">${ruta?.error ? e(ruta.error) : 'Sin ruta calculada'}</span>`}</div>
        ${ruta?.revisar ? '<div class="rutas-aviso">Han cambiado los lugares de carga o descarga después de corregir los km a mano. Revisa los km o recalcula la ruta.</div>' : ''}
        <div class="rutas-acciones">${ruta?.linea?.length ? `<button type="button" class="btn-ghost btn-small" data-ver>${D.I('map')} Ver en el mapa</button>` : ''}
        ${puede ? `<button type="button" class="btn-secondary btn-small" data-editar>${D.I('edit')} Corregir km</button>${c.configurado ? `<button type="button" class="btn-secondary btn-small" data-recalc>${D.I('route')} ${ruta?.km != null ? 'Recalcular' : 'Calcular ruta'}</button>` : ''}` : ''}</div>
        <div class="rutas-mapa" data-mapa hidden></div></div>`;
      cont.querySelector('[data-ver]')?.addEventListener('click', async (ev) => {
        ev.target.closest('button').remove();
        const m = cont.querySelector('[data-mapa]'); m.hidden = false;
        const mapa = await window.RutasMapa.crear(m, c); mapa.puntos(ruta.puntos || []); mapa.linea(ruta.linea);
      });
      cont.querySelector('[data-editar]')?.addEventListener('click', async () => {
        const v = prompt('Km a facturar para este envío:', ruta?.km ?? '');
        if (v === null) return;
        try { pintar((await D.api(`${P}/envios/${doc.id}/km`, { method: 'PUT', body: { km: Number(String(v).replace(',', '.')) } })).ruta); D.toast('Km guardados'); } catch (x) { D.toast(x.message, true); }
      });
      cont.querySelector('[data-recalc]')?.addEventListener('click', async (ev) => {
        ev.target.closest('button').disabled = true;
        try { pintar((await D.api(`${P}/envios/${doc.id}/recalcular`, { method: 'POST', body: { opciones: ruta?.opciones?.perfil ? ruta.opciones : undefined } })).ruta); D.toast('Ruta calculada'); }
        catch (x) { D.toast(x.message, true); ev.target.closest('button').disabled = false; }
      });
    };
    try { pintar((await D.api(`${P}/envios/${doc.id}`)).ruta); } catch { /* sin permiso o sin datos */ }
  });
})();
