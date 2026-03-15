const state = {
  token: localStorage.getItem('aufsatztrainer_token') || '',
  role: localStorage.getItem('aufsatztrainer_role') || '',
  student: null,
  selectedStudentId: null,
  analysis: null,
  students: []
};

const el = id => document.getElementById(id);
const loginView = el('loginView');
const appView = el('appView');
const loginStatus = el('loginStatus');
const welcomeTitle = el('welcomeTitle');
const adminPanel = el('adminPanel');
const studentPanel = el('studentPanel');
const studentSelect = el('studentSelect');
const themeSuggestions = el('themeSuggestions');
const essayTitle = el('essayTitle');
const essayContent = el('essayContent');
const statusEl = el('status');
const resultPoints = el('resultPoints');
const resultGrade = el('resultGrade');
const resultXp = el('resultXp');
const resultSummary = el('resultSummary');
const tipsList = el('tipsList');
const corrections = el('corrections');
const wordMistakes = el('wordMistakes');
const historyList = el('historyList');
const historySearch = el('historySearch');
const essayDetail = el('essayDetail');
const detailBreadcrumbs = el('detailBreadcrumbs');
const breadcrumbs = el('breadcrumbs');
const dailyQuestText = el('dailyQuestText');
const heroStats = el('heroStats');

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getSelectedInterests() {
  return Array.from(document.querySelectorAll('.chip.active')).map(button => button.dataset.interest);
}

function getSelectedStudentId() {
  if (state.role === 'student') return state.student?.id || null;
  return Number(studentSelect.value) || null;
}

function resetAnalysis() {
  state.analysis = null;
  resultPoints.textContent = '-';
  resultGrade.textContent = '-';
  resultXp.textContent = '-';
  resultSummary.textContent = 'Noch keine Prüfung.';
  tipsList.innerHTML = '';
  corrections.innerHTML = '<p class="detail-empty">Noch keine Korrektur vorhanden.</p>';
  wordMistakes.innerHTML = 'Noch keine Fehlerwörter vorhanden.';
}

function clearEditor() {
  essayTitle.value = '';
  essayContent.value = '';
  breadcrumbs.textContent = 'Start > Quest';
  statusEl.textContent = 'Quest-Feld geleert.';
  resetAnalysis();
}

function renderThemes(items) {
  const list = (items || []).map((item, index) => ({
    title: typeof item === 'string' ? item : item.title,
    key: typeof item === 'string' ? 'roblox' : (item.key || 'roblox'),
    label: typeof item === 'string' ? 'Quest' : (item.label || 'Quest'),
    selected: index === 0
  }));

  themeSuggestions.innerHTML = list.map(item => `
    <button class="theme-card ${item.selected ? 'selected' : ''}" data-title="${escapeHtml(item.title)}" data-key="${escapeHtml(item.key)}">
      <span class="mini-badge">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.title)}</strong>
    </button>
  `).join('');

  themeSuggestions.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      themeSuggestions.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      essayTitle.value = card.dataset.title;
      breadcrumbs.textContent = `Start > Quest > ${card.dataset.title}`;
    });
  });

  const first = themeSuggestions.querySelector('.theme-card');
  if (first) {
    first.click();
    dailyQuestText.textContent = first.dataset.title;
  }
}

async function loadThemes() {
  const interests = state.role === 'student'
    ? (state.student?.interests || ['roblox'])
    : getSelectedInterests();
  const data = await api(`/api/themes?interests=${encodeURIComponent((interests.length ? interests : ['roblox']).join(','))}&seed=${Date.now()}`);
  renderThemes(data.suggestions || []);
}

function renderWordMistakes(items) {
  wordMistakes.innerHTML = (items || []).length
    ? items.map(item => `<div class="mistake-item"><span class="wrong">${escapeHtml(item.wrong)}</span><span class="arrow">→</span><span class="right">${escapeHtml(item.right)}</span><div class="small">${escapeHtml(item.rule)}</div></div>`).join('')
    : 'Noch keine Fehlerwörter vorhanden.';
}

