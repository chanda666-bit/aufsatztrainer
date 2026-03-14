import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { initDb, all, get, run } from './database.js';

dotenv.config();
initDb();

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.join(__dirname, '../frontend');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(frontendDir));

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const THEME_LIBRARY = {
  roblox: [
    'Mein verrücktestes Roblox-Abenteuer',
    'Das geheime Portal in Roblox City',
    'Ein Tag als Baumeister in Roblox',
    'Das verlorene Pet im Block-Labor',
    'Die Rettungsmission auf der Sky-Map'
  ],
  fortnite: [
    'Das spannendste Fortnite-Match meines Lebens',
    'Wie mein Team in letzter Sekunde gewonnen hat',
    'Die geheimnisvolle Insel nach dem Sturm',
    'Ein perfekter Plan für den letzten Kreis',
    'Als ich meinen Freund aus der Gefahr rettete'
  ],
  schach: [
    'Die wichtigste Partie gegen den Schulmeister',
    'Wie ich mit einem Springer das Spiel rettete',
    'Mein Schachturnier voller Überraschungen',
    'Der mutige Angriff auf den schwarzen König',
    'Mein klügster Zug in letzter Sekunde'
  ],
  fussball: [
    'Das entscheidende Tor im Finale',
    'Ein chaotischer Tag beim Fußballtraining',
    'Wie unser Team trotz Rückstand gewann',
    'Der Regen machte das Spiel noch spannender',
    'Mein schönster Pass im ganzen Jahr'
  ],
  fantasy: [
    'Der Drache im verbotenen Wald',
    'Die Karte zum geheimen Königreich',
    'Mein Abenteuer mit einem magischen Schwert',
    'Die verschwundene Krone der Nacht',
    'Der geheimnisvolle Wächter am Fluss'
  ],
  schule: [
    'Mein aufregendster Schultag',
    'Das seltsame Geräusch im Klassenraum',
    'Wie wir als Klasse ein Problem gelöst haben',
    'Der Tag, an dem die Lehrerin überrascht war',
    'Ein Klassenausflug, den ich nie vergesse'
  ]
};

const THEME_LABELS = {
  roblox: 'Roblox',
  fortnite: 'Fortnite',
  schach: 'Schach',
  fussball: 'Fußball',
  fantasy: 'Fantasy',
  schule: 'Schule'
};

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function normalizeEssay(row) {
  return {
    ...row,
    tips: safeParseJson(row.tips, []),
    corrections: safeParseJson(row.corrections, []),
    mistakes: safeParseJson(row.mistakes, []),
    wordMistakes: safeParseJson(row.word_mistakes, [])
  };
}

