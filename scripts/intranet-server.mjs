import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const certDir = path.join(projectRoot, '.local', 'certs');
const passwordPath = path.join(certDir, 'catalogo-intranet-password.txt');
const certificatePath = path.join(certDir, 'catalogo-intranet-server.cer');
const serverPfxPath = path.join(certDir, 'catalogo-intranet-server.pfx');
const defaultPort = Number.parseInt(process.env.INTRANET_PORT ?? '4173', 10);
const defaultHttpPort = Number.parseInt(process.env.INTRANET_HTTP_PORT ?? '80', 10);

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff2', 'font/woff2'],
]);

function getTimestamp() {
  return new Date().toISOString();
}

function getClientAddress(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  const remoteAddress = request.socket?.remoteAddress ?? 'unknown';
  return remoteAddress.startsWith('::ffff:') ? remoteAddress.slice(7) : remoteAddress;
}

function classifyRequest(requestPath, request) {
  if (requestPath === '/install' || requestPath === '/install/') {
    return 'pagina-install';
  }

  if (requestPath === '/health') {
    return 'health';
  }

  if (requestPath === '/ca.crt') {
    return 'certificado';
  }

  if (requestPath === '/' || !path.extname(requestPath)) {
    const acceptsHtml = request.headers.accept?.includes('text/html');
    return acceptsHtml ? 'navegacion-app' : 'ruta-spa';
  }

  return 'asset';
}

function logRequest(request, response, requestPath, requestKind) {
  const clientAddress = getClientAddress(request);
  console.log(
    `[Catalogo intranet] ${getTimestamp()} ${clientAddress} ${request.method} ${requestPath} ${response.statusCode} [${requestKind}]`,
  );
}

function logInfo(message) {
  console.log(`[Catalogo intranet] ${message}`);
}

function runPowerShellCommand(commandText) {
  if (process.platform !== 'win32') {
    return null;
  }

  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandText],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    return null;
  }

  return result.stdout?.trim() || null;
}

function fail(message) {
  console.error(`\n[Catalogo intranet] ${message}`);
  process.exit(1);
}

function isLinkLocalIpv4(address) {
  return address.startsWith('169.254.');
}

