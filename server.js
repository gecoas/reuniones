import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 80);
const appUrl = (process.env.APP_URL || 'https://reuniones.gecoas.es').replace(/\/$/, '');
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const adminEmail = (process.env.ADMIN_EMAIL || 'gbailly@alcaste-lasfuentes.com').toLowerCase();
const redirectUri = `${appUrl}/auth/google/callback`;
const sessionSecret = process.env.SESSION_SECRET || clientSecret || 'reuniones-session-change-me';
const cookie = (token, maxAge) => `session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
const parseCookies = request => Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(value => { const [key, ...rest] = value.trim().split('='); return [key, rest.join('=')]; }));
const signSession = session => { const payload = Buffer.from(JSON.stringify(session)).toString('base64url'); const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url'); return `${payload}.${signature}`; };
const readSession = token => { try { const [payload, signature] = String(token || '').split('.'); const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url'); if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; const session = JSON.parse(Buffer.from(payload, 'base64url').toString()); return session.expires > Date.now() ? session : null; } catch { return null; } };
const send = (response, status, body, headers = {}) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers }); response.end(body); };
const redirect = (response, location, headers = {}) => { response.writeHead(302, { Location: location, ...headers }); response.end(); };

async function callback(request, response) {
  const query = new URL(request.url, appUrl).searchParams;
  if (query.get('error')) return redirect(response, '/?error=google_denied');
  if (!clientId || !clientSecret) return send(response, 500, 'Google OAuth no está configurado en el servidor.');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: query.get('code'), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  if (!tokenResponse.ok) return send(response, 502, 'No se pudo validar el acceso con Google.');
  const tokens = await tokenResponse.json();
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) return send(response, 502, 'No se pudo obtener el perfil de Google.');
  const profile = await profileResponse.json();
  const email = String(profile.email || '').toLowerCase();
  if (!email.endsWith('@alcaste-lasfuentes.com')) return redirect(response, '/?error=domain_not_allowed');
  const session = { email, name: profile.name, picture: profile.picture, isAdmin: email === adminEmail, expires: Date.now() + 8 * 60 * 60 * 1000 };
  redirect(response, '/', { 'Set-Cookie': cookie(signSession(session), 8 * 60 * 60) });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/auth/google') {
      if (!clientId) return send(response, 500, 'Falta GOOGLE_CLIENT_ID en el servidor.');
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', access_type: 'online', prompt: 'select_account' });
      return redirect(response, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    }
    if (request.url?.startsWith('/auth/google/callback')) return await callback(request, response);
    if (request.url === '/auth/logout') return redirect(response, '/', { 'Set-Cookie': cookie('', 0) });
    if (request.url === '/api/session') {
      const session = readSession(parseCookies(request).session);
      if (!session) return send(response, 401, JSON.stringify({ authenticated: false }), { 'Content-Type': 'application/json' });
      return send(response, 200, JSON.stringify({ authenticated: true, ...session }), { 'Content-Type': 'application/json' });
    }
    const requested = new URL(request.url, appUrl).pathname;
    const file = requested === '/' ? 'index.html' : requested.slice(1);
    const filePath = path.resolve(root, file);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(response, 404, 'Not found');
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    send(response, 200, fs.readFileSync(filePath), { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
  } catch (error) { console.error(error); send(response, 500, 'Error interno'); }
});
server.listen(port, '0.0.0.0', () => console.log(`Reuniones escuchando en ${port}`));
