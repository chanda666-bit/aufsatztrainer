const studentName = document.getElementById('studentName');
const studentGrade = document.getElementById('studentGrade');
const addStudentBtn = document.getElementById('addStudentBtn');
const studentSelect = document.getElementById('studentSelect');
const essayTitle = document.getElementById('essayTitle');
const essayContent = document.getElementById('essayContent');
const checkBtn = document.getElementById('checkBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const resultPoints = document.getElementById('resultPoints');
const resultGrade = document.getElementById('resultGrade');
const resultXp = document.getElementById('resultXp');
const resultSummary = document.getElementById('resultSummary');
const tipsList = document.getElementById('tipsList');
const correctionsEl = document.getElementById('corrections');
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const essayDetail = document.getElementById('essayDetail');
const essayCount = document.getElementById('essayCount');
const avgPoints = document.getElementById('avgPoints');
const latestGrade = document.getElementById('latestGrade');
const trendValue = document.getElementById('trendValue');
const levelValue = document.getElementById('levelValue');
const xpBar = document.getElementById('xpBar');
const badgeRow = document.getElementById('badgeRow');
const themeSuggestions = document.getElementById('themeSuggestions');
const refreshThemesBtn = document.getElementById('refreshThemesBtn');
const breadcrumbs = document.getElementById('breadcrumbs');
const detailBreadcrumbs = document.getElementById('detailBreadcrumbs');
const heroXp = document.getElementById('heroXp');
const heroLevel = document.getElementById('heroLevel');
const heroQuests = document.getElementById('heroQuests');
const startGrade = document.getElementById('startGrade');
const currentGrade = document.getElementById('currentGrade');
const improvementValue = document.getElementById('improvementValue');
const topMistakes = document.getElementById('topMistakes');
const wordMistakesEl = document.getElementById('wordMistakes');

let studentsCache = [];
let historyCache = [];
let currentTheme = 'roblox';
let lastAnalysis = null;

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Fehler');
  return data;
}

function getSelectedStudent() {
  const id = Number(studentSelect.value);
  return studentsCache.find((item) => item.id === id) || null;
}

function getSelectedInterests() {
  return Array.from(document.querySelectorAll('.chip.active')).map((button) => button.dataset.interest);
}

function setBreadcrumbTrail(text) {
  breadcrumbs.textContent = `Start > ${text}`;
}

function resetAnalysisView() {
  lastAnalysis = null;
  resultPoints.textContent = '-';
  resultGrade.textContent = '-';
  resultXp.textContent = '-';
  resultSummary.textContent = 'Noch keine Prüfung.';
  tipsList.innerHTML = '';
  badgeRow.innerHTML = '';
  correctionsEl.innerHTML = '<p class="detail-empty">Noch keine Korrektur vorhanden.</p>';
  wordMistakesEl.innerHTML = 'Noch keine Fehlerwörter vorhanden.';
}

function clearQuestEditor() {
  essayTitle.value = '';
  essayContent.value = '';
  statusEl.textContent = 'Quest-Feld geleert.';
  setBreadcrumbTrail('Quest');
  resetAnalysisView();
}

function renderThemeSuggestions(suggestions) {
  const normalized = (suggestions || []).map((item, index) => {
    if (typeof item === 'string') {
      return {
        title: item,
        key: currentTheme || 'theme',
        label: 'Quest'
      };
    }

    return {
      title: item.title || item.name || item.text || `Thema ${index + 1}`,
      key: item.key || item.theme || currentTheme || 'theme',
      label: item.label || item.badge || 'Quest'
    };
  });

  if (!normalized.length) {
    themeSuggestions.innerHTML = `
      <div class="detail-empty">Keine Themen gefunden. Bitte „Neue Themen“ klicken.</div>
    `;
    return;
  }

  themeSuggestions.innerHTML = normalized.map((item, index) => `
    <button class="theme-card ${index === 0 ? 'selected' : ''}" data-theme-title="${escapeHtml(item.title)}" data-theme-key="${escapeHtml(item.key)}" type="button">
      <span class="mini-badge">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.title)}</strong>
    </button>
  `).join('');

  const cards = themeSuggestions.querySelectorAll('.theme-card');
  cards.forEach((card) => {
    card.addEventListener('click', () => selectThemeCard(card));
  });

  if (cards[0]) selectThemeCard(cards[0]);
}

