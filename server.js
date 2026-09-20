import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';

dotenv.config();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 80);
const appUrl = (process.env.APP_URL || 'https://reuniones.gecoas.es').replace(/\/$/, '');
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const adminEmail = (process.env.ADMIN_EMAIL || 'gbailly@alcaste-lasfuentes.com').toLowerCase();
const redirectUri = `${appUrl}/auth/google/callback`;
const sessionSecret = process.env.SESSION_SECRET || clientSecret || 'reuniones-session-change-me';
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://reuniones:reuniones@localhost:5432/reuniones' });
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
const cookie = (token, maxAge) => `session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
const parseCookies = request => Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(value => { const [key, ...rest] = value.trim().split('='); return [key, rest.join('=')]; }));
const signSession = session => { const payload = Buffer.from(JSON.stringify(session)).toString('base64url'); const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url'); return `${payload}.${signature}`; };
const readSession = token => { try { const [payload, signature] = String(token || '').split('.'); const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url'); if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; const session = JSON.parse(Buffer.from(payload, 'base64url').toString()); return session.expires > Date.now() ? session : null; } catch { return null; } };
const send = (response, status, body, headers = {}) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers }); response.end(body); };
const redirect = (response, location, headers = {}) => { response.writeHead(302, { Location: location, ...headers }); response.end(); };
const readBody = request => new Promise((resolve, reject) => { let body = ''; request.on('data', chunk => { body += chunk; if (body.length > 1_000_000) reject(new Error('Request too large')); }); request.on('end', () => resolve(body ? JSON.parse(body) : {})); request.on('error', reject); });
const json = (response, status, body) => send(response, status, JSON.stringify(body), { 'Content-Type': 'application/json' });
const getRequestSession = request => readSession(parseCookies(request).session);
const requireSession = (request, response) => { const session = getRequestSession(request); if (!session) { json(response, 401, { error: 'authentication_required' }); return null; } return session; };
const requireAdmin = (request, response) => { const session = requireSession(request, response); if (session && !session.isAdmin) { json(response, 403, { error: 'admin_required' }); return null; } return session; };
const accessibleDepartmentIds = async session => {
  if (session.isAdmin) return null;
  const user = await pool.query('SELECT id FROM users WHERE email = $1', [session.email]);
  if (!user.rows[0]) return [];
  return (await pool.query('SELECT department_id AS id FROM department_members WHERE user_id = $1', [user.rows[0].id])).rows.map(row => row.id);
};
const canManageDepartment = async (session, departmentId) => session.isAdmin || (await pool.query('SELECT 1 FROM department_members dm JOIN users u ON u.id = dm.user_id WHERE dm.department_id = $1 AND u.email = $2 AND dm.role = $3', [departmentId, session.email, 'manager'])).rowCount > 0;

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
  const userResult = await pool.query(`INSERT INTO users (email, name, picture, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, picture = EXCLUDED.picture, role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE users.role END, updated_at = now() RETURNING id, role`, [email, profile.name || email, profile.picture || null, email === adminEmail ? 'admin' : 'member']);
  const managerResult = await pool.query(`SELECT EXISTS (SELECT 1 FROM department_members dm JOIN users u ON u.id = dm.user_id WHERE u.email = $1 AND dm.role = 'manager') AS is_manager`, [email]);
  const session = { email, userId: userResult.rows[0].id, name: profile.name, picture: profile.picture, isAdmin: userResult.rows[0].role === 'admin', isManager: managerResult.rows[0].is_manager, expires: Date.now() + 8 * 60 * 60 * 1000 };
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
    if (request.url === '/api/settings' && request.method === 'GET') {
      if (!requireSession(request, response)) return;
      return json(response, 200, (await pool.query('SELECT name, logo_url, email_from_name, email_from_address FROM school_settings WHERE id = TRUE')).rows[0]);
    }
    if (request.url === '/api/settings' && request.method === 'PATCH') {
      const session = requireAdmin(request, response); if (!session) return;
      const body = await readBody(request); const result = await pool.query('UPDATE school_settings SET name = COALESCE($1, name), logo_url = NULLIF($2, \'\'), email_from_name = COALESCE($3, email_from_name), email_from_address = COALESCE($4, email_from_address), updated_at = now() WHERE id = TRUE RETURNING name, logo_url, email_from_name, email_from_address', [body.name || null, body.logoUrl ?? null, body.emailFromName || null, body.emailFromAddress || null]);
      return json(response, 200, result.rows[0]);
    }
    if (request.url?.match(/^\/api\/reminders\/[^/]+$/) && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const departmentId = request.url.split('/')[3]; if (!await canManageDepartment(session, departmentId)) return json(response, 403, { error: 'department_manager_required' });
      const result = await pool.query('SELECT frequency FROM reminder_settings WHERE department_id = $1', [departmentId]); return json(response, 200, result.rows[0] || { frequency: 'weekly' });
    }
    if (request.url?.match(/^\/api\/reminders\/[^/]+$/) && request.method === 'PATCH') {
      const session = requireSession(request, response); if (!session) return;
      const departmentId = request.url.split('/')[3]; if (!await canManageDepartment(session, departmentId)) return json(response, 403, { error: 'department_manager_required' }); const body = await readBody(request); const user = await pool.query('SELECT id FROM users WHERE email = $1', [session.email]); const result = await pool.query('INSERT INTO reminder_settings (department_id, frequency, updated_by) VALUES ($1, $2, $3) ON CONFLICT (department_id) DO UPDATE SET frequency = EXCLUDED.frequency, updated_by = EXCLUDED.updated_by, updated_at = now() RETURNING frequency', [departmentId, body.frequency, user.rows[0]?.id || null]); return json(response, 200, result.rows[0]);
    }
    if (request.url === '/api/departments' && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const ids = await accessibleDepartmentIds(session); const result = await pool.query(`SELECT d.id, d.name, d.color, d.head_user_id, u.name AS head_name, COUNT(dm.user_id)::int AS member_count FROM departments d LEFT JOIN users u ON u.id = d.head_user_id LEFT JOIN department_members dm ON dm.department_id = d.id ${ids ? 'WHERE d.id = ANY($1::uuid[])' : ''} GROUP BY d.id, u.name ORDER BY d.name`, ids ? [ids] : []);
      return json(response, 200, result.rows);
    }
    if (request.url === '/api/my-departments' && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const result = await pool.query(`SELECT d.id, d.name, d.color, dm.role FROM department_members dm JOIN users u ON u.id = dm.user_id JOIN departments d ON d.id = dm.department_id WHERE u.email = $1 ORDER BY d.name`, [session.email]);
      return json(response, 200, result.rows);
    }
    if (request.url === '/api/departments' && request.method === 'POST') {
      const session = requireAdmin(request, response); if (!session) return;
      const body = await readBody(request); const result = await pool.query('INSERT INTO departments (name, color, head_user_id) VALUES ($1, $2, NULLIF($3, \'\')::uuid) RETURNING *', [body.name, body.color || 'coral', body.headUserId || '']);
      return json(response, 201, result.rows[0]);
    }
    if (request.url === '/api/users' && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const ids = await accessibleDepartmentIds(session); if (!session.isAdmin && !ids.length) return json(response, 200, []); const result = session.isAdmin ? await pool.query(`SELECT u.id, u.email, u.name, u.picture, u.role, COALESCE(json_agg(json_build_object('id', d.id, 'name', d.name, 'role', dm.role)) FILTER (WHERE d.id IS NOT NULL), '[]') AS departments FROM users u LEFT JOIN department_members dm ON dm.user_id = u.id LEFT JOIN departments d ON d.id = dm.department_id GROUP BY u.id ORDER BY u.name`) : await pool.query(`SELECT u.id, u.email, u.name, u.picture, u.role, COALESCE(json_agg(json_build_object('id', d.id, 'name', d.name, 'role', dm.role)) FILTER (WHERE d.id IS NOT NULL), '[]') AS departments FROM users u JOIN department_members visible_dm ON visible_dm.user_id = u.id LEFT JOIN department_members dm ON dm.user_id = u.id LEFT JOIN departments d ON d.id = dm.department_id WHERE visible_dm.department_id = ANY($1::uuid[]) GROUP BY u.id ORDER BY u.name`, [ids]);
      return json(response, 200, result.rows);
    }
    if (request.url === '/api/users' && request.method === 'POST') {
      const session = requireAdmin(request, response); if (!session) return;
      const body = await readBody(request); const result = await pool.query('INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id, email, name, role', [body.email.toLowerCase(), body.name, body.role || 'member']);
      return json(response, 201, result.rows[0]);
    }
    if (request.url?.startsWith('/api/users/') && request.method === 'PATCH') {
      const session = requireAdmin(request, response); if (!session) return;
      const id = request.url.split('/')[3]; const body = await readBody(request); const result = await pool.query('UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), updated_at = now() WHERE id = $3 RETURNING id, email, name, role', [body.name || null, body.role || null, id]);
      return json(response, 200, result.rows[0] || { error: 'not_found' });
    }
    if (request.url?.startsWith('/api/users/') && request.method === 'DELETE') {
      const session = requireAdmin(request, response); if (!session) return;
      const id = request.url.split('/')[3]; const user = await pool.query('SELECT email FROM users WHERE id = $1', [id]);
      if (user.rows[0]?.email === session.email) return json(response, 400, { error: 'cannot_delete_current_user' });
      await pool.query('DELETE FROM users WHERE id = $1', [id]); return json(response, 204, null);
    }
    if (request.url?.match(/^\/api\/departments\/[^/]+\/members$/) && request.method === 'POST') {
      const session = requireSession(request, response); if (!session) return;
      const id = request.url.split('/')[3]; if (!await canManageDepartment(session, id)) return json(response, 403, { error: 'department_manager_required' }); const body = await readBody(request);
      await pool.query('INSERT INTO department_members (department_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (department_id, user_id) DO UPDATE SET role = EXCLUDED.role', [id, body.userId, body.role || 'teacher']);
      return json(response, 204, null);
    }
    if (request.url?.match(/^\/api\/departments\/[^/]+\/members\/[^/]+$/) && request.method === 'DELETE') {
      const session = requireSession(request, response); if (!session) return;
      const [, , , departmentId, , userId] = request.url.split('/');
      if (!await canManageDepartment(session, departmentId)) return json(response, 403, { error: 'department_manager_required' });
      await pool.query('DELETE FROM department_members WHERE department_id = $1 AND user_id = $2', [departmentId, userId]);
      return json(response, 204, null);
    }
    if (request.url?.startsWith('/api/departments/') && request.method === 'PATCH') {
      const session = requireSession(request, response); if (!session) return;
      const id = request.url.split('/')[3]; if (!await canManageDepartment(session, id)) return json(response, 403, { error: 'department_manager_required' }); const body = await readBody(request); const result = await pool.query('UPDATE departments SET name = COALESCE($1, name), color = COALESCE($2, color), head_user_id = COALESCE(NULLIF($3, \'\')::uuid, head_user_id), updated_at = now() WHERE id = $4 RETURNING *', [body.name || null, body.color || null, body.headUserId ?? '', id]);
      return json(response, 200, result.rows[0] || { error: 'not_found' });
    }
    if (request.url?.startsWith('/api/departments/') && request.method === 'DELETE') {
      const session = requireAdmin(request, response); if (!session) return;
      const id = request.url.split('/')[3]; await pool.query('DELETE FROM departments WHERE id = $1', [id]); return json(response, 204, null);
    }
    if (request.url === '/api/tasks' && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const ids = await accessibleDepartmentIds(session); const result = await pool.query(`SELECT t.*, u.name AS assignee_name, d.name AS department_name FROM tasks t JOIN departments d ON d.id = t.department_id LEFT JOIN users u ON u.id = t.assigned_to ${ids ? 'WHERE t.department_id = ANY($1::uuid[])' : ''} ORDER BY t.due_date NULLS LAST, t.created_at DESC`, ids ? [ids] : []);
      return json(response, 200, result.rows);
    }
    if (request.url === '/api/meetings' && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const ids = await accessibleDepartmentIds(session); const result = await pool.query(`SELECT m.*, d.name AS department_name, COUNT(ai.id)::int AS agenda_count FROM meetings m JOIN departments d ON d.id = m.department_id LEFT JOIN agenda_items ai ON ai.meeting_id = m.id ${ids ? 'WHERE m.department_id = ANY($1::uuid[])' : ''} GROUP BY m.id, d.name ORDER BY m.starts_at DESC`, ids ? [ids] : []);
      return json(response, 200, result.rows);
    }
    if (request.url === '/api/minutes' && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const ids = await accessibleDepartmentIds(session); const result = await pool.query(`SELECT mi.*, m.title AS meeting_title, m.starts_at, m.department_id, d.name AS department_name FROM minutes mi JOIN meetings m ON m.id = mi.meeting_id JOIN departments d ON d.id = m.department_id ${ids ? 'WHERE m.department_id = ANY($1::uuid[])' : ''} ORDER BY mi.updated_at DESC`, ids ? [ids] : []);
      return json(response, 200, result.rows);
    }
    if (request.url === '/api/meetings' && request.method === 'POST') {
      const session = requireSession(request, response); if (!session) return;
      const body = await readBody(request); if (!await canManageDepartment(session, body.departmentId)) return json(response, 403, { error: 'department_manager_required' }); const user = await pool.query('SELECT id FROM users WHERE email = $1', [session.email]); const result = await pool.query('INSERT INTO meetings (department_id, title, starts_at, location, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *', [body.departmentId, body.title, body.startsAt, body.location || null, user.rows[0]?.id || null]);
      return json(response, 201, result.rows[0]);
    }
    if (request.url?.startsWith('/api/meetings/') && !request.url.endsWith('/minutes') && request.method === 'PATCH') {
      const session = requireSession(request, response); if (!session) return;
      const id = request.url.split('/')[3]; const body = await readBody(request); const current = await pool.query('SELECT department_id FROM meetings WHERE id = $1', [id]); if (!current.rows[0] || !await canManageDepartment(session, body.departmentId || current.rows[0].department_id)) return json(response, 403, { error: 'department_manager_required' }); const result = await pool.query('UPDATE meetings SET department_id = COALESCE($1, department_id), title = COALESCE($2, title), starts_at = COALESCE($3, starts_at), location = COALESCE($4, location), status = COALESCE($5, status), updated_at = now() WHERE id = $6 RETURNING *', [body.departmentId || null, body.title || null, body.startsAt || null, body.location || null, body.status || null, id]);
      return json(response, 200, result.rows[0] || { error: 'not_found' });
    }
    if (request.url?.startsWith('/api/meetings/') && !request.url.endsWith('/minutes') && request.method === 'DELETE') {
      const session = requireAdmin(request, response); if (!session) return;
      const id = request.url.split('/')[3]; await pool.query('DELETE FROM meetings WHERE id = $1', [id]); return json(response, 204, null);
    }
    if (request.url?.startsWith('/api/meetings/') && request.url.endsWith('/minutes') && request.method === 'PATCH') {
      const session = requireSession(request, response); if (!session) return;
      const meetingId = request.url.split('/')[3]; const meeting = await pool.query('SELECT department_id FROM meetings WHERE id = $1', [meetingId]); if (!meeting.rows[0] || !await canManageDepartment(session, meeting.rows[0].department_id)) return json(response, 403, { error: 'department_manager_required' }); const body = await readBody(request); const user = await pool.query('SELECT id FROM users WHERE email = $1', [session.email]); const result = await pool.query('INSERT INTO minutes (meeting_id, content, status, attendees, summary, agreements, pending, audio_url, edited_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (meeting_id) DO UPDATE SET content = EXCLUDED.content, status = EXCLUDED.status, attendees = EXCLUDED.attendees, summary = EXCLUDED.summary, agreements = EXCLUDED.agreements, pending = EXCLUDED.pending, audio_url = EXCLUDED.audio_url, edited_by = EXCLUDED.edited_by, updated_at = now() RETURNING *', [meetingId, body.content || '', body.status || 'draft', body.attendees || '', body.summary || '', body.agreements || '', body.pending || '', body.audioUrl || null, user.rows[0]?.id || null]);
      return json(response, 200, result.rows[0]);
    }
    if (request.url?.match(/^\/api\/meetings\/[^/]+\/agenda$/) && request.method === 'GET') {
      const session = requireSession(request, response); if (!session) return;
      const meetingId = request.url.split('/')[3]; const result = await pool.query('SELECT ai.id, ai.title, ai.position, ai.proposed_by, u.name AS proposer_name FROM agenda_items ai LEFT JOIN users u ON u.id = ai.proposed_by WHERE ai.meeting_id = $1 ORDER BY ai.position, ai.created_at', [meetingId]); return json(response, 200, result.rows);
    }
    if (request.url?.match(/^\/api\/meetings\/[^/]+\/agenda$/) && request.method === 'POST') {
      const session = requireSession(request, response); if (!session) return;
      const meetingId = request.url.split('/')[3]; const meeting = await pool.query('SELECT department_id FROM meetings WHERE id = $1', [meetingId]); if (!meeting.rows[0] || !await canManageDepartment(session, meeting.rows[0].department_id)) return json(response, 403, { error: 'department_manager_required' }); const body = await readBody(request); await pool.query('DELETE FROM agenda_items WHERE meeting_id = $1', [meetingId]); const titles = Array.isArray(body.items) ? body.items : []; await Promise.all(titles.filter(Boolean).map((title, position) => pool.query('INSERT INTO agenda_items (meeting_id, title, position) VALUES ($1, $2, $3)', [meetingId, title, position]))); return json(response, 204, null);
    }
    if (request.url?.match(/^\/api\/meetings\/[^/]+\/agenda-items$/) && request.method === 'POST') {
      const session = requireSession(request, response); if (!session) return;
      const meetingId = request.url.split('/')[3]; const meeting = await pool.query('SELECT department_id FROM meetings WHERE id = $1', [meetingId]); const allowed = meeting.rows[0] && (await accessibleDepartmentIds(session))?.includes(meeting.rows[0].department_id); if (!session.isAdmin && !allowed) return json(response, 403, { error: 'department_member_required' }); const body = await readBody(request); const result = await pool.query('INSERT INTO agenda_items (meeting_id, title, position, proposed_by) VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM agenda_items WHERE meeting_id = $1), $3) RETURNING *', [meetingId, body.title, session.userId || null]); return json(response, 201, result.rows[0]);
    }
    if (request.url?.startsWith('/api/minutes/') && request.method === 'DELETE') {
      const session = requireSession(request, response); if (!session) return;
      const id = request.url.split('/')[3]; const minute = await pool.query('SELECT m.department_id FROM minutes mi JOIN meetings m ON m.id = mi.meeting_id WHERE mi.id = $1', [id]); if (!minute.rows[0] || !await canManageDepartment(session, minute.rows[0].department_id)) return json(response, 403, { error: 'department_manager_required' }); await pool.query('DELETE FROM minutes WHERE id = $1', [id]); return json(response, 204, null);
    }
    if (request.url?.match(/^\/api\/minutes\/[^/]+\/send$/) && request.method === 'POST') {
      const session = requireSession(request, response); if (!session) return;
      const id = request.url.split('/')[3]; const minute = await pool.query(`SELECT mi.*, m.department_id, m.title AS meeting_title, d.name AS department_name FROM minutes mi JOIN meetings m ON m.id = mi.meeting_id JOIN departments d ON d.id = m.department_id WHERE mi.id = $1`, [id]); if (!minute.rows[0] || !await canManageDepartment(session, minute.rows[0].department_id)) return json(response, 403, { error: 'department_manager_required' });
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env; if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) return json(response, 503, { error: 'smtp_not_configured' });
      const recipients = await pool.query('SELECT u.email FROM department_members dm JOIN users u ON u.id = dm.user_id WHERE dm.department_id = $1', [minute.rows[0].department_id]); if (!recipients.rowCount) return json(response, 400, { error: 'no_department_members' });
      const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASSWORD } }); const current = minute.rows[0];
      await transporter.sendMail({ from: SMTP_FROM, to: SMTP_FROM, bcc: recipients.rows.map(row => row.email), subject: `Acta: ${current.meeting_title}`, text: `${current.department_name}\n\nAsistentes: ${current.attendees || 'No indicados'}\n\nResumen\n${current.summary || ''}\n\nPuntos tratados\n${current.content || ''}\n\nAcuerdos\n${current.agreements || ''}\n\nPendientes\n${current.pending || ''}` });
      const result = await pool.query(`UPDATE minutes SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [id]); return json(response, 200, result.rows[0]);
    }
    if (request.url === '/api/tasks' && request.method === 'POST') {
      const session = requireSession(request, response); if (!session) return;
      const body = await readBody(request); if (!await canManageDepartment(session, body.departmentId)) return json(response, 403, { error: 'department_manager_required' }); const user = await pool.query('SELECT id FROM users WHERE email = $1', [session.email]); const result = await pool.query('INSERT INTO tasks (department_id, meeting_id, title, description, assigned_to, due_date, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [body.departmentId, body.meetingId || null, body.title, body.description || null, body.assignedTo || null, body.dueDate || null, body.status || 'pending', user.rows[0]?.id || null]);
      return json(response, 201, result.rows[0]);
    }
    if (request.url?.startsWith('/api/tasks/') && request.method === 'PATCH') {
      const session = requireSession(request, response); if (!session) return;
      const id = request.url.split('/')[3]; const body = await readBody(request); const current = await pool.query('SELECT department_id, assigned_to FROM tasks WHERE id = $1', [id]); const ownCompletion = body.status && !body.title && !body.description && !body.assignedTo && !body.dueDate && !body.departmentId && current.rows[0]?.assigned_to === session.userId; if (!current.rows[0] || (!ownCompletion && !await canManageDepartment(session, body.departmentId || current.rows[0].department_id))) return json(response, 403, { error: 'department_manager_required' }); const result = await pool.query('UPDATE tasks SET department_id = COALESCE($1, department_id), title = COALESCE($2, title), description = COALESCE($3, description), assigned_to = COALESCE($4, assigned_to), due_date = COALESCE($5, due_date), status = COALESCE($6, status), updated_at = now() WHERE id = $7 RETURNING *', [body.departmentId || null, body.title || null, body.description || null, body.assignedTo || null, body.dueDate || null, body.status || null, id]);
      return json(response, 200, result.rows[0] || { error: 'not_found' });
    }
    if (request.url?.startsWith('/api/tasks/') && request.method === 'DELETE') {
      const session = requireSession(request, response); if (!session) return;
      const id = request.url.split('/')[3]; const task = await pool.query('SELECT department_id FROM tasks WHERE id = $1', [id]); if (!task.rows[0] || !await canManageDepartment(session, task.rows[0].department_id)) return json(response, 403, { error: 'department_manager_required' }); await pool.query('DELETE FROM tasks WHERE id = $1', [id]); return json(response, 204, null);
    }
    const requested = new URL(request.url, appUrl).pathname;
    const file = requested === '/' ? 'index.html' : requested.slice(1);
    const filePath = path.resolve(root, file);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(response, 404, 'Not found');
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    send(response, 200, fs.readFileSync(filePath), { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
  } catch (error) { console.error(error); send(response, 500, 'Error interno'); }
});
async function start() {
  await pool.query(schema);
  server.listen(port, '0.0.0.0', () => console.log(`Reuniones escuchando en ${port}`));
}
start().catch(error => { console.error('No se pudo inicializar PostgreSQL', error); process.exit(1); });