function shuffle(array, seed = Date.now()) {
  const items = [...array];
  let currentSeed = Number(seed) || Date.now();
  for (let i = items.length - 1; i > 0; i -= 1) {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    const j = Math.floor((currentSeed / 233280) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function pickThemeSuggestions(interests = [], seed = Date.now()) {
  const keys = interests.length ? interests : ['roblox', 'fortnite', 'schach'];
  const unique = [];
  keys.forEach((key) => {
    const shuffled = shuffle(THEME_LIBRARY[key] || [], seed + key.length);
    shuffled.slice(0, 2).forEach((item) => {
      if (!unique.includes(item)) unique.push(item);
    });
  });
  return shuffle(unique, seed + 99).slice(0, 6);
}

function detectFrequentMistakes(text) {
  const hints = [];
  const lower = text || '';
  if (/\b[a-zäöü][^.!?\n]*(?:\.|$)/.test(lower)) hints.push('Satzanfänge groß schreiben');
  if ((lower.match(/\bund\b/gi) || []).length >= 3) hints.push('Lange Sätze öfter trennen');
  if (/\b(hund|katze|park|haus|schule|mutter|ball|freund)\b/.test(lower)) hints.push('Nomen sicher großschreiben');
  if (/\bein hund\b/gi.test(lower)) hints.push('Artikel genauer prüfen');
  return hints.slice(0, 3);
}

function detectWordMistakes(text) {
  const checks = [
    { wrong: /\bein hund\b/gi, right: 'einen Hund', rule: 'Akkusativ mit „Hund“: meistens „einen Hund“.' },
    { wrong: /\bpark\b/g, right: 'Park', rule: 'Nomen werden großgeschrieben.' },
    { wrong: /\bschule\b/g, right: 'Schule', rule: 'Nomen werden großgeschrieben.' },
    { wrong: /\bhaus\b/g, right: 'Haus', rule: 'Nomen werden großgeschrieben.' },
    { wrong: /\bmutter\b/g, right: 'Mutter', rule: 'Nomen werden großgeschrieben.' },
    { wrong: /\bhund\b/g, right: 'Hund', rule: 'Nomen werden großgeschrieben.' },
    { wrong: /\bfreund\b/g, right: 'Freund', rule: 'Nomen werden großgeschrieben.' },
    { wrong: /^ich\b/m, right: 'Ich', rule: 'Am Satzanfang beginnt man groß.' }
  ];

  const found = [];
  for (const check of checks) {
    if (check.wrong.test(text)) {
      found.push({ wrong: String(check.wrong).replaceAll('/', ''), right: check.right, rule: check.rule });
    }
  }

  const cleaned = [];
  const seen = new Set();
  found.forEach((item) => {
    const normalizedWrong = item.right.toLowerCase();
    if (!seen.has(`${item.right}-${item.rule}`)) {
      seen.add(`${item.right}-${item.rule}`);
      cleaned.push({
        wrong: item.right === 'Ich' ? 'ich am Satzanfang' : item.right.toLowerCase(),
        right: item.right,
        rule: item.rule
      });
    }
  });
  return cleaned.slice(0, 8);
}

function buildCorrections(rawSentences) {
  return rawSentences.map((sentence) => {
    let improved = sentence;
    const reasons = [];

    if (improved && /^[a-zäöü]/.test(improved)) {
      improved = improved.charAt(0).toUpperCase() + improved.slice(1);
      reasons.push('Satzanfang großgeschrieben');
    }
    if (improved && !/[.!?]$/.test(improved)) {
      improved += '.';
      reasons.push('Satzzeichen ergänzt');
    }

    const replacements = [
      [/\bpark\b/g, 'Park', 'Nomen großgeschrieben'],
      [/\bschule\b/g, 'Schule', 'Nomen großgeschrieben'],
      [/\bhund\b/g, 'Hund', 'Nomen großgeschrieben'],
      [/\bhaus\b/g, 'Haus', 'Nomen großgeschrieben'],
      [/\bmutter\b/g, 'Mutter', 'Nomen großgeschrieben'],
      [/\bfreund\b/g, 'Freund', 'Nomen großgeschrieben'],
      [/\bich habe ein Hund\b/gi, 'Ich habe einen Hund', 'Artikel verbessert'],
      [/\bich habe ein hund\b/gi, 'Ich habe einen Hund', 'Artikel verbessert']
    ];

    replacements.forEach(([pattern, replacement, reason]) => {
      if (pattern.test(improved)) {
        improved = improved.replace(pattern, replacement);
        reasons.push(reason);
      }
    });

    return {
      original: sentence,
      corrected: improved,
      explanation: reasons.length ? reasons.join(', ') : 'Schon gut gelungen.',
      changed: improved !== sentence
    };
  });
}

function offlineAnalyzeEssay(text, title = '', theme = '') {
  const rawSentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const corrections = buildCorrections(rawSentences);
  const wordMistakes = detectWordMistakes(text);
  const frequentMistakes = detectFrequentMistakes(text);
  const points = Math.max(8, Math.min(20, 18 - frequentMistakes.length * 2 - wordMistakes.length));
  const gradeMap = points >= 18 ? '1' : points >= 15 ? '2' : points >= 12 ? '3' : points >= 9 ? '4' : points >= 6 ? '5' : '6';
  const xp = Math.max(25, points * 5);
  const level = Math.max(1, Math.floor(xp / 60));
  const badges = [];
  if (points >= 15) badges.push('Starker Start');
  if (rawSentences.length >= 3) badges.push('Story-Builder');
  if (theme) badges.push(`${THEME_LABELS[theme] || theme}-Fan`);

  return {
    source: 'offline-fallback',
    points,
    gradeText: gradeMap,
    summary: `${title ? `Dein Text „${title}“` : 'Dein Text'} wurde geprüft. Du hast schon eine gute Basis. Jetzt trainieren wir gezielt deine wichtigsten Fehlerwörter und Satzanfänge.`,
    tips: [
      'Beginne jeden Satz mit einem großen Buchstaben.',
      'Setze am Satzende einen Punkt oder ein anderes Satzzeichen.',
      'Schreibe Nomen wie Hund, Park oder Schule groß.'
    ],
    corrections,
    wordMistakes,
    stats: {
      sentenceCount: rawSentences.length,
      wordCount: text.trim().split(/\s+/).filter(Boolean).length,
      frequentMistakes,
      structure: {
        beginning: rawSentences.length >= 1 ? 1 : 0,
        middle: rawSentences.length >= 2 ? 1 : 0,
        ending: rawSentences.length >= 3 ? 1 : 0
      }
    },
    gamification: {
      xp,
      level,
      badges: badges.length ? badges : ['Weiter so']
    }
  };
}

async function analyzeEssay(text, { title = '', theme = '', interests = [] } = {}) {
  if (!client) return offlineAnalyzeEssay(text, title, theme);

  const prompt = `Du bist ein motivierender Deutschlehrer für die 5. Klasse Gymnasium und sprichst klar, kurz und freundlich.
Antworte NUR als JSON in diesem exakten Schema:
{
  "points": number,
  "gradeText": string,
  "summary": string,
  "tips": [string, string, string],
  "corrections": [
    {"original": string, "corrected": string, "explanation": string, "changed": boolean}
  ],
  "wordMistakes": [
    {"wrong": string, "right": string, "rule": string}
  ],
  "stats": {
    "sentenceCount": number,
    "wordCount": number,
    "frequentMistakes": [string, string, string],
    "structure": {"beginning": number, "middle": number, "ending": number}
  },
  "gamification": {
    "xp": number,
    "level": number,
    "badges": [string, string, string]
  }
}
Regeln:
- kindgerecht und motivierend
- Fokus auf Satzbau, Groß-/Kleinschreibung, Satzende, Wortwahl, Reihenfolge
- points zwischen 0 und 20
- gradeText nur 1,2,3,4,5 oder 6
- genau 3 Tipps
- corrections satzweise und kompakt
- wordMistakes nur wirklich nützliche Wort- oder Artikelkorrekturen, maximal 8
- frequentMistakes maximal 3 kurze Punkte
- structure bewertet grob Anfang/Mitte/Ende mit 0 oder 1
- xp zwischen 20 und 120
- level zwischen 1 und 10
- badges maximal 3 kurze Begriffe
Interessen des Schülers: ${interests.join(', ') || 'keine Angabe'}
Thema-Welt: ${theme || 'frei'}
Titel: ${title || 'Ohne Titel'}
Text:
${text}`;

  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt
    });
    return { source: 'openai', ...JSON.parse(response.output_text) };
  } catch (error) {
    const code = error?.code || error?.status;
    if (code === 'insufficient_quota' || error?.status === 429 || error?.message?.includes('quota')) {
      return offlineAnalyzeEssay(text, title, theme);
    }
    throw error;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Aufsatztrainer V3.1 Gamer Edition läuft.' });
});

