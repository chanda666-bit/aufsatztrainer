import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import OpenAI from 'openai';
import {
  ensureSchema,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentById,
  getStudentByNameAndPin,
  getEssaysByStudent,
  getEssayById,
  saveEssay,
  getStatsForStudent,
  listAllStudentsForAdmin
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
ensureSchema();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '2468';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const sessions = new Map();

function createSession(payload) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { ...payload, createdAt: Date.now() });
  return token;
}

function getSession(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token ? sessions.get(token) : null;
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt.' });
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Nur Admin.' });
  req.session = session;
  next();
}

function escapeText(text) {
  return String(text || '').trim();
}

const THEME_BANK = {
  roblox: [
    'Mein verrücktestes Roblox-Abenteuer',
    'Das geheime Portal in Roblox City',
    'Ich finde einen versteckten Roblox-Server',
    'Die Rettung meines Teams in Roblox',
    'Ein Rätsel im Roblox-Labor'
  ],
  fortnite: [
    'Das spannendste Fortnite-Match meines Lebens',
    'Ein geheimer Ort auf der Karte',
    'Wie ich mein Team gerettet habe',
    'Das letzte Duell vor dem Sieg',
    'Ein unerwarteter Verbündeter im Match'
  ],
  schach: [
    'Mein wichtigstes Schachspiel',
    'Wie ich den König gerettet habe',
    'Das Turnier in der Schule',
    'Ein Zug, der alles änderte',
    'Mein mutiger Matt-Angriff'
  ],
  'fußball': [
    'Das entscheidende Tor im Finale',
    'Ein schweres Spiel im Regen',
    'Wie unser Team zurückkam',
    'Mein erster Treffer für die Schule',
    'Der wichtigste Elfmeter des Jahres'
  ],
  fantasy: [
    'Der Wald der leuchtenden Steine',
    'Der Drache und das verlorene Buch',
    'Meine Reise ins Wolkenschloss',
    'Das geheime Schwert im Berg',
    'Die Nacht der Zaubersterne'
  ],
  schule: [
    'Ein verrückter Schultag',
    'Mein spannendstes Erlebnis in der Pause',
    'Ein neuer Schüler kommt in die Klasse',
    'Der Ausflug, den ich nie vergesse',
    'Als der Strom in der Schule ausfiel'
  ]
};

function buildSuggestions(interests = [], seed = Date.now()) {
  const keys = interests.length ? interests : ['roblox'];
  const out = [];
  keys.forEach((key) => {
    const bank = THEME_BANK[key] || THEME_BANK.roblox;
    const shuffled = [...bank].sort((a, b) => hashString(a + seed) - hashString(b + seed));
    shuffled.slice(0, 2).forEach((title) => {
      out.push({ key, title, label: 'Quest' });
    });
  });
  return out.slice(0, 4);
}

function hashString(value) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h << 5) - h + value.charCodeAt(i);
  return Math.abs(h);
}

function calcGrade(points) {
  if (points >= 18) return '1';
  if (points >= 15) return '2';
  if (points >= 12) return '3';
  if (points >= 9) return '4';
  if (points >= 5) return '5';
  return '6';
}

