"""Owner-only API and Mini App entry point."""
import asyncio
import csv
import hashlib
import hmac
import io
import json
import os
import re
import time
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qsl

from fastapi import Body, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

import bot
import db
import dictionary

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
OWNER_ID = int(os.environ.get("OWNER_TELEGRAM_ID") or 0)
DEV = os.environ.get("DEV_MODE") == "1"
STATIC = Path(__file__).parent / "static"


def auth(request: Request):
    if DEV:
        return
    if not BOT_TOKEN or OWNER_ID <= 0:
        raise HTTPException(503, "bot is not configured")
    pairs = parse_qsl(request.headers.get("X-Init-Data", ""))
    data = dict(pairs)
    if len(data) != len(pairs):
        raise HTTPException(401, "bad initData")
    got = data.pop("hash", "")
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    want = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not re.fullmatch(r"[0-9a-f]{64}", got) or not hmac.compare_digest(got, want):
        raise HTTPException(401, "bad initData")
    try:
        age = time.time() - int(data.get("auth_date") or 0)
        user = json.loads(data.get("user") or "{}")
        if not isinstance(user, dict):
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(401, "bad initData")
    if age < -60 or age > 86400:
        raise HTTPException(401, "stale initData")
    if user.get("id") != OWNER_ID:
        raise HTTPException(403, "not the owner")


@asynccontextmanager
async def lifespan(app):
    db.init()
    task = asyncio.create_task(bot.run()) if BOT_TOKEN else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@api.middleware("http")