function renderAnalysis(data) {
  state.analysis = data;
  resultPoints.textContent = data.points ?? '-';
  resultGrade.textContent = data.gradeText ?? '-';
  resultXp.textContent = data.gamification?.xp ?? '-';
  resultSummary.textContent = data.summary || 'Kein Feedback';
  tipsList.innerHTML = (data.tips || []).map(tip => `<li>${escapeHtml(tip)}</li>`).join('');
  corrections.innerHTML = (data.corrections || []).map(item => `
    <details class="correction-item" ${item.changed ? 'open' : ''}>
      <summary><span class="${item.changed ? 'text-error' : 'text-ok'}">${item.changed ? 'Verbessert' : 'Schon gut'}</span> ${escapeHtml(item.original)}</summary>
      <p><strong class="text-error">Original:</strong> ${escapeHtml(item.original)}</p>
      <p><strong class="text-ok">Korrektur:</strong> ${escapeHtml(item.corrected)}</p>
      <p class="small">${escapeHtml(item.explanation)}</p>
    </details>
  `).join('') || '<p class="detail-empty">Noch keine Korrektur vorhanden.</p>';
  renderWordMistakes(data.wordMistakes || []);
}

function updateHero(stats) {
  heroStats.hidden = false;
  el('heroXp').textContent = stats.totalXp || 0;
  el('heroLevel').textContent = stats.level || 1;
  el('heroQuests').textContent = stats.completedQuests || 0;
  el('essayCount').textContent = stats.essayCount || 0;
  el('avgPoints').textContent = stats.avgPoints || 0;
  el('latestGrade').textContent = stats.latest?.grade_text || '-';
  el('trendValue').textContent = stats.trend > 0 ? `+${stats.trend}` : `${stats.trend || 0}`;
  el('startGrade').textContent = stats.firstEssay?.grade_text || '-';
  el('currentGrade').textContent = stats.latest?.grade_text || '-';
  el('improvementValue').textContent = stats.improvement > 0 ? `+${stats.improvement} Punkte` : `${stats.improvement || 0} Punkte`;
  el('topMistakes').textContent = stats.topMistakes?.length ? stats.topMistakes.join(' • ') : 'Noch keine Daten';
  el('xpBar').style.width = `${Math.min(100, ((stats.totalXp || 0) % 120) / 1.2)}%`;
}

async function loadStats() {
  const id = getSelectedStudentId();
  if (!id) return;
  const stats = await api(`/api/stats${state.role === 'admin' ? `?studentId=${id}` : ''}`);
  updateHero(stats);
}

function renderHistory(items) {
  const q = historySearch.value.trim().toLowerCase();
  const filtered = (items || []).filter(item => (item.title || '').toLowerCase().includes(q));
  historyList.innerHTML = filtered.length ? filtered.map(item => `
    <button class="history-card" data-id="${item.id}">
      <strong>${escapeHtml(item.title)}</strong>
      <div class="small">${new Date(item.created_at).toLocaleString('de-DE')} • Note ${escapeHtml(item.grade_text)}</div>
    </button>
  `).join('') : '<p class="detail-empty">Noch keine gespeicherten Aufsätze.</p>';

  historyList.querySelectorAll('.history-card').forEach(btn => {
    btn.addEventListener('click', async () => {
      const essay = await api(`/api/essay/${btn.dataset.id}`);
      detailBreadcrumbs.textContent = `Start > Bibliothek > ${essay.title || 'Ohne Titel'}`;
      essayDetail.innerHTML = `
        <h3>${escapeHtml(essay.title || 'Ohne Titel')}</h3>
        <p class="small">${new Date(essay.created_at).toLocaleString('de-DE')} • Themawelt: ${escapeHtml(essay.theme || 'frei')}</p>
        <div class="essay-text">${escapeHtml(essay.content || '').replaceAll('\n', '<br>')}</div>
      `;
    });
  });
}

