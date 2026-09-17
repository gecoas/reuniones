const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); };
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
    const actions = document.querySelector('.welcome-row > div:last-child');
    const admin = document.createElement('button');
    admin.className = 'button outline admin-trigger';
    admin.id = 'openAdmin';
    admin.textContent = '⚙ Administración';
    actions?.prepend(admin);
    admin.addEventListener('click', () => document.querySelector('#adminModal').classList.add('open'));
  }
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
document.querySelector('#saveAdmin').addEventListener('click', () => { document.querySelector('#adminModal').classList.remove('open'); showToast('Configuración guardada'); });
document.querySelector('#addDepartment').addEventListener('click', () => showToast('Nuevo departamento listo para configurar'));
document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.admin-tab').forEach(item => item.classList.remove('active')); tab.classList.add('active'); showToast(tab.textContent.includes('Usuarios') ? 'Gestión de usuarios seleccionada' : 'Gestión de departamentos seleccionada'); }));
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => { if (item.classList.contains('dept')) { document.querySelectorAll('.dept').forEach(dept => dept.classList.remove('active-dept')); item.classList.add('active-dept'); } }));