function isPrivateIpv4(address) {
  if (address.startsWith('10.') || address.startsWith('192.168.')) {
    return true;
  }

  const match = /^172\.(\d{1,3})\./.exec(address);
  if (!match) {
    return false;
  }

  const secondOctet = Number.parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isVirtualInterface(name) {
  return /vmware|virtualbox|hyper-v|vethernet|loopback/i.test(name);
}

function getLanIpv4() {
  const interfaces = networkInterfaces();
  const candidates = [];

  for (const [interfaceName, details] of Object.entries(interfaces)) {
    if (!details) {
      continue;
    }

    for (const detail of details) {
      if (detail.family === 'IPv4' && !detail.internal) {
        candidates.push({
          address: detail.address,
          interfaceName,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftScore =
      (isPrivateIpv4(left.address) ? 100 : 0) +
      (!isLinkLocalIpv4(left.address) ? 10 : 0) +
      (!isVirtualInterface(left.interfaceName) ? 5 : 0);
    const rightScore =
      (isPrivateIpv4(right.address) ? 100 : 0) +
      (!isLinkLocalIpv4(right.address) ? 10 : 0) +
      (!isVirtualInterface(right.interfaceName) ? 5 : 0);

    return rightScore - leftScore;
  });

  return candidates[0];
}

function getWindowsNetworkProfile(interfaceName) {
  if (!interfaceName) {
    return null;
  }

  const output = runPowerShellCommand(
    `$profile = Get-NetConnectionProfile -InterfaceAlias '${interfaceName.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1 InterfaceAlias, Name, NetworkCategory, IPv4Connectivity; if ($profile) { $profile | ConvertTo-Json -Compress }`,
  );

  if (!output) {
    return null;
  }

  try {
    return JSON.parse(output);
  }
  catch {
    return null;
  }
}

function formatNetworkCategory(networkCategory) {
  if (networkCategory === 0 || networkCategory === '0') {
    return 'Public';
  }

  if (networkCategory === 1 || networkCategory === '1') {
    return 'Private';
  }

  if (networkCategory === 2 || networkCategory === '2') {
    return 'DomainAuthenticated';
  }

  return typeof networkCategory === 'string' ? networkCategory : null;
}

function ensureDist() {
  if (!existsSync(distDir)) {
    fail('No existe dist/. Ejecuta `npm run intranet:install` o `npm run build` antes de servir la app.');
  }

  const indexPath = path.join(distDir, 'index.html');
  if (!existsSync(indexPath)) {
    fail('Falta dist/index.html. El build no parece completo.');
  }
}

function ensureCertArtifacts(hosts) {
  mkdirSync(certDir, { recursive: true });

  const powershell = process.platform === 'win32' ? 'powershell' : 'pwsh';
  const command = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(__dirname, 'create-cert.ps1'),
    '-CertDir',
    certDir,
    '-PasswordFile',
    passwordPath,
    '-ServerHostsCsv',
    hosts.join(','),
  ];

  const result = spawnSync(powershell, command, {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    fail(`No se pudieron generar los certificados HTTPS.\n${stderr || stdout || 'Sin detalle adicional.'}`);
  }

  if (!existsSync(serverPfxPath) || !existsSync(certificatePath)) {
    fail('El script de certificados termino sin dejar los archivos esperados.');
  }
}

function getInstallPageHtml(baseUrl) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Instalar CataloGo</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4ede4;
        --surface: rgba(255, 252, 248, 0.94);
        --ink: #211611;
        --muted: #6d574d;
        --accent: #9f3b30;
        --accent-strong: #7b271f;
        --line: rgba(75, 41, 29, 0.14);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", system-ui, sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(159, 59, 48, 0.16), transparent 32%),
          radial-gradient(circle at bottom right, rgba(34, 126, 110, 0.18), transparent 28%),
          var(--bg);
      }

      main {
        width: min(920px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }

      .hero,
      .card {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 24px 70px rgba(54, 29, 20, 0.08);
      }

      .hero {
        padding: 28px;
      }

      h1,
      h2 {
        margin: 0 0 12px;
      }

      p {
        margin: 0;
        line-height: 1.6;
        color: var(--muted);
      }

      .cta-row,
      .info-grid {
        display: grid;
        gap: 16px;
      }

      .cta-row {
        margin-top: 24px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .info-grid {
        margin-top: 20px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .card {
        padding: 22px;
      }

      .url-box {
        display: block;
        margin-top: 18px;
        padding: 14px 16px;
        overflow-wrap: anywhere;
        background: #fff;
        border-radius: 16px;
        border: 1px solid var(--line);
        color: var(--ink);
        text-decoration: none;
        font-weight: 600;
      }

      ol {
        margin: 14px 0 0;
        padding-left: 20px;
        color: var(--muted);
        line-height: 1.65;
      }

      a.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 52px;
        padding: 0 18px;
        border-radius: 16px;
        font-weight: 700;
        text-decoration: none;
      }

      .primary {
        background: var(--accent);
        color: #fff;
      }

      .secondary {
        border: 1px solid var(--line);
        color: var(--accent-strong);
        background: #fff;
      }

      .note {
        margin-top: 18px;
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(159, 59, 48, 0.08);
        color: var(--ink);
        border: 1px solid rgba(159, 59, 48, 0.12);
      }

      @media (max-width: 640px) {
        main {
          width: min(100vw - 20px, 920px);
          padding-top: 20px;
        }

        .hero,
        .card {
          border-radius: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p style="text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem; font-weight: 700;">CataloGo en intranet</p>
        <h1>Instalacion local en movil</h1>
        <p>Abre primero el certificado si tu movil aun no confia en esta red local. Despues abre la app y anadela a la pantalla de inicio.</p>
        <a class="url-box" href="${baseUrl}/">${baseUrl}/</a>
        <div class="cta-row">
          <a class="button primary" href="${baseUrl}/">Abrir la app</a>
          <a class="button secondary" href="${baseUrl}/ca.crt">Descargar certificado</a>
        </div>
        <div class="note">La app se sirve por HTTPS desde este PC. Si cambia la IP de la maquina, usa la nueva URL que muestra la consola.</div>
      </section>

      <section class="info-grid">
        <article class="card">
          <h2>iPhone / iPad</h2>
          <ol>
            <li>Abre <strong>Descargar certificado</strong> y permite la descarga.</li>
            <li>Ve a Ajustes, instala el perfil descargado y marca confianza para el certificado si iOS lo solicita.</li>
            <li>Vuelve a esta pagina y pulsa <strong>Abrir la app</strong>.</li>
            <li>En Safari usa Compartir -> Anadir a pantalla de inicio.</li>
          </ol>
        </article>

        <article class="card">
          <h2>Android</h2>
          <ol>
            <li>Abre <strong>Descargar certificado</strong> e instala el certificado si tu navegador no confia todavia en la pagina.</li>
            <li>Abre <strong>Abrir la app</strong> desde Chrome.</li>
            <li>Usa el menu del navegador para instalar la app o anadirla a la pantalla de inicio.</li>
            <li>Abre la app instalada y comprueba que carga sin conexion tras la primera visita.</li>
          </ol>
        </article>
      </section>
    </main>
  </body>
</html>`;
}

async function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES.get(extension) ?? 'application/octet-stream';
  const contents = await fs.readFile(filePath);

  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  response.end(contents);
}

function normalizeRequestPath(url) {
  const pathname = new URL(url, 'https://catalogo.local').pathname;
  return decodeURIComponent(pathname);
}

async function handleRequest(request, response) {
  const requestPath = normalizeRequestPath(request.url ?? '/');
  const requestKind = classifyRequest(requestPath, request);

  try {
    const host = request.headers.host ?? `localhost:${defaultPort}`;
    const baseUrl = `https://${host}`;

    if (requestPath === '/install' || requestPath === '/install/') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      response.end(getInstallPageHtml(baseUrl));
      logRequest(request, response, requestPath, requestKind);
      return;
    }

    if (requestPath === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true }));
      logRequest(request, response, requestPath, requestKind);
      return;
    }

    if (requestPath === '/ca.crt') {
      response.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="catalogo-intranet-server.cer"',
      });
      response.end(readFileSync(certificatePath));
      logRequest(request, response, requestPath, requestKind);
      return;
    }

    const unsafePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.join(distDir, unsafePath);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(path.resolve(distDir))) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      logRequest(request, response, requestPath, requestKind);
      return;
    }

    if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
      await sendFile(response, resolvedPath);
      logRequest(request, response, requestPath, requestKind);
      return;
    }

    if (!path.extname(requestPath)) {
      await sendFile(response, path.join(distDir, 'index.html'));
      logRequest(request, response, requestPath, requestKind);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    logRequest(request, response, requestPath, requestKind);
  }
  catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Error serving request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    logRequest(request, response, requestPath, requestKind);
  }
}