async function loadHistory() {
  const id = getSelectedStudentId();
  if (!id) return;
  const items = await api(`/api/essays${state.role === 'admin' ? `?studentId=${id}` : ''}`);
  renderHistory(items);
}

async function bootstrap() {
  if (!state.token) return;
  try {
    const me = await api('/api/me');
    state.role = me.role;
    localStorage.setItem('aufsatztrainer_role', state.role);
    if (me.role === 'student') state.student = me.student;
    loginView.hidden = true;
    appView.hidden = false;
    adminPanel.hidden = state.role !== 'admin';
    welcomeTitle.textContent = state.role === 'admin' ? 'Admin-Bereich' : `Willkommen, ${state.student.name}`;

    if (state.role === 'admin') {
      state.students = await api('/api/admin/students');
      studentSelect.innerHTML = state.students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.grade)})</option>`).join('');
      studentSelect.addEventListener('change', async () => { clearEditor(); await loadStats(); await loadHistory(); await loadThemes(); });
    }

    await loadStats();
    await loadHistory();
    await loadThemes();
  } catch {
    localStorage.removeItem('aufsatztrainer_token');
    localStorage.removeItem('aufsatztrainer_role');
    state.token = '';
    loginView.hidden = false;
    appView.hidden = true;
  }
}

el('studentLoginBtn').addEventListener('click', async () => {
  try {
    const data = await api('/api/login/student', {
      method: 'POST',
      body: JSON.stringify({ name: el('loginName').value, pin: el('loginPin').value })
    });
    state.token = data.token;
    state.role = data.role;
    state.student = data.student;
    localStorage.setItem('aufsatztrainer_token', state.token);
    localStorage.setItem('aufsatztrainer_role', state.role);
    bootstrap();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

el('adminLoginBtn').addEventListener('click', async () => {
  try {
    const data = await api('/api/login/admin', {
      method: 'POST',
      body: JSON.stringify({ pin: el('adminPin').value })
    });
    state.token = data.token;
    state.role = data.role;
    localStorage.setItem('aufsatztrainer_token', state.token);
    localStorage.setItem('aufsatztrainer_role', state.role);
    bootstrap();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

el('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('aufsatztrainer_token');
  localStorage.removeItem('aufsatztrainer_role');
  location.reload();
});

el('createStudentBtn').addEventListener('click', async () => {
  try {
    const student = await api('/api/admin/students', {
      method: 'POST',
      body: JSON.stringify({
        name: el('newStudentName').value,
        grade: el('newStudentGrade').value,
        pin: el('newStudentPin').value,
        interests: getSelectedInterests()
      })
    });
    statusEl.textContent = `Profil für ${student.name} angelegt.`;
    state.students = await api('/api/admin/students');
    studentSelect.innerHTML = state.students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.grade)})</option>`).join('');
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

el('refreshThemesBtn').addEventListener('click', () => loadThemes());
el('clearBtn').addEventListener('click', clearEditor);
historySearch.addEventListener('input', () => loadHistory());

el('checkBtn').addEventListener('click', async () => {
  try {
    const interests = state.role === 'student' ? (state.student?.interests || []) : getSelectedInterests();
    const analysis = await api('/api/check', {
      method: 'POST',
      body: JSON.stringify({ title: essayTitle.value, content: essayContent.value, interests })
    });
    renderAnalysis(analysis);
    statusEl.textContent = 'Quest geprüft.';
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

el('saveBtn').addEventListener('click', async () => {
  if (!state.analysis) {
    statusEl.textContent = 'Bitte zuerst prüfen.';
    return;
  }
  try {
    const themeButton = themeSuggestions.querySelector('.theme-card.selected');
    await api('/api/essays', {
      method: 'POST',
      body: JSON.stringify({
        title: essayTitle.value,
        content: essayContent.value,
        theme: themeButton?.dataset.key || 'frei',
        analysis: state.analysis
      })
    });
    statusEl.textContent = 'Quest gespeichert.';
    await loadStats();
    await loadHistory();
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

Array.from(document.querySelectorAll('.chip')).forEach(chip => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});

bootstrap();
