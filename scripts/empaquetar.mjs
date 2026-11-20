// Empaqueta plugins en dist/<id>-<version>.tar.gz y actualiza su entrada en registry.json (SHA-256).
// Uso: node scripts/empaquetar.mjs <id> [<id>...]      (solo los indicados: los demás conservan su paquete y su hash)
//      node scripts/empaquetar.mjs --todos
// Después: crea en GitHub una Release con la etiqueta <id>-v<version> y sube su .tar.gz.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.env.REPO || 'im7manu/gestor-deca-plugins';
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(raiz, 'dist');
fs.mkdirSync(dist, { recursive: true });
const todos = fs.readdirSync(raiz).filter((d) => fs.existsSync(path.join(raiz, d, 'plugin.json'))).sort();
const pedidos = process.argv.includes('--todos') ? todos : process.argv.slice(2);
if (!pedidos.length) { console.error('Indica qué plugins empaquetar (o --todos). Disponibles:', todos.join(', ')); process.exit(1); }

const fRegistro = path.join(raiz, 'registry.json');
const registro = fs.existsSync(fRegistro) ? JSON.parse(fs.readFileSync(fRegistro, 'utf8')) : { plugins: [] };
for (const id of pedidos) {
  if (!todos.includes(id)) throw new Error(`No existe el plugin ${id}`);
  const m = JSON.parse(fs.readFileSync(path.join(raiz, id, 'plugin.json'), 'utf8'));
  if (m.id !== id) throw new Error(`La carpeta ${id} debe llamarse como su id (${m.id})`);
  const archivo = path.join(dist, `${m.id}-${m.version}.tar.gz`);
  execFileSync('tar', ['-czf', archivo, '--exclude=test', '--exclude=.DS_Store', '--exclude=package-lock.json', '--exclude=.bin', '-C', path.join(raiz, id), '.'],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
  const entrada = {
    id: m.id, nombre: m.nombre, version: m.version, descripcion: m.descripcion, autor: m.autor, app_min: m.app_min,
    url: `https://github.com/${REPO}/releases/download/${m.id}-v${m.version}/${m.id}-${m.version}.tar.gz`,
    sha256, repo: `https://github.com/${REPO}/tree/main/${m.id}`,
  };
  registro.plugins = [...registro.plugins.filter((p) => p.id !== id), entrada].sort((a, b) => a.id.localeCompare(b.id));
  console.log(`${m.id} ${m.version} → ${path.relative(raiz, archivo)} (${(fs.statSync(archivo).size / 1024).toFixed(0)} KB) sha256 ${sha256.slice(0, 16)}…`);
}
fs.writeFileSync(fRegistro, `${JSON.stringify(registro, null, 2)}\n`);
console.log('registry.json actualizado');
