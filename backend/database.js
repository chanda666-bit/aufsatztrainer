import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'aufsatztrainer.db');

export const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    grade TEXT DEFAULT '5. Klasse',
    interests TEXT DEFAULT '[]',
    pin TEXT DEFAULT '1234',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS essays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    title TEXT,
    content TEXT,
    theme TEXT,
    points INTEGER DEFAULT 0,
    grade_text TEXT DEFAULT '-',
    summary TEXT DEFAULT '',
    tips TEXT DEFAULT '[]',
    corrections TEXT DEFAULT '[]',
    word_mistakes TEXT DEFAULT '[]',
    xp INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  const studentCols = await all(`PRAGMA table_info(students)`);
  const essayCols = await all(`PRAGMA table_info(essays)`);
  const studentNames = studentCols.map(c => c.name);
  const essayNames = essayCols.map(c => c.name);

  if (!studentNames.includes('pin')) await run(`ALTER TABLE students ADD COLUMN pin TEXT DEFAULT '1234'`);
  if (!studentNames.includes('interests')) await run(`ALTER TABLE students ADD COLUMN interests TEXT DEFAULT '[]'`);
  if (!essayNames.includes('theme')) await run(`ALTER TABLE essays ADD COLUMN theme TEXT DEFAULT ''`);
  if (!essayNames.includes('tips')) await run(`ALTER TABLE essays ADD COLUMN tips TEXT DEFAULT '[]'`);
  if (!essayNames.includes('corrections')) await run(`ALTER TABLE essays ADD COLUMN corrections TEXT DEFAULT '[]'`);
  if (!essayNames.includes('word_mistakes')) await run(`ALTER TABLE essays ADD COLUMN word_mistakes TEXT DEFAULT '[]'`);
  if (!essayNames.includes('xp')) await run(`ALTER TABLE essays ADD COLUMN xp INTEGER DEFAULT 0`);
}

export async function createStudent({ name, grade, interests, pin }) {
  const result = await run(
    `INSERT INTO students (name, grade, interests, pin) VALUES (?, ?, ?, ?)` ,
    [name, grade || '5. Klasse', JSON.stringify(interests || []), pin || '1234']
  );
  return getStudentById(result.lastID);
}

export async function updateStudent(id, { name, grade, interests, pin }) {
  await run(
    `UPDATE students
     SET name = ?, grade = ?, interests = ?, pin = ?
     WHERE id = ?`,
    [
      name,
      grade || '5. Klasse',
      JSON.stringify(interests || []),
      pin || '1234',
      id
    ]
  );
  return getStudentById(id);
}

export async function deleteStudent(id) {
  await run(`DELETE FROM essays WHERE student_id = ?`, [id]);
  await run(`DELETE FROM students WHERE id = ?`, [id]);
  return { success: true };
}

export async function getStudentById(id) {
  const row = await get(`SELECT * FROM students WHERE id = ?`, [id]);
  if (!row) return null;
  return { ...row, interests: safeParse(row.interests, []) };
}

export async function getStudentByNameAndPin(name, pin) {
  const row = await get(`SELECT * FROM students WHERE lower(name) = lower(?) AND pin = ?`, [name, pin]);
  if (!row) return null;
  return { ...row, interests: safeParse(row.interests, []) };
}

export async function listAllStudentsForAdmin() {
  const rows = await all(`SELECT id, name, grade, pin, interests, created_at FROM students ORDER BY name ASC`);
  return rows.map(r => ({ ...r, interests: safeParse(r.interests, []) }));
}

export async function getStudents() {
  return listAllStudentsForAdmin();
}

export async function saveEssay({ studentId, title, content, theme, analysis }) {
  const result = await run(
    `INSERT INTO essays (student_id, title, content, theme, points, grade_text, summary, tips, corrections, word_mistakes, xp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      studentId,
      title || 'Ohne Titel',
      content || '',
      theme || '',
      analysis.points || 0,
      analysis.gradeText || '-',
      analysis.summary || '',
      JSON.stringify(analysis.tips || []),
      JSON.stringify(analysis.corrections || []),
      JSON.stringify(analysis.wordMistakes || []),
      analysis.gamification?.xp || 0
    ]
  );
  return getEssayById(result.lastID);
}

export async function getEssaysByStudent(studentId) {
  const rows = await all(`SELECT id, title, theme, points, grade_text, summary, created_at FROM essays WHERE student_id = ? ORDER BY datetime(created_at) DESC`, [studentId]);
  return rows;
}

export async function getEssayById(id) {
  const row = await get(`SELECT * FROM essays WHERE id = ?`, [id]);
  if (!row) return null;
  return {
    ...row,
    tips: safeParse(row.tips, []),
    corrections: safeParse(row.corrections, []),
    wordMistakes: safeParse(row.word_mistakes, [])
  };
}

export async function getStatsForStudent(studentId) {
  const essays = await all(`SELECT * FROM essays WHERE student_id = ? ORDER BY datetime(created_at) ASC`, [studentId]);
  const essayCount = essays.length;
  const totalPoints = essays.reduce((sum, item) => sum + (item.points || 0), 0);
  const totalXp = essays.reduce((sum, item) => sum + (item.xp || 0), 0);
  const avgPoints = essayCount ? Math.round(totalPoints / essayCount) : 0;
  const latest = essayCount ? essays[essayCount - 1] : null;
  const firstEssay = essayCount ? essays[0] : null;
  const trend = essayCount > 1 ? (latest.points || 0) - (firstEssay.points || 0) : 0;
  const improvement = trend;
  const level = Math.max(1, Math.floor(totalXp / 120) + 1);
  const completedQuests = essayCount;

  const mistakeMap = new Map();
  essays.forEach((essay) => {
    safeParse(essay.word_mistakes, []).forEach((item) => {
      const key = item.wrong || item.rule || 'Fehler';
      mistakeMap.set(key, (mistakeMap.get(key) || 0) + 1);
    });
  });
  const topMistakes = [...mistakeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

  return {
    essayCount,
    avgPoints,
    latest: latest ? { grade_text: latest.grade_text, points: latest.points } : null,
    firstEssay: firstEssay ? { grade_text: firstEssay.grade_text, points: firstEssay.points } : null,
    trend,
    improvement,
    totalXp,
    level,
    completedQuests,
    topMistakes,
    chart: essays.map((essay, index) => ({ x: index + 1, points: essay.points || 0, grade: essay.grade_text, created_at: essay.created_at }))
  };
}

function safeParse(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}