function offlineAnalyze(text) {
  const lines = escapeText(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  const corrections = [];
  const wordMistakes = [];
  const tips = [];
  let points = 16;

  const nounHints = ['schule', 'hund', 'mutter', 'park', 'haus', 'roblox', 'fortnite', 'fußball', 'schach'];
  const replacements = [
    ['ein hund', 'einen Hund', 'Der richtige Artikel für „Hund“ ist „einen“.'],
    ['ein park', 'einen Park', 'Der richtige Artikel für „Park“ ist „einen“.'],
    ['ich habe ein hund', 'Ich habe einen Hund', 'Satzanfang groß und richtiger Artikel.'],
    ['ich war in die schule', 'Ich war in der Schule', 'Hier passt „in der Schule“ besser.']
  ];

  lines.forEach((line) => {
    let original = line;
    let corrected = line;
    let explanation = 'Schon gut geschrieben.';
    let changed = false;

    if (/^[a-zäöü]/.test(corrected)) {
      corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
      explanation = 'Satzanfänge werden großgeschrieben.';
      changed = true;
      points -= 1;
    }

    nounHints.forEach((noun) => {
      const r = new RegExp(`\\b${noun}\\b`, 'g');
      if (r.test(corrected) && noun !== noun.charAt(0).toUpperCase() + noun.slice(1)) {
        corrected = corrected.replace(r, noun.charAt(0).toUpperCase() + noun.slice(1));
        if (!wordMistakes.find(w => w.wrong === noun)) {
          wordMistakes.push({ wrong: noun, right: noun.charAt(0).toUpperCase() + noun.slice(1), rule: 'Nomen werden großgeschrieben.' });
        }
        explanation = 'Nomen werden großgeschrieben.';
        changed = true;
      }
    });

    replacements.forEach(([wrong, right, rule]) => {
      const r = new RegExp(wrong, 'i');
      if (r.test(corrected)) {
        corrected = corrected.replace(r, right);
        wordMistakes.push({ wrong, right, rule });
        explanation = rule;
        changed = true;
        points -= 1;
      }
    });

    if (!/[.!?]$/.test(corrected)) {
      corrected += '.';
      explanation = 'Sätze enden meist mit einem Punkt.';
      changed = true;
      points -= 1;
    }

    corrections.push({ original, corrected, explanation, changed });
  });

  if (wordMistakes.length) tips.push('Übe die Wörter aus der Fehlerliste noch einmal extra.');
  tips.push('Achte auf Großschreibung am Satzanfang.');
  tips.push('Schreibe Nomen wie Schule, Hund oder Mutter groß.');

  points = Math.max(4, Math.min(20, points));
  const gradeText = calcGrade(points);
  const xp = points >= 15 ? 35 : points >= 12 ? 25 : 15;

  return {
    points,
    gradeText,
    summary: points >= 15 ? 'Starke Leistung! Dein Text ist schon klar und spannend.' : 'Guter Anfang! Mit etwas Übung wird dein Text noch sicherer.',
    tips,
    corrections,
    wordMistakes: dedupeMistakes(wordMistakes),
    gamification: {
      xp,
      badges: points >= 15 ? ['Starker Satzbau', 'Mutige Story'] : ['Weiter üben']
    }
  };
}

function dedupeMistakes(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.wrong}|${item.right}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function analyzeEssay(text, title, interests = []) {
  if (!openai) return offlineAnalyze(text);

  try {
    const prompt = `Du bist ein kindgerechter Deutsch-Coach für Klasse 5. Prüfe diesen Aufsatz kurz und streng fair. Thema: ${title || 'frei'}. Interessen: ${interests.join(', ')}.
Gib nur JSON zurück mit:
points (0-20), gradeText, summary, tips (array), corrections (array mit original, corrected, explanation, changed), wordMistakes (array mit wrong, right, rule), gamification { xp, badges }.
Text:\n${text}`;

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt
    });

    const raw = response.output_text || '{}';
    const parsed = JSON.parse(raw);
    return {
      points: parsed.points || 12,
      gradeText: parsed.gradeText || calcGrade(parsed.points || 12),
      summary: parsed.summary || 'Gute Arbeit!'
      ,tips: parsed.tips || [],
      corrections: parsed.corrections || [],
      wordMistakes: parsed.wordMistakes || [],
      gamification: parsed.gamification || { xp: 20, badges: [] }
    };
  } catch (error) {
    console.error(error);
    return offlineAnalyze(text);
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '4.0.0' }));

app.post('/api/login/student', async (req, res) => {
  const { name, pin } = req.body || {};
  const student = await getStudentByNameAndPin(escapeText(name), escapeText(pin));
  if (!student) return res.status(401).json({ error: 'Name oder PIN falsch.' });
  const token = createSession({ role: 'student', studentId: student.id, name: student.name });
  res.json({ token, role: 'student', student });
});

app.post('/api/login/admin', (req, res) => {
  const { pin } = req.body || {};
  if (escapeText(pin) !== ADMIN_PIN) return res.status(401).json({ error: 'Admin-PIN falsch.' });
  const token = createSession({ role: 'admin' });
  res.json({ token, role: 'admin' });
});

