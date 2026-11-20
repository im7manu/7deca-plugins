// Servidor SMTP mínimo de pruebas: acepta todo y guarda los mensajes en memoria (no los reenvía).
import net from 'node:net';
export function smtpSink(puerto = 2525) {
  const mensajes = [];
  const srv = net.createServer((s) => {
    let datos = false, buf = '', actual = { de: '', para: [], cuerpo: '' };
    s.write('220 sink ESMTP\r\n');
    s.on('data', (d) => {
      buf += d.toString('latin1');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const linea = buf.slice(0, i); buf = buf.slice(i + 2);
        if (datos) { if (linea === '.') { datos = false; mensajes.push(actual); actual = { de: '', para: [], cuerpo: '' }; s.write('250 OK queued\r\n'); } else actual.cuerpo += `${linea}\n`; continue; }
        const c = linea.slice(0, 4).toUpperCase();
        if (c === 'EHLO' || c === 'HELO') s.write('250-sink\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (c === 'AUTH') s.write('235 OK\r\n');
        else if (c === 'MAIL') { actual.de = linea; s.write('250 OK\r\n'); }
        else if (c === 'RCPT') { actual.para.push(linea); s.write(linea.includes('rechazar') ? '550 No existe\r\n' : '250 OK\r\n'); }
        else if (c === 'DATA') { datos = true; s.write('354 Adelante\r\n'); }
        else if (c === 'QUIT') { s.write('221 Adiós\r\n'); s.end(); }
        else s.write('250 OK\r\n');
      }
    });
  });
  return new Promise((ok) => srv.listen(puerto, '127.0.0.1', () => ok({ mensajes, cerrar: () => srv.close() })));
}
