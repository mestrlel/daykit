"""SQLite storage. Single user => no user_id columns anywhere."""
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta

PATH = os.environ.get("DB_PATH", "/data/app.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS word_lists (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL COLLATE NOCASE,
  translation TEXT NOT NULL,
  language TEXT NOT NULL,
  list_id INTEGER REFERENCES word_lists(id) ON DELETE SET NULL,
  transcription TEXT DEFAULT '',
  example TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reps INTEGER NOT NULL DEFAULT 0,
  interval INTEGER NOT NULL DEFAULT 0,
  ef REAL NOT NULL DEFAULT 2.5,
  lapses INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL DEFAULT (date('now')));
CREATE UNIQUE INDEX IF NOT EXISTS words_uniq ON words(text, language);
CREATE INDEX IF NOT EXISTS words_due ON words(due_at);

CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  result INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✅',
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived INTEGER NOT NULL DEFAULT 0,
  count_from TEXT);

CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (habit_id, date));

CREATE TABLE IF NOT EXISTS focus_topics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#f59e0b');

CREATE TABLE IF NOT EXISTS focus_sessions (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER REFERENCES focus_topics(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  note TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS focus_started ON focus_sessions(started_at);
"""


@contextmanager
def conn():
    c = sqlite3.connect(PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    try:
        with c:
            yield c
    finally:
        c.close()


def init():
    os.makedirs(os.path.dirname(PATH) or ".", exist_ok=True)
    with conn() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)

        cols = {r[1] for r in c.execute("PRAGMA table_info(habits)")}
        if "count_from" not in cols:
            c.execute("ALTER TABLE habits ADD COLUMN count_from TEXT")
        c.execute("DROP TABLE IF EXISTS workout_log")
        cols = {r[1] for r in c.execute("PRAGMA table_info(focus_sessions)")}
        if "client_id" not in cols:
            c.execute("ALTER TABLE focus_sessions ADD COLUMN client_id TEXT")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_client ON focus_sessions(client_id)")


def q(sql, *args):
    """SELECT -> list[dict]"""
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args)]


def one(sql, *args):
    r = q(sql, *args)
    return r[0] if r else None


def x(sql, *args):
    """INSERT/UPDATE/DELETE -> lastrowid"""
    with conn() as c:
        return c.execute(sql, args).lastrowid


def sm2(reps, interval, ef, quality):
    """SuperMemo-2. quality: 1 = didn't know, 3 = hard, 5 = knew it.
    Returns (reps, interval_days, ef)."""
    ef = max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    if quality < 3:
        return 0, 1, ef
    reps += 1
    if reps == 1:
        interval = 1
    elif reps == 2:
        interval = 6
    else:
        interval = max(1, round(interval * ef))
    return reps, interval, ef


def streak(days, today):
    """Current run of consecutive done-days ending today or yesterday.
    Grace for today: a streak doesn't break until the day is over."""
    days = set(days)
    cur = today if today in days else today - timedelta(days=1)
    n = 0
    while cur in days:
        n += 1
        cur -= timedelta(days=1)
    return n


def best_streak(days):
    n = best = 0
    prev = None
    for d in sorted(set(days)):
        n = n + 1 if prev and d - prev == timedelta(days=1) else 1
        best = max(best, n)
        prev = d
    return best


def parse_day(s):
    return date.fromisoformat(s[:10])