function buildHttpsBaseUrl(hostHeader, lanIp, httpsPort) {
  const rawHost = hostHeader || lanIp;
  const normalizedHost = rawHost.startsWith('[')
    ? rawHost.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1')
    : rawHost.replace(/:\d+$/, '');
  return `https://${normalizedHost}:${httpsPort}`;
}

function createRedirectServer({ lanIp, httpsPort, httpPort }) {
  return createHttpServer((request, response) => {
    const requestPath = normalizeRequestPath(request.url ?? '/');
    const redirectBaseUrl = buildHttpsBaseUrl(request.headers.host, lanIp, httpsPort);
    const location = `${redirectBaseUrl}${request.url ?? '/'}`;

    response.writeHead(308, {
      Location: location,
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end(`Redirecting to ${location}`);
    logRequest(request, response, requestPath, 'redirect-http');
  });
}

export async function startServer({
  port = defaultPort,
  httpPort = defaultHttpPort,
  silent = false,
} = {}) {
  ensureDist();

  const lanCandidate = getLanIpv4();
  if (!lanCandidate) {
    fail('No se ha detectado una IPv4 de LAN. Conecta el PC a una red local antes de arrancar el servidor.');
  }
  const lanIp = lanCandidate.address;
  const networkProfile = getWindowsNetworkProfile(lanCandidate.interfaceName);
  const networkCategory = formatNetworkCategory(networkProfile?.NetworkCategory);

  const hostnames = Array.from(
    new Set(['localhost', '127.0.0.1', lanIp, process.env.COMPUTERNAME].filter(Boolean)),
  );

  ensureCertArtifacts(hostnames);

  const password = readFileSync(passwordPath, 'utf8');
  const server = createHttpsServer(
    {
      pfx: readFileSync(serverPfxPath),
      passphrase: password,
    },
    (request, response) => {
      void handleRequest(request, response);
    },
  );

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });

  const redirectServer = createRedirectServer({ lanIp, httpsPort: port, httpPort });
  let redirectServerEnabled = false;
  try {
    await new Promise((resolve, reject) => {
      redirectServer.once('error', reject);
      redirectServer.listen(httpPort, '0.0.0.0', resolve);
    });
    redirectServerEnabled = true;
  }
  catch (error) {
    redirectServer.close();
    if (!silent) {
      const reason = error instanceof Error ? error.message : 'No disponible';
      logInfo(`Aviso: no se pudo abrir HTTP en el puerto ${httpPort} para redirigir a HTTPS (${reason}).`);
    }
  }

  const urls = {
    app: `https://${lanIp}:${port}/`,
    install: `https://${lanIp}:${port}/install`,
    certificate: `https://${lanIp}:${port}/ca.crt`,
    redirect: `http://${lanIp}${httpPort === 80 ? '' : `:${httpPort}`}/`,
  };

  if (!silent) {
    console.log('');
    logInfo('Servidor HTTPS activo');
    logInfo(`App: ${urls.app}`);
    logInfo(`Instalacion: ${urls.install}`);
    logInfo(`Certificado: ${urls.certificate}`);
    if (redirectServerEnabled) {
      logInfo(`HTTP -> HTTPS: ${urls.redirect}`);
    }
    logInfo(`Interfaz: ${lanCandidate.interfaceName}`);
    if (networkCategory) {
      logInfo(`Perfil de red: ${networkCategory}`);
    }
    if (isLinkLocalIpv4(lanIp)) {
      logInfo('Aviso: la IP detectada es 169.254.x.x. Esa red suele no ser accesible desde otros dispositivos por Wi-Fi.');
    }
    if (networkCategory === 'Public') {
      logInfo('Aviso: Windows tiene esta red como Public. El firewall puede bloquear accesos desde otros dispositivos.');
      logInfo('Ejecuta `npm run intranet:allow-firewall` o cambia la red a perfil Private.');
    }
    console.log('');
  }

  const stop = async () => {
    const closeServer = (target) =>
      new Promise((resolve, reject) => target.close((error) => (error ? reject(error) : resolve())));
    await closeServer(server);
    if (redirectServerEnabled) {
      await closeServer(redirectServer);
    }
  };

  return {
    server,
    redirectServer,
    redirectServerEnabled,
    stop,
    urls,
    lanIp,
    port,
    httpPort,
    interfaceName: lanCandidate.interfaceName,
    networkProfile,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void startServer();
}