app.get('/api/me', requireAuth, async (req, res) => {
  if (req.session.role === 'admin') return res.json({ role: 'admin' });
  const student = await getStudentById(req.session.studentId);
  res.json({ role: 'student', student });
});

app.get('/api/themes', requireAuth, async (req, res) => {
  const interests = String(req.query.interests || '').split(',').map(s => s.trim()).filter(Boolean);
  const seed = Number(req.query.seed || Date.now());
  res.json({ suggestions: buildSuggestions(interests, seed) });
});

app.post('/api/check', requireAuth, async (req, res) => {
  const { title, content, interests } = req.body || {};
  const analysis = await analyzeEssay(content, title, interests || []);
  res.json(analysis);
});

app.get('/api/stats', requireAuth, async (req, res) => {
  const studentId = req.session.role === 'admin' ? Number(req.query.studentId) : req.session.studentId;
  const stats = await getStatsForStudent(studentId);
  res.json(stats);
});

app.get('/api/essays', requireAuth, async (req, res) => {
  const studentId = req.session.role === 'admin' ? Number(req.query.studentId) : req.session.studentId;
  const items = await getEssaysByStudent(studentId);
  res.json(items);
});

app.get('/api/essay/:id', requireAuth, async (req, res) => {
  const essay = await getEssayById(Number(req.params.id));
  if (!essay) return res.status(404).json({ error: 'Nicht gefunden.' });
  if (req.session.role !== 'admin' && essay.student_id !== req.session.studentId) return res.status(403).json({ error: 'Kein Zugriff.' });
  res.json(essay);
});

app.post('/api/essays', requireAuth, async (req, res) => {
  if (req.session.role !== 'student') return res.status(403).json({ error: 'Nur Schüler können speichern.' });
  const { title, content, theme, analysis } = req.body || {};
  const essay = await saveEssay({ studentId: req.session.studentId, title, content, theme, analysis });
  res.json(essay);
});

app.get('/api/admin/students', requireAdmin, async (_req, res) => {
  const rows = await listAllStudentsForAdmin();
  res.json(rows);
});

app.get('/api/admin/students', requireAdmin, async (_req, res) => {
  const students = await listAllStudentsForAdmin();
  res.json(students);
});

app.post('/api/admin/students', requireAdmin, async (req, res) => {
  const { name, grade, pin, interests } = req.body || {};
  const cleanName = escapeText(name);
  const cleanGrade = escapeText(grade) || '5. Klasse';
  const cleanPin = escapeText(pin) || '1234';

  if (!cleanName) return res.status(400).json({ error: 'Bitte einen Namen eingeben.' });
  if (!/^\d{4}$/.test(cleanPin)) return res.status(400).json({ error: 'PIN muss 4-stellig sein.' });

  const student = await createStudent({
    name: cleanName,
    grade: cleanGrade,
    pin: cleanPin,
    interests: Array.isArray(interests) ? interests : []
  });

  res.json(student);
});

app.put('/api/admin/students/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, grade, pin, interests } = req.body || {};

  if (!id) return res.status(400).json({ error: 'Ungültige Schüler-ID.' });

  const cleanName = escapeText(name);
  const cleanGrade = escapeText(grade) || '5. Klasse';
  const cleanPin = escapeText(pin) || '1234';

  if (!cleanName) return res.status(400).json({ error: 'Bitte einen Namen eingeben.' });
  if (!/^\d{4}$/.test(cleanPin)) return res.status(400).json({ error: 'PIN muss 4-stellig sein.' });

  const student = await updateStudent(id, {
    name: cleanName,
    grade: cleanGrade,
    pin: cleanPin,
    interests: Array.isArray(interests) ? interests : []
  });

  res.json(student);
});

app.delete('/api/admin/students/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Ungültige Schüler-ID.' });

  await deleteStudent(id);
  res.json({ success: true });
});

app.post('/api/admin/students', requireAdmin, async (req, res) => {
  const { name, grade, interests, pin } = req.body || {};
  const student = await createStudent({ name, grade, interests, pin });
  res.json(student);
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Aufsatztrainer V4 läuft auf http://localhost:${PORT}`);
});
