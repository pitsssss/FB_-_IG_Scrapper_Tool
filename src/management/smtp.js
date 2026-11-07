import net from 'node:net';
import tls from 'node:tls';

/**
 * Minimal SMTP client (AUTH LOGIN) for verification OTPs.
 * Zero npm dependencies. Supports implicit TLS (465) and STARTTLS (587).
 */

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      // SMTP multiline: lines start with code- or code\s
      const lines = buf.split(/\r?\n/).filter((l) => l.length);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) {
        socket.off('data', onData);
        socket.off('error', onErr);
        resolve({ code: Number(last.slice(0, 3)), text: buf });
      }
    };
    const onErr = (err) => {
      socket.off('data', onData);
      reject(err);
    };
    socket.on('data', onData);
    socket.once('error', onErr);
  });
}

async function expect(socket, okCodes) {
  const res = await readResponse(socket);
  if (!okCodes.includes(res.code)) {
    const err = new Error(`SMTP unexpected response ${res.code}`);
    err.code = 'SMTP_ERROR';
    throw err;
  }
  return res;
}

async function write(socket, line) {
  socket.write(`${line}\r\n`);
}

/**
 * @param {{ host, port, secure, user, pass, from }} smtp
 * @param {{ to: string, subject: string, text: string }} message
 */
export async function sendSmtpMail(smtp, message, { timeoutMs = 20_000 } = {}) {
  if (!smtp?.enabled) {
    const err = new Error(smtp?.reason || 'SMTP is not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const connect = () => new Promise((resolve, reject) => {
    const opts = { host: smtp.host, port: smtp.port, servername: smtp.host };
    const socket = smtp.secure
      ? tls.connect({ ...opts, rejectUnauthorized: true }, () => resolve(socket))
      : net.connect(opts, () => resolve(socket));
    socket.setTimeout(timeoutMs);
    socket.once('error', reject);
    socket.once('timeout', () => {
      socket.destroy();
      reject(Object.assign(new Error('SMTP timeout'), { code: 'SMTP_TIMEOUT' }));
    });
  });

  let socket = await connect();
  try {
    await expect(socket, [220]);
    await write(socket, `EHLO localhost`);
    await expect(socket, [250]);

    if (!smtp.secure) {
      await write(socket, 'STARTTLS');
      await expect(socket, [220]);
      socket = await new Promise((resolve, reject) => {
        const secureSocket = tls.connect({
          socket,
          servername: smtp.host,
          rejectUnauthorized: true,
        }, () => resolve(secureSocket));
        secureSocket.once('error', reject);
      });
      await write(socket, 'EHLO localhost');
      await expect(socket, [250]);
    }

    if (smtp.user && smtp.pass != null) {
      await write(socket, 'AUTH LOGIN');
      await expect(socket, [334]);
      await write(socket, Buffer.from(smtp.user).toString('base64'));
      await expect(socket, [334]);
      await write(socket, Buffer.from(smtp.pass).toString('base64'));
      await expect(socket, [235]);
    }

    await write(socket, `MAIL FROM:<${smtp.from}>`);
    await expect(socket, [250]);
    await write(socket, `RCPT TO:<${message.to}>`);
    await expect(socket, [250, 251]);
    await write(socket, 'DATA');
    await expect(socket, [354]);
    const headers = [
      `From: ${smtp.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      message.text.replace(/^\./gm, '..'),
      '.',
    ].join('\r\n');
    await write(socket, headers);
    await expect(socket, [250]);
    await write(socket, 'QUIT');
  } finally {
    try { socket.end(); } catch { /* ignore */ }
  }
}
