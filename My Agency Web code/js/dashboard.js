/* ============================================================
   YashTech Labs — Dashboard JS
   Sections: Navigation, Dashboard, Leads, Portfolio,
             Testimonials, Settings
   Requires: Firebase Firestore compat v9 | Chart.js
   ============================================================ */

'use strict';

const LEADS_PER_PAGE = 10;

const PIPELINE_STAGES = [
  'New Lead',
  'Discussion',
  'Requirement Gathering',
  'Quotation Sent',
  'Approved',
  'Development Started',
  'Testing',
  'Completed'
];

const STAGE_CLASS_MAP = {
  'New Lead':              'badge-new',
  'Discussion':            'badge-discussion',
  'Requirement Gathering': 'badge-gathering',
  'Quotation Sent':        'badge-quotation',
  'Approved':              'badge-approved',
  'Development Started':   'badge-development',
  'Testing':               'badge-testing',
  'Completed':             'badge-completed'
};

let allLeads        = [];
let currentPage     = 1;
let activeFilter    = 'all';
let searchQuery     = '';
let leadsChart      = null;
let currentLeadId   = null;
let currentPortfolioId = null;
let currentTestimonialId = null;
let portfolioRating = 5;
let testimonialRating = 5;

/* ─── INIT ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) return;

  await initDashboard();
  initSidebar();
  initMobileHeader();
  initLeadFilters();
  initSearchInput();
  initSettingsForm();
  initPasswordForm();
  initModalCloseHandlers();
});

async function initDashboard() {
  await Promise.all([
    loadDashboardStats(),
    loadLeadsChart(),
    loadRecentLeads()
  ]);
}

/* ─── SIDEBAR NAVIGATION ────────────────────────────────────── */
function initSidebar() {
  const navLinks = document.querySelectorAll('.sidebar-nav a[data-section]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      switchSection(section);
      // Close mobile sidebar
      closeMobileSidebar();
    });
  });
}

function switchSection(sectionName) {
  // Update nav active state
  document.querySelectorAll('.sidebar-nav a[data-section]').forEach(a => {
    a.classList.toggle('active', a.dataset.section === sectionName);
  });

  // Show/hide sections
  document.querySelectorAll('.section-content').forEach(sec => {
    sec.classList.remove('active');
  });

  const target = document.getElementById(`${sectionName}-section`);
  if (target) target.classList.add('active');

  // Update mobile header title
  const mobileSectionTitle = document.getElementById('mobile-section-title');
  if (mobileSectionTitle) {
    const link = document.querySelector(`.sidebar-nav a[data-section="${sectionName}"]`);
    if (link) mobileSectionTitle.textContent = link.querySelector('.nav-label')?.textContent || 'Dashboard';
  }

  // Lazy-load section data
  switch (sectionName) {
    case 'dashboard':
      initDashboard();
      break;
    case 'leads':
      loadAllLeads();
      break;
    case 'portfolio':
      loadPortfolio();
      break;
    case 'testimonials':
      loadTestimonials();
      break;
    case 'settings':
      loadSettings();
      break;
  }
}

/* ─── MOBILE HEADER ─────────────────────────────────────────── */
function initMobileHeader() {
  const hamburger = document.getElementById('hamburger-btn');
  const overlay   = document.getElementById('sidebar-overlay');

  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const isOpen  = sidebar.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      if (overlay) overlay.classList.toggle('show', isOpen);
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMobileSidebar);
  }
}

function closeMobileSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const hamburger = document.getElementById('hamburger-btn');
  const overlay   = document.getElementById('sidebar-overlay');
  if (sidebar)   sidebar.classList.remove('open');
  if (hamburger) hamburger.classList.remove('open');
  if (overlay)   overlay.classList.remove('show');
}

/* ─── TOAST NOTIFICATION ────────────────────────────────────── */
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `;
  toast.classList.remove('hidden');

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

/* ─── DASHBOARD STATS ───────────────────────────────────────── */
async function loadDashboardStats() {
  try {
    const snap = await db.collection('leads').get();
    let total = 0, pending = 0, accepted = 0, rejected = 0;

    snap.forEach(doc => {
      const d = doc.data();
      total++;
      const status = (d.status || 'pending').toLowerCase();
      if (status === 'pending')  pending++;
      if (status === 'accepted') accepted++;
      if (status === 'rejected') rejected++;
    });

    setText('stat-total',    total);
    setText('stat-pending',  pending);
    setText('stat-accepted', accepted);
    setText('stat-rejected', rejected);
  } catch (err) {
    console.error('[Dashboard] Stats error:', err);
    showToast('Failed to load dashboard stats.', 'error');
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
    // Animate number
    animateCounter(el, 0, parseInt(value) || 0, 600);
  }
}

function animateCounter(el, from, to, duration) {
  const start    = performance.now();
  const update   = (time) => {
    const progress = Math.min((time - start) / duration, 1);
    const val = Math.floor(from + (to - from) * easeOut(progress));
    el.textContent = val;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

/* ─── LEADS CHART ───────────────────────────────────────────── */
async function loadLeadsChart() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const snap = await db.collection('leads')
      .where('submittedAt', '>=', thirtyDaysAgo)
      .orderBy('submittedAt', 'asc')
      .get();

    // Build date map for last 30 days
    const dateMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = formatDateKey(d);
      dateMap[key] = 0;
    }

    snap.forEach(doc => {
      const d = doc.data();
      if (d.submittedAt) {
        const date = d.submittedAt.toDate ? d.submittedAt.toDate() : new Date(d.submittedAt);
        const key  = formatDateKey(date);
        if (key in dateMap) dateMap[key]++;
      }
    });

    const labels = Object.keys(dateMap).map(k => {
      const [, m, day] = k.split('-');
      return `${day}/${m}`;
    });
    const data = Object.values(dateMap);

    renderLeadsChart(labels, data);
  } catch (err) {
    console.error('[Dashboard] Chart error:', err);
  }
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderLeadsChart(labels, data) {
  const canvas = document.getElementById('leads-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (leadsChart) leadsChart.destroy();

  leadsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Leads',
        data,
        borderColor: '#D6A75F',
        backgroundColor: 'rgba(214,167,95,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#D6A75F',
        pointBorderColor: '#0D1E18',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E3329',
          borderColor: '#2A4038',
          borderWidth: 1,
          titleColor: '#D6A75F',
          bodyColor: '#F7F3E9',
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (item)  => ` ${item.raw} lead${item.raw !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: {
          grid:   { color: 'rgba(42,64,56,0.4)', drawBorder: false },
          ticks:  {
            color: '#7A776F',
            maxTicksLimit: 10,
            font: { size: 11 }
          },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          grid:   { color: 'rgba(42,64,56,0.4)', drawBorder: false },
          ticks:  {
            color: '#7A776F',
            stepSize: 1,
            font: { size: 11 }
          },
          border: { display: false }
        }
      }
    }
  });
}

