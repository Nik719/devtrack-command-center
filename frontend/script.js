const API = window.DEVTRACK_API_URL || '';  // set in config.js

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

function badge(cls, text) {
  return `<span class="badge badge-${cls}">${text}</span>`;
}

function priorityBadge(p) {
  return badge(p, p);
}

function slaRiskBadge(risk) {
  return risk ? badge('sla', 'SLA Risk') : '';
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let allIssues = [];
let allReporters = [];

// ---------------------------------------------------------------------------
// Load stats
// ---------------------------------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/issues/stats/`);
    const data = await res.json();
    $('stat-total').textContent = data.total;
    $('stat-open').textContent = data.open;
    $('stat-critical').textContent = data.critical;
    $('stat-sla').textContent = data.sla_risk;
  } catch {
    /* silently ignore on first load if no data */
  }
}

// ---------------------------------------------------------------------------
// Load reporters (for name lookup)
// ---------------------------------------------------------------------------
async function loadReporters() {
  try {
    const res = await fetch(`${API}/api/reporters/`);
    allReporters = await res.json();
  } catch {
    allReporters = [];
  }
}

function reporterName(reporter_id) {
  const r = allReporters.find(r => r.id === reporter_id);
  return r ? r.name : null;
}

function reporterTeam(reporter_id) {
  const r = allReporters.find(r => r.id === reporter_id);
  return r ? r.team : null;
}

// ---------------------------------------------------------------------------
// Render Kanban
// ---------------------------------------------------------------------------
const COLUMNS = ['open', 'in_progress', 'resolved', 'closed'];
const COLUMN_LABELS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };

function statusOptions(current) {
  return ['open', 'in_progress', 'resolved', 'closed']
    .map(s => `<option value="${s}"${s === current ? ' selected' : ''}>${COLUMN_LABELS[s]}</option>`)
    .join('');
}

function renderIssueCard(issue) {
  const team = reporterTeam(issue.reporter_id);
  const name = reporterName(issue.reporter_id);
  let classes = `issue-card p-${issue.priority}`;
  if (issue.sla_risk) classes += ' is-sla-risk';

  return `
    <div class="${classes}" data-id="${issue.id}">
      <div class="card-id">#${issue.id}</div>
      <div class="card-title">${escHtml(issue.title)}</div>
      <div class="card-badges">
        ${priorityBadge(issue.priority)}
        ${slaRiskBadge(issue.sla_risk)}
        ${team ? badge('team', team) : ''}
        ${name ? badge('reporter', name) : ''}
      </div>
      <div class="card-status-row">
        <select class="status-select" data-id="${issue.id}" title="Move to…">
          ${statusOptions(issue.status)}
        </select>
      </div>
      <div class="card-actions">
        <button class="card-btn edit" data-id="${issue.id}" title="Edit issue">✏️ Edit</button>
        <button class="card-btn delete" data-id="${issue.id}" title="Delete issue">🗑 Delete</button>
      </div>
    </div>`;
}

function renderKanban(issues) {
  for (const col of COLUMNS) {
    const colIssues = issues.filter(i => i.status === col);
    const body = $(`col-${col}`);
    const count = $(`count-${col}`);
    count.textContent = colIssues.length;
    body.innerHTML = colIssues.length
      ? colIssues.map(renderIssueCard).join('')
      : '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No issues</div></div>';
  }
}