async def private_responses(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


app.mount("/api", api)
api.router.dependencies.append(Depends(auth))

def today_iso():
    return date.today().isoformat()


def iso(s):
    """Validate a YYYY-MM-DD coming from the client; None passes through."""
    if not s:
        return None
    try:
        if not isinstance(s, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            raise ValueError
        return date.fromisoformat(str(s)).isoformat()
    except ValueError:
        raise HTTPException(400, f"плохая дата: {s}")


def positive_int(value, name):
    try:
        if isinstance(value, bool) or int(value) != float(value) or int(value) <= 0:
            raise ValueError
        return int(value)
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(400, f"{name} must be a positive integer")


def text_value(value, name, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str) or (required and not value.strip()):
        raise HTTPException(400, f"{name} is required and must be text")
    return value.strip()


def valid_list(value):
    if value in (None, "", 0):
        return None
    lid = positive_int(value, "list_id")
    if not db.one("SELECT id FROM word_lists WHERE id=?", lid):
        raise HTTPException(400, "no such list")
    return lid


@api.get("/summary")
def summary():
    due = db.one("SELECT count(*) n FROM words WHERE due_at <= ?", today_iso())["n"]
    total_w = db.one("SELECT count(*) n FROM words")["n"]

    habits = db.one("SELECT count(*) n FROM habits WHERE archived=0 AND count_from IS NULL")["n"]
    done = db.one(
        "SELECT count(*) n FROM habit_logs l JOIN habits h ON h.id=l.habit_id"
        " WHERE l.date=? AND l.done=1 AND h.archived=0 AND h.count_from IS NULL", today_iso())["n"]
    monday = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    focus = db.one(
        "SELECT coalesce(sum(duration_seconds),0) s FROM focus_sessions"
        " WHERE started_at >= ?", monday)["s"]
    counters = [{"name": c["name"], "days": (date.today() - db.parse_day(c["count_from"])).days}
                for c in db.q("SELECT name, count_from FROM habits"
                              " WHERE count_from IS NOT NULL AND archived=0")]
    nearest = min(counters, key=lambda c: abs(c["days"])) if counters else None
    return {"words_due": due, "words_total": total_w,
            "habits_done": done, "habits_total": habits, "focus_week": focus,
            "counters": len(counters), "nearest": nearest}


@api.get("/lists")
def lists():
    return db.q("SELECT l.*, (SELECT count(*) FROM words w WHERE w.list_id=l.id) n"
                " FROM word_lists l ORDER BY name")


@api.post("/lists")
def add_list(body: dict = Body(...)):
    name = text_value(body.get("name"), "name", required=True)
    if not name:
        raise HTTPException(400, "empty name")
    ex = db.one("SELECT * FROM word_lists WHERE name=?", name)
    return ex or db.one("SELECT * FROM word_lists WHERE id=?",
                        db.x("INSERT INTO word_lists(name) VALUES(?)", name))


@api.get("/words")
def words(list_id: int = 0, language: str = "", search: str = "",
          limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0)):
    sql = "SELECT w.*, l.name list_name FROM words w LEFT JOIN word_lists l ON l.id=w.list_id WHERE 1=1"
    args = []
    if list_id:
        sql, args = sql + " AND w.list_id=?", args + [list_id]
    if language:
        sql, args = sql + " AND w.language=?", args + [language]
    if search:
        sql, args = sql + " AND (w.text LIKE ? OR w.translation LIKE ?)", args + [f"%{search}%"] * 2
    return db.q(sql + " ORDER BY w.created_at DESC, w.id DESC LIMIT ? OFFSET ?", *args, limit, offset)


def _find_dup(text, language):
    return db.one("SELECT * FROM words WHERE text=? AND language=?", text.strip(), language)


@api.post("/words")
def add_word(body: dict = Body(...)):
    text = text_value(body.get("text"), "text", required=True)
    tr = text_value(body.get("translation"), "translation", required=True)
    for key in ("transcription", "example"):
        body[key] = text_value(body.get(key), key)
    lang = body.get("language") or "en"
    if not text or not tr:
        raise HTTPException(400, "text and translation required")
    if lang not in ("en", "zh"):
        raise HTTPException(400, "language must be en or zh")
    body["list_id"] = valid_list(body.get("list_id"))
    dup = _find_dup(text, lang)
    if dup and not body.get("force_merge"):
        raise HTTPException(409, {"message": "Такое слово уже есть", "existing": dup})
    if dup:
        trs = dup["translation"] if tr in dup["translation"] else f"{dup['translation']}; {tr}"
        db.x("UPDATE words SET translation=?, transcription=coalesce(nullif(?,''),transcription),"
             " example=coalesce(nullif(?,''),example), list_id=coalesce(?,list_id) WHERE id=?",
             trs, body.get("transcription") or "", body.get("example") or "",
             body.get("list_id") or None, dup["id"])
        return db.one("SELECT * FROM words WHERE id=?", dup["id"])
    wid = db.x("INSERT INTO words(text,translation,language,list_id,transcription,example,due_at)"
               " VALUES(?,?,?,?,?,?,?)", text, tr, lang, body.get("list_id") or None,
               body.get("transcription") or "", body.get("example") or "", today_iso())
    return db.one("SELECT * FROM words WHERE id=?", wid)


@api.patch("/words/{wid}")
def edit_word(wid: int, body: dict = Body(...)):
    current = word(wid)
    for key in ("text", "translation"):
        if key in body:
            if not isinstance(body[key], str) or not body[key].strip():
                raise HTTPException(400, f"{key} is required")
            body[key] = body[key].strip()
    for key in ("transcription", "example"):
        if key in body:
            body[key] = text_value(body[key], key)
    language = body.get("language", current["language"])
    if language not in ("en", "zh"):
        raise HTTPException(400, "language must be en or zh")
    duplicate = _find_dup(body.get("text", current["text"]), language)
    if duplicate and duplicate["id"] != wid:
        raise HTTPException(409, {"message": "Такое слово уже есть", "existing": duplicate})
    if "list_id" in body:
        body["list_id"] = valid_list(body["list_id"])
    cols = [k for k in ("text", "translation", "language", "list_id", "transcription", "example")
            if k in body]
    if cols:
        db.x(f"UPDATE words SET {','.join(k + '=?' for k in cols)} WHERE id=?",
             *[body[k] for k in cols], wid)
    return db.one("SELECT * FROM words WHERE id=?", wid)


@api.delete("/words/{wid}", status_code=204)
def del_word(wid: int):
    db.x("DELETE FROM words WHERE id=?", wid)


@api.get("/words/due")
def due(limit: int = 40, list_id: int = 0):
    sql = "SELECT * FROM words WHERE due_at <= ?"
    args = [today_iso()]
    if list_id:
        sql, args = sql + " AND list_id=?", args + [list_id]
    cards = db.q(sql + " ORDER BY reps, due_at LIMIT ?", *args, limit)
    for c in cards:


        c["preview"] = {q: db.sm2(c["reps"], c["interval"], c["ef"], q)[1] for q in (1, 3, 5)}

    pool = [r["translation"] for r in
            db.q("SELECT translation FROM words ORDER BY random() LIMIT 60")]
    return {"cards": cards, "pool": pool}


@api.post("/words/{wid}/review")
def review(wid: int, body: dict = Body(...)):
    quality = positive_int(body.get("quality", 1), "quality")
    if quality not in (1, 3, 5):
        raise HTTPException(400, "quality must be 1, 3 or 5")
    w = db.one("SELECT * FROM words WHERE id=?", wid)
    if not w:
        raise HTTPException(404, "no such word")
    reps, interval, ef = db.sm2(w["reps"], w["interval"], w["ef"], quality)
    db.x("UPDATE words SET reps=?,interval=?,ef=?,due_at=?,lapses=lapses+? WHERE id=?",
         reps, interval, ef, (date.today() + timedelta(days=interval)).isoformat(),
         1 if quality < 3 else 0, wid)
    db.x("INSERT INTO review_log(word_id,result) VALUES(?,?)", wid, quality)
    return db.one("SELECT * FROM words WHERE id=?", wid)


@api.get("/words/stats")
def word_stats():
    s = db.one("SELECT count(*) total,"
               " sum(reps=0) new, sum(reps>0 AND interval<21) learning,"
               " sum(interval>=21) learned, sum(due_at<=?) due FROM words", today_iso())
    days = db.q("SELECT date(reviewed_at,'localtime') d, count(*) n,"
                " sum(result>=3) ok FROM review_log"
                " WHERE reviewed_at >= date('now','-29 days') GROUP BY d ORDER BY d")
    return {**{k: v or 0 for k, v in s.items()}, "days": days}


@api.get("/words/lookup")
async def lookup(text: str, language: str = "en"):
    if not text.strip() or len(text) > 200:
        raise HTTPException(400, "слово должно содержать от 1 до 200 символов")
    if language not in ("en", "zh"):
        raise HTTPException(400, "language must be en or zh")
    return await dictionary.lookup(text, language)


@api.get("/words/{wid}")
def word(wid: int):
    w = db.one("SELECT w.*, l.name list_name FROM words w"
               " LEFT JOIN word_lists l ON l.id=w.list_id WHERE w.id=?", wid)
    if not w:
        raise HTTPException(404, "нет такого слова")
    return w


@api.post("/words/import")
def import_csv(body: dict = Body(...)):
    """CSV columns: text,translation,language[,transcription,example,list]"""
    source = body.get("csv", "")
    if not isinstance(source, str) or len(source) > 2_000_000:
        raise HTTPException(400, "CSV must be text under 2 MB")
    try:
        reader = csv.DictReader(io.StringIO(source.lstrip("\ufeff")), strict=True)
        rows = list(reader)
    except csv.Error:
        raise HTTPException(400, "invalid CSV")
    if not {"text", "translation"}.issubset({k.strip().lower() for k in reader.fieldnames or []}):
        raise HTTPException(400, "CSV needs text and translation columns")
    if any(None in row for row in rows):
        raise HTTPException(400, "invalid CSV columns or language")
    rows = [{k.strip().lower(): (v or "").strip() for k, v in row.items()} for row in rows]
    if any(row.get("language", "en") not in ("", "en", "zh") for row in rows):
        raise HTTPException(400, "language must be en or zh")
    added = skipped = 0
    for r in rows:
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        if not r.get("text") or not r.get("translation"):
            continue
        lid = None
        if r.get("list"):
            lid = add_list({"name": r["list"]})["id"]
        try:
            add_word({**r, "language": r.get("language") or "en", "list_id": lid})
            added += 1
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
            skipped += 1
    return {"added": added, "skipped_duplicates": skipped, "rows": len(rows)}


@api.get("/habits")
def habits(days: int = 120):
    since = date.today() - timedelta(days=days)
    out = []
    for h in db.q("SELECT * FROM habits ORDER BY archived, id"):
        if h["count_from"]:
            out.append({**h, "days_since": (date.today() - db.parse_day(h["count_from"])).days})
            continue
        allog = [db.parse_day(r["date"]) for r in db.q(
            "SELECT date FROM habit_logs WHERE habit_id=? AND done=1", h["id"])]
        logs = [d for d in allog if d >= since]
        out.append({**h, "streak": db.streak(allog, date.today()),
                    "best": db.best_streak(allog),
                    "today": date.today() in logs,
                    "log": [d.isoformat() for d in logs]})
    return out


@api.post("/habits")
def add_habit(body: dict = Body(...)):
    name = text_value(body.get("name"), "name", required=True)
    if not name:
        raise HTTPException(400, "empty name")
    hid = db.x("INSERT INTO habits(name,icon,color,count_from) VALUES(?,?,?,?)",
               name, body.get("icon") or "✅", body.get("color") or "#6366f1",
               iso(body.get("count_from")))
    return db.one("SELECT * FROM habits WHERE id=?", hid)


@api.patch("/habits/{hid}")
def edit_habit(hid: int, body: dict = Body(...)):
    if not db.one("SELECT id FROM habits WHERE id=?", hid):
        raise HTTPException(404, "no such habit")
    if "name" in body:
        if not isinstance(body["name"], str) or not body["name"].strip():
            raise HTTPException(400, "name is required")
        body["name"] = body["name"].strip()
    if "count_from" in body:
        body["count_from"] = iso(body["count_from"])
    cols = [k for k in ("name", "icon", "color", "archived", "count_from") if k in body]
    if cols:
        db.x(f"UPDATE habits SET {','.join(k + '=?' for k in cols)} WHERE id=?",
             *[body[k] for k in cols], hid)
    return db.one("SELECT * FROM habits WHERE id=?", hid)


@api.delete("/habits/{hid}", status_code=204)
def del_habit(hid: int):
    db.x("DELETE FROM habits WHERE id=?", hid)


@api.post("/habits/{hid}/toggle")
def toggle(hid: int, body: dict = Body(default={})):
    habit = db.one("SELECT * FROM habits WHERE id=?", hid)
    if not habit:
        raise HTTPException(404, "no such habit")
    if habit["count_from"]:
        raise HTTPException(400, "day counters have no check-ins")
    day = iso(body.get("date")) or today_iso()
    if day > today_iso():
        raise HTTPException(400, "нельзя отметить будущий день")
    db.x("INSERT INTO habit_logs(habit_id,date,done) VALUES(?,?,1)"
         " ON CONFLICT(habit_id,date) DO UPDATE SET done=1-done", hid, day)
    return db.one("SELECT * FROM habit_logs WHERE habit_id=? AND date=?", hid, day)


@api.get("/focus/topics")
def topics():
    return db.q("SELECT * FROM focus_topics ORDER BY name")


@api.post("/focus/topics")
def add_topic(body: dict = Body(...)):
    name = text_value(body.get("name"), "name", required=True)
    if not name:
        raise HTTPException(400, "empty name")
    ex = db.one("SELECT * FROM focus_topics WHERE name=?", name)
    return ex or db.one("SELECT * FROM focus_topics WHERE id=?",
                        db.x("INSERT INTO focus_topics(name,color) VALUES(?,?)",
                             name, body.get("color") or "#f59e0b"))


@api.delete("/focus/topics/{tid}", status_code=204)
def del_topic(tid: int):
    db.x("DELETE FROM focus_topics WHERE id=?", tid)


@api.post("/focus/sessions")
def add_session(body: dict = Body(...)):
    secs = positive_int(body.get("duration_seconds"), "duration_seconds")
    try:
        started = datetime.fromisoformat(body["started_at"]) if body.get("started_at") else datetime.now()
        started = started.astimezone().replace(tzinfo=None)
        if started > datetime.now() + timedelta(minutes=1):
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(400, "invalid started_at")
    topic_id = body.get("topic_id") or None
    if topic_id is not None and not db.one("SELECT id FROM focus_topics WHERE id=?", topic_id):
        raise HTTPException(400, "no such topic")
    client_id = text_value(body.get("client_id"), "client_id") or None
    sid = db.x("INSERT INTO focus_sessions(topic_id,started_at,duration_seconds,note,client_id)"
               " VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING", topic_id,
               started.isoformat(timespec="seconds"),
               secs, body.get("note") or "", client_id)
    if client_id:
        existing = db.one("SELECT * FROM focus_sessions WHERE client_id=?", client_id)
        if existing["topic_id"] != topic_id or existing["duration_seconds"] != secs:
            raise HTTPException(409, "session already saved with different values")
        return existing
    return db.one("SELECT * FROM focus_sessions WHERE id=?", sid)


@api.get("/focus/stats")
def focus_stats(period: str = "week"):
    n = {"today": 1, "week": 7, "month": 30}.get(period, 7)
    since = (date.today() - timedelta(days=n - 1)).isoformat()
    by_topic = db.q(
        "SELECT coalesce(t.name,'Без темы') name, coalesce(t.color,'#94a3b8') color,"
        " sum(s.duration_seconds) s FROM focus_sessions s"
        " LEFT JOIN focus_topics t ON t.id=s.topic_id"
        " WHERE s.started_at >= ? GROUP BY t.id ORDER BY s DESC", since)
    by_day = {r["d"]: r["s"] for r in db.q(
        "SELECT date(started_at) d, sum(duration_seconds) s FROM focus_sessions"
        " WHERE started_at >= ? GROUP BY d", since)}
    days = [{"date": (date.today() - timedelta(days=i)).isoformat(),
             "seconds": by_day.get((date.today() - timedelta(days=i)).isoformat(), 0)}
            for i in reversed(range(n))]
    return {"total": sum(t["s"] for t in by_topic), "by_topic": by_topic, "days": days,
            "recent": db.q("SELECT s.*, t.name topic, t.color FROM focus_sessions s"
                           " LEFT JOIN focus_topics t ON t.id=s.topic_id"
                           " ORDER BY s.started_at DESC LIMIT 20")}


@api.get("/export/{what}.csv")
def export(what: str):
    tables = {"words": "SELECT text,translation,language,transcription,example,due_at,interval FROM words",
              "habits": "SELECT h.name,l.date,l.done FROM habit_logs l JOIN habits h ON h.id=l.habit_id",
              "focus": "SELECT t.name topic,s.started_at,s.duration_seconds,s.note"
                       " FROM focus_sessions s LEFT JOIN focus_topics t ON t.id=s.topic_id"}
    if what not in tables:
        raise HTTPException(404, "unknown export")
    rows = db.q(tables[what])
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=rows[0].keys() if rows else ["empty"])
    w.writeheader()
    w.writerows(rows)
    return PlainTextResponse(buf.getvalue(), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{what}.csv"'})


if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = (STATIC / path).resolve()
        ok = f.is_file() and f.is_relative_to(STATIC.resolve())
        return FileResponse(f if ok else STATIC / "index.html")