/* ─── RECENT LEADS ──────────────────────────────────────────── */
async function loadRecentLeads() {
  const tbody = document.getElementById('recent-leads-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" class="loading-overlay"><div class="spinner"></div> Loading…</td></tr>`;

  try {
    const snap = await db.collection('leads')
      .orderBy('submittedAt', 'desc')
      .limit(5)
      .get();

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📭</div><h4>No leads yet</h4></div></td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    snap.forEach(doc => {
      const d    = doc.data();
      const date = d.submittedAt ? formatDate(d.submittedAt.toDate ? d.submittedAt.toDate() : new Date(d.submittedAt)) : 'N/A';
      const tr   = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="fw-600">${escapeHtml(d.name || '—')}</span></td>
        <td>${escapeHtml(d.email || '—')}</td>
        <td>${escapeHtml(d.service || d.serviceType || '—')}</td>
        <td>${statusBadge(d.status)}</td>
        <td>${date}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('[Dashboard] Recent leads error:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);text-align:center;padding:24px;">Failed to load leads.</td></tr>`;
  }
}

/* ─── ALL LEADS ─────────────────────────────────────────────── */
async function loadAllLeads() {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="loading-overlay"><div class="spinner"></div> Loading leads…</td></tr>`;

  try {
    const snap = await db.collection('leads').orderBy('submittedAt', 'desc').get();
    allLeads   = [];
    snap.forEach(doc => allLeads.push({ id: doc.id, ...doc.data() }));

    currentPage = 1;
    renderLeadsTable();
    renderPagination();
  } catch (err) {
    console.error('[Leads] Load error:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--danger);text-align:center;padding:24px;">Failed to load leads.</td></tr>`;
  }
}

function getFilteredLeads() {
  let leads = [...allLeads];

  if (activeFilter !== 'all') {
    leads = leads.filter(l => (l.status || 'pending').toLowerCase() === activeFilter);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    leads = leads.filter(l =>
      (l.name  || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.service || '').toLowerCase().includes(q)
    );
  }

  return leads;
}

function renderLeadsTable() {
  const tbody    = document.getElementById('leads-table-body');
  if (!tbody) return;

  const filtered = getFilteredLeads();
  const start    = (currentPage - 1) * LEADS_PER_PAGE;
  const pageData = filtered.slice(start, start + LEADS_PER_PAGE);

  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h4>${searchQuery ? 'No results found' : 'No leads yet'}</h4>
          <p>${searchQuery ? 'Try different search terms.' : 'Leads will appear here once submitted.'}</p>
        </div>
      </td></tr>
    `;
    return;
  }

    tbody.innerHTML = '';
    pageData.forEach(lead => {
      const date = lead.submittedAt
        ? formatDate(lead.submittedAt.toDate ? lead.submittedAt.toDate() : new Date(lead.submittedAt))
        : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="fw-600">${escapeHtml(lead.name || '—')}</span></td>
        <td>${escapeHtml(lead.phone || '—')}</td>
        <td style="font-size:12px;">${escapeHtml(lead.email || '—')}</td>
        <td>${escapeHtml(lead.service || lead.serviceType || '—')}</td>
        <td>${escapeHtml(lead.budget || lead.budgetRange || '—')}</td>
        <td>${statusBadge(lead.status)}</td>
        <td style="font-size:12px;color:var(--text-secondary);">${date}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon view"      title="View Details"   onclick="openLeadModal('${lead.id}')">👁</button>
            <button class="btn-icon whatsapp"  title="WhatsApp"       onclick="sendWhatsAppToLead('${escapeHtml(lead.phone || '')}','${escapeHtml(lead.name || '')}')">💬</button>
            <button class="btn-icon delete"    title="Delete Lead"    onclick="deleteLead('${lead.id}')">🗑</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
}

function renderPagination() {
  const wrapper  = document.getElementById('pagination-wrapper');
  if (!wrapper) return;

  const filtered = getFilteredLeads();
  const total    = filtered.length;
  const pages    = Math.ceil(total / LEADS_PER_PAGE);
  const start    = Math.min((currentPage - 1) * LEADS_PER_PAGE + 1, total);
  const end      = Math.min(currentPage * LEADS_PER_PAGE, total);

  const info = document.getElementById('pagination-info');
  if (info) info.textContent = total ? `Showing ${start}–${end} of ${total} leads` : 'No leads found';

  const btns = document.getElementById('pagination-btns');
  if (!btns) return;
  btns.innerHTML = '';

  if (pages <= 1) { wrapper.style.display = 'none'; return; }
  wrapper.style.display = 'flex';

  // Prev
  const prev = pageBtn('‹', currentPage === 1, () => { currentPage--; renderLeadsTable(); renderPagination(); });
  btns.appendChild(prev);

  // Page numbers
  let startPage = Math.max(1, currentPage - 2);
  let endPage   = Math.min(pages, currentPage + 2);

  if (startPage > 1) {
    btns.appendChild(pageBtn('1', false, () => gotoPage(1)));
    if (startPage > 2) btns.appendChild(ellipsis());
  }

  for (let i = startPage; i <= endPage; i++) {
    const btn = pageBtn(String(i), false, () => gotoPage(i));
    if (i === currentPage) btn.classList.add('active');
    btns.appendChild(btn);
  }

  if (endPage < pages) {
    if (endPage < pages - 1) btns.appendChild(ellipsis());
    btns.appendChild(pageBtn(String(pages), false, () => gotoPage(pages)));
  }

  // Next
  const next = pageBtn('›', currentPage === pages, () => { currentPage++; renderLeadsTable(); renderPagination(); });
  btns.appendChild(next);
}

function pageBtn(label, disabled, onClick) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.textContent = label;
  btn.disabled = disabled;
  if (!disabled) btn.addEventListener('click', onClick);
  return btn;
}

function ellipsis() {
  const span = document.createElement('span');
  span.style.cssText = 'color:var(--text-muted);padding:0 4px;';
  span.textContent = '…';
  return span;
}

function gotoPage(p) {
  currentPage = p;
  renderLeadsTable();
  renderPagination();
}

/* ─── FILTERS & SEARCH ──────────────────────────────────────── */
function initLeadFilters() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter || 'all';
      currentPage  = 1;
      renderLeadsTable();
      renderPagination();
    });
  });
}

function initSearchInput() {
  const input = document.getElementById('leads-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => {
    searchQuery = input.value;
    currentPage = 1;
    renderLeadsTable();
    renderPagination();
  }, 300));
}

function filterLeads(status) {
  activeFilter = status;
  currentPage  = 1;
  renderLeadsTable();
  renderPagination();
}

function searchLeads(query) {
  searchQuery = query;
  currentPage = 1;
  renderLeadsTable();
  renderPagination();
}

/* ─── EXPORT CSV ────────────────────────────────────────────── */
function exportLeadsCSV() {
  const leads = getFilteredLeads();
  if (!leads.length) { showToast('No leads to export.', 'warning'); return; }

  const headers = ['Name','Phone','Email','Service','Budget','Description','Launch Date','Preferred Contact','Status','Stage','Submitted At'];
  const rows    = leads.map(l => [
    l.name              || '',
    l.phone             || '',
    l.email             || '',
    l.service           || '',
    l.budget            || '',
    (l.description      || '').replace(/\n/g,' ').replace(/,/g,' '),
    l.launchDate        || '',
    l.preferredContact  || '',
    l.status            || 'pending',
    l.stage             || 'New Lead',
    l.submittedAt
      ? (l.submittedAt.toDate ? l.submittedAt.toDate() : new Date(l.submittedAt)).toISOString()
      : ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`));

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  a.href     = url;
  a.download = `yashtechlabs_leads_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${leads.length} leads as CSV.`, 'success');
}