app.get('/api/themes', (req, res) => {
  const requested = String(req.query.interests || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const seed = Number(req.query.seed || Date.now());
  const suggestions = pickThemeSuggestions(requested, seed);
  res.json({ suggestions, labels: THEME_LABELS });
});

app.get('/api/students', async (_req, res) => {
  try {
    const students = await all('SELECT * FROM students ORDER BY name ASC');
    res.json(students.map((student) => ({ ...student, interests: safeParseJson(student.interests, []) })));
  } catch {
    res.status(500).json({ error: 'Schüler konnten nicht geladen werden.' });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { name, grade, interests } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name fehlt.' });

    const normalizedInterests = Array.isArray(interests)
      ? interests.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : [];

    const result = await run(
      'INSERT INTO students (name, grade, interests) VALUES (?, ?, ?)',
      [name.trim(), (grade || '5. Klasse').trim(), JSON.stringify(normalizedInterests)]
    );
    const student = await get('SELECT * FROM students WHERE id = ?', [result.id]);
    res.status(201).json({ ...student, interests: safeParseJson(student.interests, []) });
  } catch {
    res.status(500).json({ error: 'Schüler konnte nicht angelegt werden.' });
  }
});

app.get('/api/stats/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const stats = await get(
      `SELECT COUNT(*) as essayCount,
              COALESCE(ROUND(AVG(points), 1), 0) as avgPoints,
              COALESCE(SUM(points * 5), 0) as totalXp
       FROM essays WHERE student_id = ?`,
      [studentId]
    );

    const latest = await get(
      'SELECT id, title, points, grade_text, created_at, mistakes FROM essays WHERE student_id = ? ORDER BY id DESC LIMIT 1',
      [studentId]
    );

    const firstEssay = await get(
      'SELECT id, points, grade_text, created_at FROM essays WHERE student_id = ? ORDER BY id ASC LIMIT 1',
      [studentId]
    );

    const recent = await all(
      'SELECT points, grade_text FROM essays WHERE student_id = ? ORDER BY id DESC LIMIT 5',
      [studentId]
    );

    const allMistakeRows = await all('SELECT mistakes FROM essays WHERE student_id = ?', [studentId]);
    const mistakeCounter = {};
    allMistakeRows.forEach((row) => {
      safeParseJson(row.mistakes, []).forEach((item) => {
        mistakeCounter[item] = (mistakeCounter[item] || 0) + 1;
      });
    });

    const topMistakes = Object.entries(mistakeCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label]) => label);

    const trend = recent.length >= 2 ? recent[0].points - recent[recent.length - 1].points : 0;
    const improvement = firstEssay && latest ? latest.points - firstEssay.points : 0;
    const level = Math.max(1, Math.floor((stats.totalXp || 0) / 120) + 1);

    res.json({
      ...stats,
      latest: latest ? { ...latest, mistakes: safeParseJson(latest.mistakes, []) } : null,
      firstEssay: firstEssay || null,
      trend,
      improvement,
      level,
      completedQuests: stats.essayCount || 0,
      topMistakes
    });
  } catch {
    res.status(500).json({ error: 'Statistik konnte nicht geladen werden.' });
  }
});