function selectThemeCard(card) {
  themeSuggestions.querySelectorAll('.theme-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  essayTitle.value = card.dataset.themeTitle;
  currentTheme = card.dataset.themeKey || currentTheme;
  setBreadcrumbTrail(`Quest > ${card.dataset.themeTitle}`);
}

async function loadThemeSuggestions() {
  const student = getSelectedStudent();
  const interests = student?.interests?.length ? student.interests : getSelectedInterests();

  const interestList = Array.isArray(interests) && interests.length
    ? interests
    : [currentTheme || 'roblox'];

  const data = await api(`/api/themes?interests=${encodeURIComponent(interestList.join(','))}&seed=${Date.now()}`);

  const suggestions =
    data?.suggestions ||
    data?.themes ||
    data?.items ||
    [];

  renderThemeSuggestions(suggestions);
}

function renderWordMistakes(items) {
  if (!items || !items.length) {
    wordMistakesEl.innerHTML = 'Noch keine Fehlerwörter vorhanden.';
    return;
  }
  wordMistakesEl.innerHTML = items.map((item) => `
    <div class="mistake-item">
      <div class="mistake-words"><span class="wrong">${escapeHtml(item.wrong)}</span><span class="arrow">→</span><span class="right">${escapeHtml(item.right)}</span></div>
      <div class="small">${escapeHtml(item.rule)}</div>
    </div>
  `).join('');
}

function renderAnalysis(analysis) {
  resultPoints.textContent = analysis.points ?? '-';
  resultGrade.textContent = analysis.gradeText ?? '-';
  resultXp.textContent = analysis.gamification?.xp ?? '-';
  resultSummary.textContent = analysis.summary || 'Kein Feedback';
  tipsList.innerHTML = (analysis.tips || []).map((tip) => `<li>${escapeHtml(tip)}</li>`).join('');
  badgeRow.innerHTML = (analysis.gamification?.badges || []).map((badge) => `<span class="badge purple">${escapeHtml(badge)}</span>`).join('');
  correctionsEl.innerHTML = (analysis.corrections || []).map((item) => `
    <details class="correction-item compact-correction" ${item.changed ? 'open' : ''}>
      <summary>
        <span class="summary-label ${item.changed ? 'error' : 'ok'}">${item.changed ? 'Verbessert' : 'Schon gut'}</span>
        <span>${escapeHtml(item.original)}</span>
      </summary>
      <div class="correction-body">
        <p><strong class="text-error">Original:</strong> ${escapeHtml(item.original)}</p>
        <p><strong class="text-ok">Korrektur:</strong> ${escapeHtml(item.corrected)}</p>
        <p class="small">${escapeHtml(item.explanation)}</p>
      </div>
    </details>
  `).join('') || '<p class="detail-empty">Noch keine Korrektur.</p>';
  renderWordMistakes(analysis.wordMistakes || []);
}

function renderHistory() {
  const query = historySearch.value.trim().toLowerCase();
  const filtered = historyCache.filter((item) => (item.title || '').toLowerCase().includes(query));
  historyList.innerHTML = filtered.length ? filtered.map((item) => `
    <button class="history-card" type="button" data-id="${item.id}">
      <div class="history-top">
        <strong>${escapeHtml(item.title || 'Ohne Titel')}</strong>
        <span class="badge">Note ${escapeHtml(item.grade_text)}</span>
      </div>
      <div class="history-meta">${new Date(item.created_at).toLocaleString('de-DE')} • ${escapeHtml(item.theme || 'Freies Thema')}</div>
      <div class="history-meta">Punkte: ${item.points}</div>
    </button>
  `).join('') : '<p class="detail-empty">Noch keine gespeicherten Aufsätze.</p>';

  Array.from(historyList.querySelectorAll('.history-card')).forEach((button) => {
    button.addEventListener('click', async () => {
      const essay = await api(`/api/essay/${button.dataset.id}`);
      renderEssayDetail(essay);
    });
  });
}

function renderEssayDetail(essay) {
  detailBreadcrumbs.textContent = `Start > ${getSelectedStudent()?.name || 'Spieler'} > Aufsätze > ${essay.title || 'Ohne Titel'}`;
  essayDetail.innerHTML = `
    <h3>${escapeHtml(essay.title || 'Ohne Titel')}</h3>
    <p class="small">${new Date(essay.created_at).toLocaleString('de-DE')} • Themawelt: ${escapeHtml(essay.theme || 'Freies Thema')}</p>
    <div class="score-row compact">
      <div class="score-box"><span>Punkte</span><strong>${essay.points}</strong></div>
      <div class="score-box"><span>Note</span><strong>${escapeHtml(essay.grade_text)}</strong></div>
    </div>
    <p>${escapeHtml(essay.summary || '')}</p>
    <h4>Fehlerwörter</h4>
    <div class="mistake-list">${(essay.wordMistakes || []).map((item) => `<div class="mistake-item"><div class="mistake-words"><span class="wrong">${escapeHtml(item.wrong)}</span><span class="arrow">→</span><span class="right">${escapeHtml(item.right)}</span></div><div class="small">${escapeHtml(item.rule)}</div></div>`).join('') || 'Keine Fehlerwörter gespeichert.'}</div>
    <h4>Aufsatz</h4>
    <div class="essay-text">${escapeHtml(essay.content || '').replaceAll('\n', '<br>')}</div>
    <h4>Tipps</h4>
    <ul>${(essay.tips || []).map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>
  `;
}

async function loadStudents() {
  studentsCache = await api('/api/students');
  studentSelect.innerHTML = studentsCache.length
    ? studentsCache.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.grade)})</option>`).join('')
    : '<option value="">Bitte zuerst ein Profil anlegen</option>';

  if (studentsCache.length) {
    await loadStats();
    await loadHistory();
    await loadThemeSuggestions();
    clearQuestEditor();
    statusEl.textContent = 'Spieler geladen.';
  } else {
    historyList.innerHTML = '<p class="detail-empty">Noch keine Aufsätze gespeichert.</p>';
    resetAnalysisView();
  }
}

async function loadStats() {
  const student = getSelectedStudent();
  if (!student) return;
  const stats = await api(`/api/stats/${student.id}`);
  essayCount.textContent = stats.essayCount ?? 0;
  avgPoints.textContent = stats.avgPoints ?? 0;
  latestGrade.textContent = stats.latest?.grade_text ?? '-';
  trendValue.textContent = stats.trend > 0 ? `+${stats.trend}` : `${stats.trend}`;
  levelValue.textContent = stats.level ?? 1;
  heroXp.textContent = stats.totalXp ?? 0;
  heroLevel.textContent = stats.level ?? 1;
  heroQuests.textContent = stats.completedQuests ?? 0;
  xpBar.style.width = `${Math.min(100, ((stats.totalXp || 0) % 120) / 1.2)}%`;
  startGrade.textContent = stats.firstEssay?.grade_text ?? '-';
  currentGrade.textContent = stats.latest?.grade_text ?? '-';
  improvementValue.textContent = stats.improvement > 0 ? `+${stats.improvement} Punkte` : `${stats.improvement} Punkte`;
  topMistakes.textContent = stats.topMistakes?.length ? stats.topMistakes.join(' • ') : 'Noch keine Daten';
}

async function loadHistory() {
  const student = getSelectedStudent();
  if (!student) return;
  historyCache = await api(`/api/essays/${student.id}`);
  renderHistory();
  if (historyCache[0]) {
    const detail = await api(`/api/essay/${historyCache[0].id}`);
    renderEssayDetail(detail);
  } else {
    detailBreadcrumbs.textContent = `Start > ${student.name} > Bibliothek`;
    essayDetail.innerHTML = 'Wähle links einen gespeicherten Aufsatz aus.';
  }
}

Array.from(document.querySelectorAll('.chip')).forEach((chip) => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    loadThemeSuggestions().catch(() => {});
  });
});

addStudentBtn.addEventListener('click', async () => {
  try {
    if (!studentName.value.trim()) return alert('Bitte einen Namen eingeben.');
    await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({
        name: studentName.value,
        grade: studentGrade.value,
        interests: getSelectedInterests()
      })
    });
    studentName.value = '';
    await loadStudents();
    statusEl.textContent = 'Spielerprofil angelegt.';
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

studentSelect.addEventListener('change', async () => {
  clearQuestEditor();
  await loadStats();
  await loadHistory();
  await loadThemeSuggestions();
  statusEl.textContent = 'Spieler gewechselt.';
});

refreshThemesBtn.addEventListener('click', () => {
  loadThemeSuggestions().then(() => {
    statusEl.textContent = 'Neue Themen geladen.';
  }).catch((error) => {
    statusEl.textContent = error.message;
  });
});

historySearch.addEventListener('input', renderHistory);
clearBtn.addEventListener('click', clearQuestEditor);

checkBtn.addEventListener('click', async () => {
  try {
    statusEl.textContent = 'Quest wird geprüft...';
    const student = getSelectedStudent();
    lastAnalysis = await api('/api/correct-essay', {
      method: 'POST',
      body: JSON.stringify({
        title: essayTitle.value,
        content: essayContent.value,
        theme: currentTheme,
        interests: student?.interests || getSelectedInterests()
      })
    });
    renderAnalysis(lastAnalysis);
    statusEl.textContent = lastAnalysis.source === 'offline-fallback'
      ? 'Offline-Prüfung genutzt. Für noch mehr Details API aktiv lassen.'
      : 'Quest erfolgreich geprüft.';
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

saveBtn.addEventListener('click', async () => {
  try {
    const student = getSelectedStudent();
    if (!student) return alert('Bitte zuerst einen Spieler auswählen.');
    if (!lastAnalysis) return alert('Bitte zuerst prüfen.');
    await api('/api/essays', {
      method: 'POST',
      body: JSON.stringify({
        studentId: student.id,
        title: essayTitle.value,
        theme: currentTheme,
        content: essayContent.value,
        analysis: lastAnalysis
      })
    });
    statusEl.textContent = 'Quest gespeichert.';
    await loadStats();
    await loadHistory();
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

loadStudents().catch((error) => {
  statusEl.textContent = `Startfehler: ${error.message}`;
});