/* ─── LEAD DETAIL MODAL ─────────────────────────────────────── */
async function openLeadModal(leadId) {
  currentLeadId = leadId;

  const modal = document.getElementById('lead-modal');
  if (!modal) return;

  // Show modal with loading state
  document.getElementById('lead-modal-body').innerHTML = `
    <div class="loading-overlay"><div class="spinner"></div> Loading lead details…</div>
  `;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    const doc  = await db.collection('leads').doc(leadId).get();
    if (!doc.exists) {
      showToast('Lead not found.', 'error');
      closeModal('lead-modal');
      return;
    }

    const lead = { id: doc.id, ...doc.data() };
    renderLeadModal(lead);
    await loadLeadNotes(leadId);
  } catch (err) {
    console.error('[Leads] Open modal error:', err);
    showToast('Failed to load lead details.', 'error');
    closeModal('lead-modal');
  }
}

function renderLeadModal(lead) {
  const date = lead.submittedAt
    ? formatDate(lead.submittedAt.toDate ? lead.submittedAt.toDate() : new Date(lead.submittedAt))
    : '—';

  const stage       = lead.stage  || 'New Lead';
  const status      = lead.status || 'pending';
  const hasFile     = lead.fileUrl || lead.fileName;

  document.getElementById('lead-modal-title').textContent = lead.name || 'Lead Details';

  document.getElementById('lead-modal-body').innerHTML = `
    <div class="lead-info-grid">
      <div class="lead-info-item">
        <span class="lead-info-label">Full Name</span>
        <span class="lead-info-value fw-600">${escapeHtml(lead.name || '—')}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Status</span>
        <span class="lead-info-value">${statusBadge(status)}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Phone</span>
        <span class="lead-info-value">${escapeHtml(lead.phone || '—')}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Email</span>
        <span class="lead-info-value">${escapeHtml(lead.email || '—')}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Service Requested</span>
        <span class="lead-info-value">${escapeHtml(lead.service || lead.serviceType || '—')}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Budget</span>
        <span class="lead-info-value text-gold fw-600">${escapeHtml(lead.budget || lead.budgetRange || '—')}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Launch Date</span>
        <span class="lead-info-value">${escapeHtml(lead.launchDate || lead.expectedLaunchDate || '—')}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Preferred Contact</span>
        <span class="lead-info-value">${escapeHtml(lead.preferredContact || '—')}</span>
      </div>
      <div class="lead-info-item">
        <span class="lead-info-label">Submitted At</span>
        <span class="lead-info-value" style="color:var(--text-secondary)">${date}</span>
      </div>
      ${hasFile ? `
      <div class="lead-info-item">
        <span class="lead-info-label">Attachment</span>
        <span class="lead-info-value">
          <a href="${escapeHtml(lead.fileUrl || '#')}" target="_blank" style="color:var(--gold);text-decoration:underline;">
            📎 ${escapeHtml(lead.fileName || 'View File')}
          </a>
        </span>
      </div>` : ''}
      <div class="lead-info-item full">
        <span class="lead-info-label">Project Description</span>
        <div class="lead-description">${escapeHtml(lead.description || lead.projectDescription || 'No description provided.')}</div>
      </div>
    </div>

    <!-- Pipeline Stage -->
    <div class="pipeline-section">
      <h4>📋 Pipeline Stage</h4>
      <div class="pipeline-stages" id="pipeline-stages-list">
        ${PIPELINE_STAGES.map(s => `
          <button
            class="pipeline-stage-btn ${s === stage ? 'active' : ''}"
            onclick="updateLeadStage('${lead.id}', '${s}')"
            data-stage="${s}"
          >${s}</button>
        `).join('')}
      </div>
    </div>

    <!-- Notes -->
    <div class="notes-section">
      <h4>🗒️ Notes <span id="notes-count" style="font-size:12px;font-weight:400;color:var(--text-muted);">(loading…)</span></h4>
      <div class="notes-list" id="notes-list">
        <div class="loading-overlay" style="padding:24px;"><div class="spinner"></div></div>
      </div>
      <div class="add-note-form">
        <textarea id="note-input" class="form-control" placeholder="Add a note…" rows="2"></textarea>
        <button class="btn btn-primary btn-sm" onclick="addLeadNote('${lead.id}')">Add</button>
      </div>
    </div>
  `;

  // Action buttons in footer
  document.getElementById('lead-modal-footer').innerHTML = `
    <button class="btn btn-secondary btn-sm" onclick="sendWhatsAppToLead('${escapeHtml(lead.phone || '')}','${escapeHtml(lead.name || '')}')">
      💬 WhatsApp
    </button>
    <button class="btn btn-success btn-sm" onclick="updateLeadStatus('${lead.id}', 'accepted')">
      ✅ Accept
    </button>
    <button class="btn btn-secondary btn-sm" onclick="updateLeadStatus('${lead.id}', 'rejected')">
      ❌ Reject
    </button>
    <button class="btn btn-danger btn-sm" onclick="deleteLead('${lead.id}')">
      🗑 Delete
    </button>
  `;
}