app.get('/api/essays/:studentId', async (req, res) => {
  try {
    const essays = await all(
      'SELECT id, title, theme, points, grade_text, summary, created_at FROM essays WHERE student_id = ? ORDER BY id DESC',
      [req.params.studentId]
    );
    res.json(essays);
  } catch {
    res.status(500).json({ error: 'Aufsätze konnten nicht geladen werden.' });
  }
});

app.get('/api/essay/:essayId', async (req, res) => {
  try {
    const essay = await get('SELECT * FROM essays WHERE id = ?', [req.params.essayId]);
    if (!essay) return res.status(404).json({ error: 'Aufsatz nicht gefunden.' });
    res.json(normalizeEssay(essay));
  } catch {
    res.status(500).json({ error: 'Aufsatz konnte nicht geladen werden.' });
  }
});

app.post('/api/correct-essay', async (req, res) => {
  try {
    const { title, content, theme, interests } = req.body;
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: 'Der Aufsatz ist noch zu kurz.' });
    }
    const analysis = await analyzeEssay(content.trim(), { title, theme, interests });
    res.json(analysis);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Korrektur fehlgeschlagen.' });
  }
});

app.post('/api/essays', async (req, res) => {
  try {
    const { studentId, title, theme, content, analysis } = req.body;
    if (!studentId || !content) return res.status(400).json({ error: 'Daten fehlen.' });

    const result = await run(
      `INSERT INTO essays (student_id, title, theme, content, points, grade_text, summary, tips, corrections, mistakes, word_mistakes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        studentId,
        title || 'Ohne Titel',
        theme || '',
        content,
        analysis?.points ?? 0,
        analysis?.gradeText ?? '-',
        analysis?.summary ?? '',
        JSON.stringify(analysis?.tips || []),
        JSON.stringify(analysis?.corrections || []),
        JSON.stringify(analysis?.stats?.frequentMistakes || []),
        JSON.stringify(analysis?.wordMistakes || [])
      ]
    );

    const essay = await get('SELECT * FROM essays WHERE id = ?', [result.id]);
    res.status(201).json(normalizeEssay(essay));
  } catch {
    res.status(500).json({ error: 'Aufsatz konnte nicht gespeichert werden.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Aufsatztrainer V3.1 Gamer Edition läuft auf http://localhost:${port}`);
});
