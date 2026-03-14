import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'aufsatztrainer.db');
export const db = new sqlite3.Database(dbPath);

function addColumnIfMissing(table, column, type, defaultValue = null) {
  db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
    if (err) return;
    const exists = rows.some((row) => row.name === column);
    if (!exists) {
      const defaultSql = defaultValue !== null ? ` DEFAULT ${defaultValue}` : '';
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${defaultSql}`);
    }
  });
}

export function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        grade TEXT DEFAULT '5. Klasse',
        interests TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS essays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        title TEXT,
        theme TEXT DEFAULT '',
        content TEXT NOT NULL,
        points INTEGER DEFAULT 0,
        grade_text TEXT DEFAULT '-',
        summary TEXT DEFAULT '',
        tips TEXT DEFAULT '[]',
        corrections TEXT DEFAULT '[]',
        mistakes TEXT DEFAULT '[]',
        word_mistakes TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES students(id)
      )
    `);

    addColumnIfMissing('students', 'interests', 'TEXT', "'[]'");
    addColumnIfMissing('essays', 'theme', 'TEXT', "''");
    addColumnIfMissing('essays', 'mistakes', 'TEXT', "'[]'");
    addColumnIfMissing('essays', 'word_mistakes', 'TEXT', "'[]'");
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
