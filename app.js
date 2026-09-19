const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); };
const api = (url, options) => fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options }).then(response => { if (!response.ok) throw new Error(`API ${response.status}`); return response.status === 204 ? null : response.json(); });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
let adminSection = 'departments';
let adminData = { departments: [], users: [], meetings: [], minutes: [], tasks: [] };
const renderAdminList = () => {
  const list = document.querySelector('#adminList');
  const items = adminData[adminSection];
  const labels = { departments: 'Departamentos', users: 'Usuarios', meetings: 'Reuniones', minutes: 'Actas', tasks: 'Tareas' };
  const empty = `<div class="admin-item"><div><strong>No hay ${labels[adminSection].toLowerCase()} todavía</strong><small>Usa una de las acciones de abajo para crear el primer registro.</small></div></div>`;
  const content = {
    departments: items.map(d => `<div class="admin-item"><span class="dot ${escapeHtml(d.color)}"></span><div><strong>${escapeHtml(d.name)}</strong><small>${d.member_count} miembros${d.head_name ? ` · ${escapeHtml(d.head_name)}` : ''}</small></div></div>`),
    users: items.map(u => `<div class="admin-item"><div class="avatar avatar-small">${escapeHtml((u.name || u.email).slice(0, 2).toUpperCase())}</div><div><strong>${escapeHtml(u.name || u.email)}</strong><small>${escapeHtml(u.email)} · ${u.role === 'admin' ? 'Administrador' : 'Miembro'}</small></div></div>`),
    meetings: items.map(m => `<div class="admin-item"><span class="dot blue"></span><div><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.department_name)} · ${new Date(m.starts_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</small></div></div>`),
    minutes: items.map(m => `<div class="admin-item"><span class="doc-icon">▤</span><div><strong>Acta · ${escapeHtml(m.meeting_title)}</strong><small>${escapeHtml(m.department_name)} · ${m.status === 'sent' ? 'Enviada' : 'Borrador'}</small></div></div>`),
    tasks: items.map(t => `<div class="admin-item"><span class="check ${t.status === 'done' ? 'checked' : ''}">${t.status === 'done' ? '✓' : ''}</span><div><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.assignee_name || 'Sin responsable')} · ${escapeHtml(t.status)}</small></div></div>`)
  };
  list.innerHTML = `<div class="admin-list-head"><strong>${labels[adminSection]}</strong><span>${items.length}</span></div>${content[adminSection].join('') || empty}`;
};
const loadAdminData = async () => {
  const [departments, users, meetings, minutes, tasks] = await Promise.all(['/api/departments', '/api/users', '/api/meetings', '/api/minutes', '/api/tasks'].map(api));
  adminData = { departments, users, meetings, minutes, tasks };
  renderAdminList();
};
const formatDate = value => new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const renderDashboard = ({ meetings, tasks, minutes }) => {
  const nextMeeting = meetings.filter(meeting => new Date(meeting.starts_at) >= new Date()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
  const pendingTasks = tasks.filter(task => task.status !== 'done');
  const statCards = document.querySelectorAll('.stat-card');
  if (statCards[0]) statCards[0].innerHTML = `<div class="stat-head"><span>Próxima reunión</span><span class="mini-icon coral-bg">◷</span></div><strong>${nextMeeting ? formatDate(nextMeeting.starts_at) : 'Sin reuniones'}</strong><p>${nextMeeting ? `${escapeHtml(nextMeeting.department_name)} · ${new Date(nextMeeting.starts_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Crea una desde Administración'}</p>`;
  if (statCards[1]) statCards[1].innerHTML = `<div class="stat-head"><span>Tareas pendientes</span><span class="mini-icon blue-bg">✓</span></div><strong class="big-number">${pendingTasks.length}</strong><p>${tasks.length ? `${tasks.filter(task => task.status === 'done').length} completadas` : 'No hay tareas creadas'}</p>`;
  if (statCards[2]) statCards[2].innerHTML = `<div class="stat-head"><span>Actas por revisar</span><span class="mini-icon gold-bg">▤</span></div><strong class="big-number">${minutes.filter(minute => minute.status !== 'sent').length}</strong><p>${minutes.length ? 'De tus departamentos' : 'No hay actas creadas'}</p>`;
  const heading = document.querySelector('.section-heading h2');
  if (heading) heading.textContent = nextMeeting?.department_name || 'Actividad reciente';
  const agendaPanel = document.querySelector('.agenda-panel');
  if (agendaPanel) agendaPanel.innerHTML = nextMeeting ? `<div class="panel-header"><div><span class="label-with-dot"><i class="dot coral"></i> PRÓXIMA REUNIÓN</span><h3>${escapeHtml(nextMeeting.title)}</h3><p class="muted">${formatDate(nextMeeting.starts_at)} · ${new Date(nextMeeting.starts_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p></div></div><div class="meeting-meta"><div><span class="meta-icon">⌂</span><span>${escapeHtml(nextMeeting.location || 'Sin ubicación')}</span></div></div><div class="agenda-preview"><div class="agenda-title"><strong>Orden del día</strong><span>${nextMeeting.agenda_count} puntos</span></div><button class="button outline full" id="openAgenda">Gestionar reunión <span>→</span></button></div>` : `<div class="panel-header"><div><span class="label-with-dot"><i class="dot coral"></i> PRÓXIMA REUNIÓN</span><h3>No hay reuniones programadas</h3><p class="muted">Crea una reunión desde Administración.</p></div></div>`;
  const taskList = document.querySelector('.task-list');
  if (taskList) taskList.innerHTML = tasks.slice(0, 4).map(task => `<div class="task-row"><span class="check ${task.status === 'done' ? 'checked' : ''}">${task.status === 'done' ? '✓' : ''}</span><div class="task-copy"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.assignee_name || 'Sin responsable')}${task.due_date ? ` · Vence ${formatDate(task.due_date)}` : ''}</small></div><span class="task-status ${task.status === 'done' ? 'done' : task.status === 'in_progress' ? 'progress' : 'pending'}">${task.status === 'done' ? 'Hecha' : task.status === 'in_progress' ? 'En curso' : 'Pendiente'}</span></div>`).join('') || '<p class="muted">No hay tareas creadas.</p>';
  const minutesPanel = document.querySelector('.minutes-panel');
  if (minutesPanel) minutesPanel.innerHTML = `<div class="panel-header"><div><span class="label-with-dot"><i class="dot gold"></i> DOCUMENTACIÓN</span><h3>Últimas actas</h3></div></div>${minutes.slice(0, 3).map(minute => `<div class="minutes-row"><div class="doc-icon">▤</div><div class="doc-copy"><strong>Acta · ${escapeHtml(minute.meeting_title)}</strong><small>${escapeHtml(minute.department_name)} · ${formatDate(minute.updated_at)}</small></div><span class="${minute.status === 'sent' ? 'sent-tag' : 'review-tag'}">${minute.status === 'sent' ? 'Enviada' : 'Por revisar'}</span></div>`).join('') || '<p class="muted">No hay actas creadas.</p>'}`;
};
const loadDashboard = async () => renderDashboard(Object.fromEntries(await Promise.all(['meetings', 'tasks', 'minutes'].map(async resource => [resource, await api(`/api/${resource}`)]))));
const createAdminRecord = async action => {
  try {
    if (action === 'department') {
      const name = window.prompt('Nombre del departamento'); if (!name) return;
      await api('/api/departments', { method: 'POST', body: JSON.stringify({ name }) });
    }
    if (action === 'user') {
      const name = window.prompt('Nombre completo del usuario'); if (!name) return;
      const email = window.prompt('Correo del colegio'); if (!email) return;
      await api('/api/users', { method: 'POST', body: JSON.stringify({ name, email }) });
    }
    if (action === 'meeting') {
      if (!adminData.departments.length) return showToast('Crea antes un departamento');
      const title = window.prompt('Título de la reunión', 'Reunión de departamento'); if (!title) return;
      const departmentId = window.prompt(`Identificador del departamento:\n${adminData.departments.map(d => `${d.id}: ${d.name}`).join('\n')}`); if (!departmentId) return;
      const startsAt = window.prompt('Fecha y hora (AAAA-MM-DD HH:MM)', new Date().toISOString().slice(0, 16).replace('T', ' ')); if (!startsAt) return;
      await api('/api/meetings', { method: 'POST', body: JSON.stringify({ title, departmentId, startsAt: startsAt.replace(' ', 'T') }) });
    }
    if (action === 'minute') {
      if (!adminData.meetings.length) return showToast('Crea antes una reunión');
      const meetingId = window.prompt(`Identificador de reunión:\n${adminData.meetings.map(m => `${m.id}: ${m.title}`).join('\n')}`); if (!meetingId) return;
      const content = window.prompt('Contenido inicial del acta'); if (content === null) return;
      await api(`/api/meetings/${encodeURIComponent(meetingId)}/minutes`, { method: 'PATCH', body: JSON.stringify({ content, status: 'draft' }) });
    }
    if (action === 'task') {
      if (!adminData.departments.length) return showToast('Crea antes un departamento');
      const title = window.prompt('Título de la tarea'); if (!title) return;
      const departmentId = window.prompt(`Identificador del departamento:\n${adminData.departments.map(d => `${d.id}: ${d.name}`).join('\n')}`); if (!departmentId) return;
      await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title, departmentId }) });
    }
    await loadAdminData(); showToast('Registro creado correctamente');
  } catch { showToast('No se pudo guardar el registro'); }
};
const authScreen = document.querySelector('#authScreen');
const appShell = document.querySelector('.app-shell');
const isGithubPreview = window.location.hostname.endsWith('github.io');
fetch('/api/session').then(response => {
  if (!response.ok) throw new Error('unauthenticated');
  return response.json();
}).then(session => {
  authScreen.remove();
  appShell.style.visibility = 'visible';
  const profile = document.querySelector('.profile');
  if (profile) profile.querySelector('strong').textContent = session.name || session.email;
  if (profile) profile.querySelector('small').textContent = session.isAdmin ? 'Administrador de la plataforma' : session.email;
  if (session.picture) document.querySelector('#userAvatar').style.backgroundImage = `url(${session.picture})`;
  if (session.isAdmin) {
    const admin = document.querySelector('#adminNav');
    admin.hidden = false;
    admin.style.display = 'flex';
    admin.addEventListener('click', async () => { document.querySelector('#adminModal').classList.add('open'); try { await loadAdminData(); } catch { showToast('No se pudieron cargar los datos de administración'); } });
  }
  loadDashboard().catch(() => showToast('No se pudieron cargar los datos del resumen'));
}).catch(() => {
  if (isGithubPreview) {
    authScreen.remove();
    showToast('Vista previa estática: el login funciona en reuniones.gecoas.es');
  }
});
document.querySelector('#newMeeting').addEventListener('click', () => modal.classList.add('open'));
['#closeModal','#cancelModal'].forEach(selector => document.querySelector(selector).addEventListener('click', () => modal.classList.remove('open')));
modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('open'); });
document.querySelector('#saveMeeting').addEventListener('click', () => { modal.classList.remove('open'); showToast('Reunión creada y lista para compartir'); });
document.querySelector('#openAgenda').addEventListener('click', () => showToast('Abriendo el orden del día completo'));
document.querySelector('#addTask').addEventListener('click', () => showToast('Nueva tarea: añade el título y el responsable'));
const minutesModal = document.querySelector('#minutesModal');
document.querySelectorAll('.small-edit').forEach(button => button.addEventListener('click', () => minutesModal.classList.add('open')));
['#closeMinutes','#closeMinutesBottom'].forEach(selector => document.querySelector(selector).addEventListener('click', () => minutesModal.classList.remove('open')));
minutesModal.addEventListener('click', event => { if (event.target === minutesModal) minutesModal.classList.remove('open'); });
document.querySelector('#shareMinutes').addEventListener('click', () => { minutesModal.classList.remove('open'); showToast('Acta guardada y enviada a 5 miembros'); });
document.querySelectorAll('.frequency').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.frequency').forEach(item => item.classList.remove('active')); button.classList.add('active'); document.querySelector('#savedNote').classList.add('show'); showToast('Frecuencia de recordatorios actualizada'); }));
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.filter').forEach(item => item.classList.remove('active')); button.classList.add('active'); }));
document.querySelectorAll('.check:not(.checked)').forEach(check => check.addEventListener('click', () => { check.classList.toggle('checked'); check.textContent = check.classList.contains('checked') ? '✓' : ''; showToast(check.classList.contains('checked') ? 'Tarea marcada como hecha' : 'Tarea reabierta'); }));
document.querySelector('#mobileMenu').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
document.querySelector('#closeAdmin').addEventListener('click', () => document.querySelector('#adminModal').classList.remove('open'));
document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => { adminSection = tab.dataset.adminSection; document.querySelectorAll('.admin-tab').forEach(item => item.classList.toggle('active', item === tab)); renderAdminList(); }));
document.querySelectorAll('.admin-action').forEach(button => button.addEventListener('click', () => createAdminRecord(button.dataset.action)));
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => { if (item.classList.contains('dept')) { document.querySelectorAll('.dept').forEach(dept => dept.classList.remove('active-dept')); item.classList.add('active-dept'); } }));
