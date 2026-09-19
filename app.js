const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); };
const api = (url, options) => fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options }).then(response => { if (!response.ok) throw new Error(`API ${response.status}`); return response.status === 204 ? null : response.json(); });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
let adminSection = 'departments';
let adminData = { departments: [], users: [], meetings: [], minutes: [], tasks: [] };
let currentSession = null;
let schoolSettings = null;
const renderAdminList = () => {
  const list = document.querySelector('#adminList');
  const items = adminData[adminSection];
  const labels = { departments: 'Departamentos', users: 'Usuarios', meetings: 'Reuniones', minutes: 'Actas', tasks: 'Tareas' };
  const columns = { departments: ['Departamento', 'Miembros'], users: ['Nombre', 'Rol'], meetings: ['Reunión', 'Fecha'], minutes: ['Acta', 'Estado'], tasks: ['Tarea', 'Estado'] };
  const details = { departments: item => [item.name, `${item.member_count} miembros`], users: item => [item.name || item.email, item.role === 'admin' ? 'Administrador' : item.role === 'manager' ? 'Gestor' : 'Profesor'], meetings: item => [item.title, formatDate(item.starts_at)], minutes: item => [item.meeting_title, item.status === 'sent' ? 'Enviada' : 'Borrador'], tasks: item => [item.title, item.status === 'done' ? 'Hecha' : item.status === 'in_progress' ? 'En curso' : 'Pendiente'] };
  const actions = item => currentSession?.isAdmin ? `<div class="table-actions">${adminSection === 'departments' ? `<button title="Gestionar miembros" aria-label="Gestionar miembros" data-members="${escapeHtml(item.id)}">Personas</button>` : ''}<button title="Editar" aria-label="Editar" data-edit="${escapeHtml(item.id)}" data-type="${adminSection}">Editar</button><button class="danger" title="Eliminar" aria-label="Eliminar" data-delete="${escapeHtml(item.id)}" data-type="${adminSection}">Eliminar</button></div>` : ['meetings', 'minutes', 'tasks'].includes(adminSection) ? `<div class="table-actions"><button title="Editar" aria-label="Editar" data-edit="${escapeHtml(item.id)}" data-type="${adminSection}">Editar</button></div>` : '';
  list.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${columns[adminSection].map(column => `<th>${column}</th>`).join('')}<th>Acciones</th></tr></thead><tbody>${items.map(item => `<tr><td title="${escapeHtml(details[adminSection](item)[0])}">${escapeHtml(details[adminSection](item)[0])}</td><td>${escapeHtml(details[adminSection](item)[1])}</td><td>${actions(item)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty-cell">No hay ${labels[adminSection].toLowerCase()} todavía.</td></tr>`}</tbody></table></div>`;
};
let formState = null;
const options = (items, value, label) => items.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === value ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('');
const openRecordForm = (type, record = null) => {
  formState = { type, record };
  const fields = document.querySelector('#recordFields');
  const titles = { departments: 'Departamento', users: 'Usuario', meetings: 'Reunión', minutes: 'Acta', tasks: 'Tarea', members: 'Miembros del departamento', settings: 'Configuración del centro' };
  document.querySelector('#recordTitle').textContent = `${record ? 'Editar' : 'Crear'} ${titles[type]}`;
  const value = key => escapeHtml(record?.[key] || '');
  if (type === 'departments') fields.innerHTML = `<label>Nombre<input name="name" required value="${value('name')}"></label><label>Color<select name="color"><option value="coral" ${record?.color === 'coral' ? 'selected' : ''}>Coral</option><option value="blue" ${record?.color === 'blue' ? 'selected' : ''}>Azul</option><option value="gold" ${record?.color === 'gold' ? 'selected' : ''}>Oro</option></select></label>`;
  if (type === 'users') fields.innerHTML = `<label>Nombre completo<input name="name" required value="${value('name')}"></label><label>Correo electrónico<input name="email" type="email" required ${record ? 'readonly' : ''} value="${value('email')}"></label><label>Permiso global<select name="role"><option value="member" ${record?.role === 'member' ? 'selected' : ''}>Profesor</option><option value="admin" ${record?.role === 'admin' ? 'selected' : ''}>Administrador</option></select></label>`;
  if (type === 'settings') fields.innerHTML = `<label>Nombre del centro<input name="name" required value="${value('name')}"></label><label>URL del logotipo<input name="logoUrl" type="url" value="${value('logo_url')}"></label><p class="form-help">Puedes usar una URL pública de imagen para el logotipo.</p>`;
  if (type === 'meetings') fields.innerHTML = `<label>Título<input name="title" required value="${value('title')}"></label><label>Departamento<select name="departmentId" required>${options(adminData.departments, record?.department_id, item => item.name)}</select></label><div class="form-row"><label>Fecha y hora<input name="startsAt" type="datetime-local" required value="${record?.starts_at ? new Date(record.starts_at).toISOString().slice(0, 16) : ''}"></label><label>Lugar<input name="location" value="${value('location')}"></label></div>`;
  if (type === 'minutes') fields.innerHTML = `${record ? '' : `<label>Reunión<select name="meetingId" required>${options(adminData.meetings, '', item => item.title)}</select></label>`}<label>Contenido<textarea name="content" required>${value('content')}</textarea></label><label>Estado<select name="status"><option value="draft" ${record?.status === 'draft' ? 'selected' : ''}>Borrador</option><option value="review" ${record?.status === 'review' ? 'selected' : ''}>En revisión</option><option value="sent" ${record?.status === 'sent' ? 'selected' : ''}>Enviada</option></select></label>`;
  if (type === 'tasks') fields.innerHTML = `<label>Título<input name="title" required value="${value('title')}"></label><label>Departamento<select name="departmentId" required>${options(adminData.departments, record?.department_id, item => item.name)}</select></label><label>Responsable<select name="assignedTo"><option value="">Sin asignar</option>${options(adminData.users, record?.assigned_to, item => item.name || item.email)}</select></label><div class="form-row"><label>Fecha límite<input name="dueDate" type="date" value="${value('due_date')}"></label><label>Estado<select name="status"><option value="pending" ${record?.status === 'pending' ? 'selected' : ''}>Pendiente</option><option value="in_progress" ${record?.status === 'in_progress' ? 'selected' : ''}>En curso</option><option value="done" ${record?.status === 'done' ? 'selected' : ''}>Hecha</option></select></label></div>`;
  if (type === 'members') {
    const membership = user => (typeof user.departments === 'string' ? JSON.parse(user.departments) : user.departments).find(department => department.id === record.id);
    fields.innerHTML = `<p class="form-help">Selecciona a los miembros y asigna su permiso en este departamento.</p><div class="member-checks">${adminData.users.map(user => { const member = membership(user); return `<label><input type="checkbox" name="member" value="${escapeHtml(user.id)}" ${member ? 'checked' : ''}><span>${escapeHtml(user.name || user.email)}</span><small>${escapeHtml(user.email)}</small><select name="memberRole-${escapeHtml(user.id)}"><option value="teacher" ${member?.role !== 'manager' ? 'selected' : ''}>Profesor</option><option value="manager" ${member?.role === 'manager' ? 'selected' : ''}>Gestor</option></select></label>`; }).join('') || '<p>No hay usuarios creados.</p>'}</div>`;
  }
  document.querySelector('#recordModal').classList.add('open');
};
const saveRecordForm = async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const { type, record } = formState;
  if (type === 'members') {
    const selected = new Set(new FormData(event.currentTarget).getAll('member'));
    const current = adminData.users.filter(user => (typeof user.departments === 'string' ? JSON.parse(user.departments) : user.departments).some(department => department.id === record.id));
    await Promise.all(adminData.users.filter(user => selected.has(user.id)).map(user => api(`/api/departments/${record.id}/members`, { method: 'POST', body: JSON.stringify({ userId: user.id, role: new FormData(event.currentTarget).get(`memberRole-${user.id}`) }) })));
    await Promise.all(current.filter(user => !selected.has(user.id)).map(user => api(`/api/departments/${record.id}/members/${user.id}`, { method: 'DELETE' })));
  } else if (type === 'settings') {
    await api('/api/settings', { method: 'PATCH', body: JSON.stringify(data) });
    await loadSchool();
  } else if (type === 'minutes') {
    await api(`/api/meetings/${record?.meeting_id || data.meetingId}/minutes`, { method: 'PATCH', body: JSON.stringify(data) });
  } else {
    const endpoint = `/api/${type}${record ? `/${record.id}` : ''}`;
    await api(endpoint, { method: record ? 'PATCH' : 'POST', body: JSON.stringify(data) });
  }
  document.querySelector('#recordModal').classList.remove('open'); await loadAdminData(); await loadDashboard(); showToast('Cambios guardados');
};
const deleteAdminRecord = async (type, id) => {
  if (!window.confirm('Esta acción eliminará el registro. ¿Quieres continuar?')) return;
  await api(`/api/${type}/${id}`, { method: 'DELETE' });
  await loadAdminData(); showToast('Registro eliminado');
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
const authScreen = document.querySelector('#authScreen');
const appShell = document.querySelector('.app-shell');
const isGithubPreview = window.location.hostname.endsWith('github.io');
const loadSchool = async () => { const settings = await api('/api/settings'); schoolSettings = settings; document.querySelector('#schoolName').textContent = settings.name; if (settings.logo_url) { const logo = document.querySelector('#schoolLogo'); logo.style.backgroundImage = `url(${settings.logo_url})`; logo.textContent = ''; } };
const loadMyDepartments = async () => { const departments = await api('/api/my-departments'); const container = document.querySelector('#myDepartments'); container.innerHTML = departments.map((department, index) => `<button class="nav-item dept ${index === 0 ? 'active-dept' : ''}"><i class="dot ${escapeHtml(department.color)}"></i>${escapeHtml(department.name)}${department.role === 'manager' ? '<em>Gestor</em>' : ''}</button>`).join('') || '<p class="nav-empty">No perteneces a ningún departamento.</p>'; };
fetch('/api/session').then(response => {
  if (!response.ok) throw new Error('unauthenticated');
  return response.json();
}).then(session => {
  currentSession = session;
  authScreen.remove();
  appShell.style.visibility = 'visible';
  const profile = document.querySelector('.profile');
  if (profile) profile.querySelector('strong').textContent = session.name || session.email;
  if (profile) profile.querySelector('small').textContent = session.isAdmin ? 'Administrador de la plataforma' : session.email;
  const firstName = (session.name || session.email).split(' ')[0];
  document.querySelector('#todayDate').textContent = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
  document.querySelector('#welcomeName').innerHTML = `Buenos días, ${escapeHtml(firstName)} <span>✦</span>`;
  ['#userAvatar', '#profileAvatar'].forEach(selector => { const avatar = document.querySelector(selector); if (avatar) { avatar.textContent = firstName.slice(0, 2).toUpperCase(); if (session.picture) avatar.style.backgroundImage = `url(${session.picture})`; } });
  if (session.isAdmin || session.isManager) {
    const admin = document.querySelector('#adminNav');
    admin.hidden = false;
    admin.style.display = 'flex';
    admin.textContent = session.isAdmin ? '⚙ Administración' : '⚙ Gestión de departamentos';
    document.querySelectorAll('.admin-only').forEach(button => { button.hidden = !session.isAdmin; });
    document.querySelector('.admin-tab[data-admin-section="users"]').hidden = !session.isAdmin;
    admin.addEventListener('click', async () => { document.querySelector('#adminModal').classList.add('open'); try { await loadAdminData(); } catch { showToast('No se pudieron cargar los datos de administración'); } });
  }
  Promise.all([loadDashboard(), loadSchool(), loadMyDepartments()]).catch(() => showToast('No se pudieron cargar los datos del resumen'));
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
document.querySelectorAll('.admin-action').forEach(button => button.addEventListener('click', () => openRecordForm(button.dataset.action === 'department' ? 'departments' : button.dataset.action === 'settings' ? 'settings' : `${button.dataset.action}s`, button.dataset.action === 'settings' ? schoolSettings : null)));
document.querySelector('#adminList').addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.members) openRecordForm('members', adminData.departments.find(item => item.id === button.dataset.members));
    if (button.dataset.edit) openRecordForm(button.dataset.type, adminData[button.dataset.type].find(item => item.id === button.dataset.edit));
    if (button.dataset.delete) await deleteAdminRecord(button.dataset.type, button.dataset.delete);
  } catch { showToast('No se pudo completar la acción'); }
});
document.querySelector('#recordForm').addEventListener('submit', event => saveRecordForm(event).catch(() => showToast('No se pudieron guardar los cambios')));
['#closeRecord', '#cancelRecord'].forEach(selector => document.querySelector(selector).addEventListener('click', () => document.querySelector('#recordModal').classList.remove('open')));
document.querySelector('#recordModal').addEventListener('click', event => { if (event.target.id === 'recordModal') event.currentTarget.classList.remove('open'); });
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => { if (item.classList.contains('dept')) { document.querySelectorAll('.dept').forEach(dept => dept.classList.remove('active-dept')); item.classList.add('active-dept'); } }));
