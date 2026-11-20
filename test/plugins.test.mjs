// Plugins de 7DeCA contra un 7DeCA real (../gestor-deca-ecmr) con datos temporales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { smtpSink } from './smtp-sink.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DECA = path.resolve(RAIZ, '../gestor-deca-ecmr');
const EX = ['--exclude=test', '--exclude=.bin', '--exclude=node_modules/@img', '--exclude=node_modules/sharp', '--exclude=node_modules/@types', '--exclude=*.d.ts', '--exclude=*.map'];
const paquete = (id) => { const f = path.join(os.tmpdir(), `${id}-${Date.now()}.tar.gz`); execFileSync('tar', ['-czf', f, ...EX, '-C', path.join(RAIZ, id), '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } }); return fs.readFileSync(f); };

async function arrancar(dir, puerto) {
  const srv = spawn(process.execPath, ['server.js'], { cwd: DECA, env: { ...process.env, PORT: String(puerto), HOST: '127.0.0.1', DECA_DATA: dir, BASE_URL: `http://127.0.0.1:${puerto}`, WHATSAPP_API: '', DECA_SUPERVISADO: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  await new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error(log)), 15000); srv.stdout.on('data', () => { if (log.includes('activo en')) { clearTimeout(t); ok(); } }); });
  return srv;
}
function cliente(base) {
  let cookie = '';
  return async (m, ruta, cuerpo) => {
    const bin = Buffer.isBuffer(cuerpo);
    const r = await fetch(base + ruta, { method: m, headers: { 'Content-Type': bin ? 'application/gzip' : 'application/json', Cookie: cookie }, body: cuerpo === undefined ? undefined : bin ? cuerpo : JSON.stringify(cuerpo) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = r.headers.get('content-type') || '';
    return { status: r.status, body: t.includes('json') ? await r.json() : await r.text(), headers: r.headers };
  };
}

test('plugins de 7DeCA', { skip: !fs.existsSync(path.join(DECA, 'plugins.js')) && 'falta ../gestor-deca-ecmr 1.5.0' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deca-plugins-'));
  const P = 9341, BASE = `http://127.0.0.1:${P}`;
  const srv = await arrancar(dir, P);
  const sink = await smtpSink(2526);
  const api = cliente(BASE);
  const ok = async (pr, msg) => { const r = await pr; assert.ok(r.status < 400, `${msg}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  try {
    await ok(api('POST', '/api/setup', { usuario: 'admin', nombre: 'Admin', clave: 'Contrasena123!', claveConfirm: 'Contrasena123!', empresa_nombre: 'Transportes Prueba', empresa_nif: 'B12345674' }), 'setup');
    for (const id of ['rutas', 'whatsapp', 'correo', 'hoja-servicio', 'calendario', 'plantillas', 'copias']) await ok(api('POST', '/api/plugins/subir', paquete(id)), `instalar ${id}`);
    await ok(api('POST', '/api/empresas', { nombre: 'Cliente SA', nif: 'A06111222', tipo: 'Cliente', email: 'cliente@ejemplo.test' }), 'empresa');
    await ok(api('POST', '/api/conductores', { nombre: 'Juan', dni: '12345678Z', telefono: '600111222', email: 'juan@ejemplo.test' }), 'conductor');
    const emp = (await ok(api('GET', '/api/empresas'), 'emps'))[0];
    const d = await ok(api('POST', '/api/docs', { tipo: 'deca', estado: 'emitido', datos: { contraparte_id: emp.id, destinatario: 'Obra', matricula: '1234 KLM', origen: 'Cantera', destinos: ['Obra'], f_carga: '2026-11-25', mercancia: 'Zahorra', peso: 24000, conductor_nombre: 'Juan', conductor_dni: '12345678Z', instrucciones: 'Llamar al llegar' } }), 'doc');

    // WhatsApp: sesión propia, sin conexión no envía; nunca toca WHATSAPP_API
    const wa = await ok(api('GET', '/api/p/whatsapp/estado'), 'wa');
    assert.equal(wa.estado, 'desconectado');
    const prep = await ok(api('GET', `/api/p/whatsapp/envios/${d.id}`), 'wa prep');
    assert.equal(prep.destinatario.telefono, '600111222');
    assert.match(prep.texto, /Juan/);
    assert.ok(prep.extras.some((x) => x.id === 'hoja-servicio'));
    assert.equal((await api('POST', `/api/p/whatsapp/envios/${d.id}`, { telefono: '600111222', texto: 'x' })).status, 409);

    // Correo
    await ok(api('PUT', '/api/p/correo/config', { host: '127.0.0.1', puerto: 2526, seguridad: 'ninguna', usuario: 'u', password: 'no-mostrar', desde: 'trafico@ejemplo.test' }), 'correo cfg');
    assert.ok(!JSON.stringify(await ok(api('GET', '/api/p/correo/config'), 'cfg')).includes('no-mostrar'));
    const cp = await ok(api('GET', `/api/p/correo/envios/${d.id}`), 'correo prep');
    assert.deepEqual(cp.sugeridos.map((s) => s.email).sort(), ['cliente@ejemplo.test', 'juan@ejemplo.test']);
    const env = await ok(api('POST', `/api/p/correo/envios/${d.id}`, { para: 'juan@ejemplo.test', asunto: cp.asunto, cuerpo: cp.cuerpo, enlace: true, extras: ['hoja-servicio'] }), 'enviar');
    assert.equal(env.estado, 'aceptado');
    assert.equal((sink.mensajes.at(-1).cuerpo.match(/Content-Disposition: attachment/g) || []).length, 2);

    // Hoja de servicio y calendario
    const hoja = await api('GET', `/api/p/hoja-servicio/hoja/${d.id}.pdf`);
    assert.equal(hoja.status, 200);
    const ics = await ok(api('GET', `/api/p/calendario/envio/${d.id}.ics`), 'ics');
    assert.match(ics, /DTSTART;VALUE=DATE:20261125/);
    assert.match(ics, /Hora no indicada/);

    // Plantillas: sin datos propios del viaje
    await ok(api('POST', `/api/p/plantillas/desde-envio/${d.id}`, { nombre: 'Cantera → Obra', preferidos: true }), 'plantilla');
    const [pl] = await ok(api('GET', '/api/p/plantillas/plantillas'), 'plantillas');
    for (const k of ['peso', 'f_carga', 'nalbaran', 'matricula']) assert.ok(!(k in pl.datos), `la plantilla no guarda ${k}`);
    assert.equal(pl.preferidos.matricula, '1234 KLM');

    // Copias: crear y comprobar; carpeta fuera de los datos rechazada
    const c = await ok(api('POST', '/api/p/copias/crear', {}), 'copia');
    assert.equal(c.valida, true);
    assert.equal(c.documentos, 1);
    assert.equal((await api('PUT', '/api/p/copias/config', { carpeta: '../fuera' })).status, 400);
    const rest = await api('POST', `/api/p/copias/copias/${c.id}/restaurar`, { confirmacion: 'RESTAURAR' });
    assert.equal(rest.status, 409, 'sin supervisor no restaura');

    // Rutas: el envío expone sus puntos para 7Factura
    const tk = (await ok(api('POST', '/api/integraciones', { nombre: 'Prueba' }), 'token')).token;
    const envios = await fetch(`${BASE}/api/integracion/v1/envios`, { headers: { Authorization: `Bearer ${tk}` } }).then((r) => r.json());
    assert.ok('ruta' in envios.envios[0]);
  } finally {
    srv.kill(); sink.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