// ---------------------------------------------------------------------------
// Load & filter issues
// ---------------------------------------------------------------------------
async function loadIssues() {
  const status = $('filter-status').value;
  const priority = $('filter-priority').value;
  const team = $('filter-team').value;

  let url = `${API}/api/issues/?`;
  if (status) url += `status=${encodeURIComponent(status)}&`;
  if (priority) url += `priority=${encodeURIComponent(priority)}&`;
  if (team) url += `team=${encodeURIComponent(team)}&`;

  try {
    const res = await fetch(url);
    allIssues = await res.json();
    renderKanban(allIssues);
  } catch {
    renderKanban([]);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
async function runSearch() {
  const q = $('search-input').value.trim();
  if (!q) { await loadIssues(); return; }

  try {
    const res = await fetch(`${API}/api/issues/search/?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data.error) { renderKanban([]); return; }
    renderKanban(data);
  } catch {
    renderKanban([]);
  }
}

// ---------------------------------------------------------------------------
// Create issue form
// ---------------------------------------------------------------------------
function showAlert(id, message, type) {
  const el = $(id);
  el.className = `alert alert-${type} show`;
  const msgEl = $(`${id}-msg`);
  if (msgEl) msgEl.textContent = message;
}
function hideAlert(id) {
  $(id).className = 'alert';
}

async function submitIssue(e) {
  e.preventDefault();
  hideAlert('form-success');
  hideAlert('form-error');
  hideAlert('form-dup');

  const payload = {
    title: $('issue-title').value.trim(),
    description: $('issue-description').value.trim(),
    status: $('issue-status').value,
    priority: $('issue-priority').value,
    reporter_id: parseInt($('issue-reporter').value, 10),
  };

  try {
    const res = await fetch(`${API}/api/issues/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.errors ? data.errors.join(' · ') : (data.error || 'Unknown error');
      showAlert('form-error', msg, 'error');
      return;
    }

    showAlert('form-success', `Issue #${data.id} created — "${data.title}"`, 'success');
    if (data.duplicate_warning) {
      showAlert('form-dup', data.duplicate_warning, 'warn');
    }

    e.target.reset();
    await loadStats();
    await loadIssues();
  } catch {
    showAlert('form-error', 'Network error — is the server running?', 'error');
  }
}

// ---------------------------------------------------------------------------
// Security helper
// ---------------------------------------------------------------------------
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------
function openEditModal(issue) {
  $('edit-id').value          = issue.id;
  $('edit-title').value       = issue.title;
  $('edit-description').value = issue.description;
  $('edit-status').value      = issue.status;
  $('edit-priority').value    = issue.priority;
  $('modal-issue-id').textContent = `Issue #${issue.id}`;
  hideAlert('edit-error');
  $('edit-modal').classList.add('open');
  $('edit-title').focus();
}

function closeEditModal() {
  $('edit-modal').classList.remove('open');
}

async function submitEdit(e) {
  e.preventDefault();
  hideAlert('edit-error');

  const id = parseInt($('edit-id').value, 10);
  const payload = {
    title:       $('edit-title').value.trim(),
    description: $('edit-description').value.trim(),
    status:      $('edit-status').value,
    priority:    $('edit-priority').value,
  };

  const res = await fetch(`${API}/api/issues/?id=${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    const msg = data.errors ? data.errors.join(' · ') : (data.error || 'Unknown error');
    showAlert('edit-error', msg, 'error');
    return;
  }

  closeEditModal();
  await loadStats();
  await loadIssues();
}

// ---------------------------------------------------------------------------
// Delete issue
// ---------------------------------------------------------------------------
async function deleteIssue(id) {
  if (!confirm(`Delete issue #${id}? This cannot be undone.`)) return;

  const res = await fetch(`${API}/api/issues/?id=${id}`, { method: 'DELETE' });
  if (res.ok) {
    await loadStats();
    await loadIssues();
  }
}

// ---------------------------------------------------------------------------
// Inline status update
// ---------------------------------------------------------------------------
async function updateIssueStatus(id, status) {
  const res = await fetch(`${API}/api/issues/?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (res.ok) {
    await loadStats();
    await loadIssues();
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadReporters();
  await loadStats();
  await loadIssues();

  $('filter-status').addEventListener('change', loadIssues);
  $('filter-priority').addEventListener('change', loadIssues);
  $('filter-team').addEventListener('change', loadIssues);

  $('search-btn').addEventListener('click', runSearch);
  $('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

  $('clear-search').addEventListener('click', async () => {
    $('search-input').value = '';
    await loadIssues();
  });

  $('issue-form').addEventListener('submit', submitIssue);
  $('edit-form').addEventListener('submit', submitEdit);

  // Modal close
  $('modal-close').addEventListener('click', closeEditModal);
  $('modal-cancel').addEventListener('click', closeEditModal);
  $('edit-modal').addEventListener('click', e => {
    if (e.target === $('edit-modal')) closeEditModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeEditModal();
  });

  // Delegate Kanban card interactions
  document.querySelector('.kanban').addEventListener('change', async e => {
    if (e.target.classList.contains('status-select')) {
      await updateIssueStatus(Number(e.target.dataset.id), e.target.value);
    }
  });

  document.querySelector('.kanban').addEventListener('click', async e => {
    const editBtn  = e.target.closest('.card-btn.edit');
    const delBtn   = e.target.closest('.card-btn.delete');

    if (editBtn) {
      const id = Number(editBtn.dataset.id);
      const issue = allIssues.find(i => i.id === id);
      if (issue) openEditModal(issue);
    }
    if (delBtn) {
      await deleteIssue(Number(delBtn.dataset.id));
    }
  });
});