/* ─── LEAD NOTES ────────────────────────────────────────────── */
async function loadLeadNotes(leadId) {
  const list  = document.getElementById('notes-list');
  const count = document.getElementById('notes-count');
  if (!list) return;

  try {
    const snap = await db.collection('leads').doc(leadId)
      .collection('notes')
      .orderBy('createdAt', 'desc')
      .get();

    if (count) count.textContent = `(${snap.size})`;

    if (snap.empty) {
      list.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">No notes yet. Add the first one!</div>`;
      return;
    }

    list.innerHTML = '';
    snap.forEach(doc => {
      const n    = doc.data();
      const when = n.createdAt ? formatDate(n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt)) : '';
      const item = document.createElement('div');
      item.className = 'note-item';
      item.innerHTML = `
        <div class="note-text">${escapeHtml(n.text || '')}</div>
        <div class="note-meta">
          <span>✍️ ${escapeHtml(n.author || 'Admin')} · ${when}</span>
          <button class="note-delete" onclick="deleteLeadNote('${leadId}','${doc.id}')">🗑 Delete</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    console.error('[Notes] Load error:', err);
    if (list) list.innerHTML = `<div style="color:var(--danger);font-size:13px;">Failed to load notes.</div>`;
  }
}

async function addLeadNote(leadId) {
  const input = document.getElementById('note-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) { showToast('Please enter a note.', 'warning'); return; }

  try {
    await db.collection('leads').doc(leadId).collection('notes').add({
      text,
      author:    'Admin',
      createdAt: new Date().toISOString()
    });
    input.value = '';
    await loadLeadNotes(leadId);
    showToast('Note added.', 'success');
  } catch (err) {
    console.error('[Notes] Add error:', err);
    showToast('Failed to add note.', 'error');
  }
}

async function deleteLeadNote(leadId, noteId) {
  if (!confirm('Delete this note?')) return;
  try {
    await db.collection('leads').doc(leadId).collection('notes').doc(noteId).delete();
    await loadLeadNotes(leadId);
    showToast('Note deleted.', 'success');
  } catch (err) {
    console.error('[Notes] Delete error:', err);
    showToast('Failed to delete note.', 'error');
  }
}

/* ─── LEAD STATUS & STAGE ───────────────────────────────────── */
async function updateLeadStatus(leadId, status) {
  try {
    await db.collection('leads').doc(leadId).update({
      status,
      updatedAt: new Date().toISOString()
    });

    // Update local array
    const idx = allLeads.findIndex(l => l.id === leadId);
    if (idx !== -1) allLeads[idx].status = status;

    showToast(`Lead marked as ${status}.`, 'success');
    closeModal('lead-modal');
    renderLeadsTable();
    renderPagination();
    loadDashboardStats();
  } catch (err) {
    console.error('[Leads] Update status error:', err);
    showToast('Failed to update status.', 'error');
  }
}

async function updateLeadStage(leadId, stage) {
  try {
    await db.collection('leads').doc(leadId).update({
      stage,
      updatedAt: new Date().toISOString()
    });

    // Update pipeline UI
    document.querySelectorAll('.pipeline-stage-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.stage === stage);
    });

    // Update local array
    const idx = allLeads.findIndex(l => l.id === leadId);
    if (idx !== -1) allLeads[idx].stage = stage;

    showToast(`Stage updated to "${stage}".`, 'success');
  } catch (err) {
    console.error('[Leads] Update stage error:', err);
    showToast('Failed to update stage.', 'error');
  }
}

/* ─── DELETE LEAD ───────────────────────────────────────────── */
async function deleteLead(leadId) {
  if (!confirm('Permanently delete this lead? This cannot be undone.')) return;
  try {
    await db.collection('leads').doc(leadId).delete();
    allLeads = allLeads.filter(l => l.id !== leadId);
    showToast('Lead deleted.', 'success');
    closeModal('lead-modal');
    renderLeadsTable();
    renderPagination();
    loadDashboardStats();
  } catch (err) {
    console.error('[Leads] Delete error:', err);
    showToast('Failed to delete lead.', 'error');
  }
}

/* ─── WHATSAPP ──────────────────────────────────────────────── */
function sendWhatsAppToLead(phone, name) {
  if (!phone) { showToast('No phone number available.', 'warning'); return; }
  const cleanPhone = phone.replace(/\D/g, '');
  const text = encodeURIComponent(
    `Hello ${name}, this is YashTech Labs Pvt. Ltd. regarding your recent enquiry. We would love to connect with you to discuss your project further. When would be a good time to talk?`
  );
  window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
}

/* ─── PORTFOLIO MANAGER ─────────────────────────────────────── */
async function loadPortfolio() {
  const grid = document.getElementById('portfolio-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="loading-overlay" style="grid-column:1/-1;"><div class="spinner"></div> Loading portfolio…</div>`;

  try {
    const snap = await db.collection('portfolio').orderBy('createdAt', 'desc').get();

    if (snap.empty) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">🖼️</div>
          <h4>No projects yet</h4>
          <p>Add your first portfolio project to get started.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = '';
    snap.forEach(doc => {
      const p = doc.data();
      const techs = (Array.isArray(p.technologies) ? p.technologies : (p.technologies || '').split(',')).map(t => t.trim()).filter(Boolean);

      const card = document.createElement('div');
      card.className = 'portfolio-card';
      card.innerHTML = `
        <div class="portfolio-card-img" id="pf-img-${doc.id}">
          ${p.image
            ? `<img src="${p.image}" alt="${escapeHtml(p.title || '')}" loading="lazy">`
            : '<span style="font-size:40px;color:var(--text-muted)">🖼️</span>'
          }
        </div>
        <div class="portfolio-card-body">
          ${p.category ? `<span class="portfolio-card-category">${escapeHtml(p.category)}</span>` : ''}
          <h4>${escapeHtml(p.title || 'Untitled Project')}</h4>
          <p>${escapeHtml(p.description || '')}</p>
          ${techs.length ? `
            <div class="portfolio-techs">
              ${techs.map(t => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="portfolio-card-actions">
            ${p.projectUrl ? `<a href="${escapeHtml(p.projectUrl)}" target="_blank" class="btn btn-secondary btn-sm">🔗 View</a>` : ''}
            <button class="btn btn-primary btn-sm" onclick="openPortfolioModal('${doc.id}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deletePortfolio('${doc.id}')">🗑</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error('[Portfolio] Load error:', err);
    grid.innerHTML = `<div style="color:var(--danger);text-align:center;padding:40px;grid-column:1/-1;">Failed to load portfolio.</div>`;
  }
}

async function openPortfolioModal(projectId = null) {
  currentPortfolioId = projectId;
  const modal = document.getElementById('portfolio-modal');
  if (!modal) return;

  const title = document.getElementById('portfolio-modal-title');
  if (title) title.textContent = projectId ? 'Edit Project' : 'Add Project';

  // Reset form
  const form = document.getElementById('portfolio-form');
  if (form) form.reset();
  const previewImg = document.getElementById('portfolio-img-preview');
  if (previewImg) previewImg.style.backgroundImage = '';
  const previewEl = document.getElementById('portfolio-preview-container');
  if (previewEl) {
    previewEl.innerHTML = `<span class="preview-icon">📷</span><span>Click to upload image</span>`;
  }

  if (projectId) {
    try {
      const doc = await db.collection('portfolio').doc(projectId).get();
      if (doc.exists) {
        const p = doc.data();
        setValue('pf-title',       p.title       || '');
        setValue('pf-category',    p.category    || '');
        setValue('pf-description', p.description || '');
        setValue('pf-technologies',
          Array.isArray(p.technologies) ? p.technologies.join(', ') : (p.technologies || '')
        );
        setValue('pf-features',
          Array.isArray(p.features) ? p.features.join(', ') : (p.features || '')
        );
        setValue('pf-url',         p.projectUrl  || '');

        if (p.image && previewEl) {
          previewEl.innerHTML = `<img src="${p.image}" alt="Preview" style="width:100%;height:100%;object-fit:cover;position:absolute;border-radius:inherit;">`;
        }
      }
    } catch (err) {
      console.error('[Portfolio] Load for edit error:', err);
      showToast('Failed to load project data.', 'error');
    }
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

async function savePortfolio() {
  const saveBtnEl = document.getElementById('portfolio-save-btn');
  if (saveBtnEl) { saveBtnEl.disabled = true; saveBtnEl.textContent = 'Saving…'; }

  try {
    const title    = getValue('pf-title');
    const category = getValue('pf-category');
    const desc     = getValue('pf-description');
    const techs    = getValue('pf-technologies').split(',').map(t => t.trim()).filter(Boolean);
    const features = getValue('pf-features').split(',').map(f => f.trim()).filter(Boolean);
    const url      = getValue('pf-url');

    if (!title) { showToast('Project title is required.', 'warning'); return; }

    const imgInput = document.getElementById('pf-image');
    let imageData  = null;

    if (imgInput && imgInput.files && imgInput.files[0]) {
      imageData = await fileToBase64(imgInput.files[0]);
    } else if (currentPortfolioId) {
      // Keep existing image
      const existing = await db.collection('portfolio').doc(currentPortfolioId).get();
      if (existing.exists) imageData = existing.data().image || null;
    }

    const data = {
      title,
      category,
      description: desc,
      technologies: techs,
      features:     features,
      projectUrl:   url,
      image:        imageData,
      updatedAt:    new Date().toISOString()
    };

    if (currentPortfolioId) {
      await db.collection('portfolio').doc(currentPortfolioId).update(data);
      showToast('Project updated successfully!', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      await db.collection('portfolio').add(data);
      showToast('Project added successfully!', 'success');
    }

    closeModal('portfolio-modal');
    loadPortfolio();
  } catch (err) {
    console.error('[Portfolio] Save error:', err);
    showToast('Failed to save project.', 'error');
  } finally {
    if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = 'Save Project'; }
  }
}

async function deletePortfolio(projectId) {
  if (!confirm('Delete this portfolio project? This cannot be undone.')) return;
  try {
    await db.collection('portfolio').doc(projectId).delete();
    showToast('Project deleted.', 'success');
    loadPortfolio();
  } catch (err) {
    console.error('[Portfolio] Delete error:', err);
    showToast('Failed to delete project.', 'error');
  }
}

/* ─── PORTFOLIO IMAGE UPLOAD ────────────────────────────────── */
function initPortfolioImageUpload() {
  const container = document.getElementById('portfolio-preview-container');
  const input     = document.getElementById('pf-image');
  if (!container || !input) return;

  container.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be smaller than 5MB.', 'warning');
      return;
    }
    const base64 = await fileToBase64(file);
    container.innerHTML = `<img src="${base64}" alt="Preview" style="width:100%;height:100%;object-fit:cover;position:absolute;border-radius:inherit;">`;
  });
}

/* ─── TESTIMONIALS MANAGER ──────────────────────────────────── */
async function loadTestimonials() {
  const list = document.getElementById('testimonials-list');
  if (!list) return;
  list.innerHTML = `<div class="loading-overlay"><div class="spinner"></div> Loading…</div>`;

  try {
    const snap = await db.collection('testimonials').orderBy('createdAt', 'desc').get();

    if (snap.empty) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⭐</div>
          <h4>No testimonials yet</h4>
          <p>Add your first client testimonial.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    snap.forEach(doc => {
      const t   = doc.data();
      const stars = renderStars(t.rating || 5);
      const card  = document.createElement('div');
      card.className = 'testimonial-card';
      card.innerHTML = `
        <div class="testimonial-photo">
          ${t.photo
            ? `<img src="${t.photo}" alt="${escapeHtml(t.name || '')}">`
            : (t.name || '?')[0].toUpperCase()
          }
        </div>
        <div class="testimonial-body">
          <div class="testimonial-name">${escapeHtml(t.name || '—')}</div>
          <div class="testimonial-company">${escapeHtml(t.company || '')}</div>
          <div class="stars">${stars}</div>
          <div class="testimonial-text">"${escapeHtml(t.text || '')}"</div>
        </div>
        <div class="testimonial-actions">
          <button class="btn-icon view" title="Edit" onclick="openTestimonialModal('${doc.id}')">✏️</button>
          <button class="btn-icon delete" title="Delete" onclick="deleteTestimonial('${doc.id}')">🗑</button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    console.error('[Testimonials] Load error:', err);
    list.innerHTML = `<div style="color:var(--danger);text-align:center;padding:40px;">Failed to load testimonials.</div>`;
  }
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
  }
  return html;
}

async function openTestimonialModal(testimonialId = null) {
  currentTestimonialId = testimonialId;
  testimonialRating    = 5;

  const modal = document.getElementById('testimonial-modal');
  if (!modal) return;

  const title = document.getElementById('testimonial-modal-title');
  if (title) title.textContent = testimonialId ? 'Edit Testimonial' : 'Add Testimonial';

  const form = document.getElementById('testimonial-form');
  if (form) form.reset();

  const previewEl = document.getElementById('testimonial-preview-container');
  if (previewEl) previewEl.innerHTML = `<span class="preview-icon">👤</span><span>Click to upload photo</span>`;

  initTestimonialStars(5);

  if (testimonialId) {
    try {
      const doc = await db.collection('testimonials').doc(testimonialId).get();
      if (doc.exists) {
        const t = doc.data();
        setValue('tm-name',    t.name    || '');
        setValue('tm-company', t.company || '');
        setValue('tm-text',    t.text    || '');
        testimonialRating = t.rating || 5;
        initTestimonialStars(testimonialRating);

        if (t.photo && previewEl) {
          previewEl.innerHTML = `<img src="${t.photo}" alt="Preview" style="width:100%;height:100%;object-fit:cover;position:absolute;border-radius:inherit;">`;
        }
      }
    } catch (err) {
      console.error('[Testimonials] Load for edit error:', err);
    }
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function initTestimonialStars(selected = 5) {
  const container = document.getElementById('rating-stars');
  if (!container) return;

  testimonialRating = selected;
  container.innerHTML = '';

  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `star-btn ${i <= selected ? 'active' : ''}`;
    btn.textContent = '★';
    btn.dataset.rating = i;
    btn.addEventListener('click', () => {
      testimonialRating = i;
      initTestimonialStars(i);
    });
    btn.addEventListener('mouseover', () => {
      container.querySelectorAll('.star-btn').forEach((b, idx) => {
        b.classList.toggle('active', idx < i);
      });
    });
    container.appendChild(btn);
  }

  container.addEventListener('mouseleave', () => initTestimonialStars(testimonialRating));
}

async function saveTestimonial() {
  const saveBtnEl = document.getElementById('testimonial-save-btn');
  if (saveBtnEl) { saveBtnEl.disabled = true; saveBtnEl.textContent = 'Saving…'; }

  try {
    const name    = getValue('tm-name');
    const company = getValue('tm-company');
    const text    = getValue('tm-text');

    if (!name || !text) {
      showToast('Name and testimonial text are required.', 'warning');
      return;
    }

    const imgInput = document.getElementById('tm-photo');
    let photoData  = null;

    if (imgInput && imgInput.files && imgInput.files[0]) {
      photoData = await fileToBase64(imgInput.files[0]);
    } else if (currentTestimonialId) {
      const existing = await db.collection('testimonials').doc(currentTestimonialId).get();
      if (existing.exists) photoData = existing.data().photo || null;
    }

    const data = {
      name,
      company,
      text,
      rating:    testimonialRating,
      photo:     photoData,
      updatedAt: new Date().toISOString()
    };

    if (currentTestimonialId) {
      await db.collection('testimonials').doc(currentTestimonialId).update(data);
      showToast('Testimonial updated!', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      await db.collection('testimonials').add(data);
      showToast('Testimonial added!', 'success');
    }

    closeModal('testimonial-modal');
    loadTestimonials();
  } catch (err) {
    console.error('[Testimonials] Save error:', err);
    showToast('Failed to save testimonial.', 'error');
  } finally {
    if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = 'Save Testimonial'; }
  }
}

async function deleteTestimonial(id) {
  if (!confirm('Delete this testimonial?')) return;
  try {
    await db.collection('testimonials').doc(id).delete();
    showToast('Testimonial deleted.', 'success');
    loadTestimonials();
  } catch (err) {
    console.error('[Testimonials] Delete error:', err);
    showToast('Failed to delete testimonial.', 'error');
  }
}

/* Testimonial photo upload */
function initTestimonialImageUpload() {
  const container = document.getElementById('testimonial-preview-container');
  const input     = document.getElementById('tm-photo');
  if (!container || !input) return;

  container.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      showToast('Photo must be smaller than 2MB.', 'warning');
      return;
    }
    const base64 = await fileToBase64(file);
    container.innerHTML = `<img src="${base64}" alt="Preview" style="width:100%;height:100%;object-fit:cover;position:absolute;border-radius:inherit;">`;
  });
}

/* ─── SETTINGS ──────────────────────────────────────────────── */
async function loadSettings() {
  try {
    const doc = await db.collection('settings').doc('main').get();
    if (!doc.exists) return;
    const s = doc.data();

    // Support both old keys (companyPhone) and new keys (phone)
    setValue('set-company',   s.companyName  || s.company   || '');
    setValue('set-phone',     s.companyPhone || s.phone     || '');
    setValue('set-email',     s.companyEmail || s.email     || '');
    setValue('set-address',   s.companyAddress || s.address || '');
    setValue('set-whatsapp',  s.whatsappNumber || s.whatsapp || '');
    setValue('set-instagram', s.instagramUrl  || s.instagram || '');
    setValue('set-facebook',  s.facebookUrl   || s.facebook  || '');
    setValue('set-linkedin',  s.linkedinUrl   || s.linkedin  || '');
    setValue('set-twitter',   s.twitterUrl    || s.twitter   || '');
    setValue('set-tagline',   s.tagline       || 'Crafted for Growth');
    setValue('set-gstin',     s.gstin         || '');

    // Load custom brand logo
    const logoPreview = document.getElementById('logo-preview');
    if (logoPreview) {
      logoPreview.src = s.logo || 'images/logo.jpg';
    }
    const sidebarLogoImg = document.getElementById('sidebar-logo-img');
    if (sidebarLogoImg) {
      sidebarLogoImg.src = s.logo || 'images/logo.jpg';
    }
  } catch (err) {
    console.error('[Settings] Load error:', err);
    showToast('Failed to load settings.', 'error');
  }
}

function initSettingsForm() {
  const form = document.getElementById('settings-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings();
  });
  initLogoImageUpload();
}

async function saveSettings() {
  const saveBtnEl = document.getElementById('settings-save-btn');
  if (saveBtnEl) { saveBtnEl.disabled = true; saveBtnEl.textContent = 'Saving…'; }

  try {
    const data = {
      companyName:     getValue('set-company'),
      companyPhone:    getValue('set-phone'),
      companyEmail:    getValue('set-email'),
      companyAddress:  getValue('set-address'),
      whatsappNumber:  getValue('set-whatsapp'),
      instagramUrl:    getValue('set-instagram'),
      facebookUrl:     getValue('set-facebook'),
      linkedinUrl:     getValue('set-linkedin'),
      twitterUrl:      getValue('set-twitter'),
      tagline:         getValue('set-tagline'),
      gstin:           getValue('set-gstin'),
      updatedAt:   new Date().toISOString()
    };

    const logoInput = document.getElementById('set-logo-input');
    if (logoInput && logoInput.files && logoInput.files[0]) {
      const base64 = await fileToBase64(logoInput.files[0]);
      data.logo = base64;

      const sidebarLogoImg = document.getElementById('sidebar-logo-img');
      if (sidebarLogoImg) sidebarLogoImg.src = base64;
    }

    await db.collection('settings').doc('main').set(data, { merge: true });
    showToast('Settings saved successfully!', 'success');
  } catch (err) {
    console.error('[Settings] Save error:', err);
    showToast('Failed to save settings.', 'error');
  } finally {
    if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = '💾 Save Settings'; }
  }
}

function initLogoImageUpload() {
  const container = document.getElementById('logo-preview-container');
  const input     = document.getElementById('set-logo-input');
  if (!container || !input) return;

  container.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo image must be smaller than 2MB.', 'warning');
      return;
    }
    const base64 = await fileToBase64(file);
    const previewEl = document.getElementById('logo-preview');
    if (previewEl) {
      previewEl.src = base64;
    }
  });
}

/* ─── PASSWORD CHANGE ───────────────────────────────────────── */
function initPasswordForm() {
  const form = document.getElementById('password-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwMsg = document.getElementById('pw-message');

    const current  = getValue('pw-current');
    const newPw    = getValue('pw-new');
    const confirm  = getValue('pw-confirm');

    const btn = document.getElementById('pw-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    if (pwMsg) { pwMsg.className = ''; pwMsg.textContent = ''; }

    try {
      await changePassword(current, newPw, confirm);
      if (pwMsg) {
        pwMsg.className = 'form-hint text-success mt-8';
        pwMsg.textContent = '✅ Password updated successfully!';
      }
      form.reset();
    } catch (err) {
      if (pwMsg) {
        pwMsg.className = 'form-hint text-danger mt-8';
        pwMsg.textContent = `❌ ${err.message || 'Failed to update password.'}`;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔐 Update Password'; }
    }
  });
}

/* ─── MODAL HELPERS ─────────────────────────────────────────── */
function initModalCloseHandlers() {
  ['lead-modal', 'portfolio-modal', 'testimonial-modal'].forEach(id => {
    const modal = document.getElementById(id);
    if (!modal) return;

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(id);
    });

    // Close button
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal(id));
    }
  });

  // Portfolio modal buttons
  const pfSave = document.getElementById('portfolio-save-btn');
  if (pfSave) pfSave.addEventListener('click', savePortfolio);

  const tmSave = document.getElementById('testimonial-save-btn');
  if (tmSave) tmSave.addEventListener('click', saveTestimonial);

  // Init image upload handlers after modals are in DOM
  initPortfolioImageUpload();
  initTestimonialImageUpload();

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['lead-modal', 'portfolio-modal', 'testimonial-modal'].forEach(id => {
        const modal = document.getElementById(id);
        if (modal && !modal.classList.contains('hidden')) closeModal(id);
      });
    }
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  currentLeadId          = null;
  currentPortfolioId     = null;
  currentTestimonialId   = null;
}

/* ─── UTILITIES ─────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '—';
  return date.toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute:'2-digit',
    hour12: true
  });
}

function statusBadge(status) {
  const s = (status || 'pending').toLowerCase();
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  const cls   = `badge-${s}`;
  return `<span class="badge ${cls}">${label}</span>`;
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
