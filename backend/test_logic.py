"""One runnable check for the non-trivial logic: SM-2, streaks, dedup, endpoints."""
import os
import tempfile
import unittest
from datetime import date, timedelta

_test_data = tempfile.TemporaryDirectory(prefix="tgapp-tests-")
os.environ["DB_PATH"] = os.path.join(_test_data.name, "t.db")
os.environ["DEV_MODE"] = "1"
os.environ["BOT_TOKEN"] = ""
import db
import main
import dictionary
from fastapi.testclient import TestClient


def test_sm2():
    r, i, e = db.sm2(0, 0, 2.5, 5); assert (r, i) == (1, 1), (r, i)
    r, i, e = db.sm2(r, i, e, 5);   assert (r, i) == (2, 6), (r, i)
    r, i, e = db.sm2(r, i, e, 5);   assert r == 3 and i == round(6 * e), (r, i, e)

    r, i, e = db.sm2(9, 100, 2.5, 1); assert (r, i) == (0, 1) and e < 2.5, (r, i, e)
    assert db.sm2(0, 0, 1.3, 1)[2] == 1.3

    r, i, e = db.sm2(2, 6, 2.5, 3); assert r == 3 and e < 2.5


def test_streaks():
    t = date(2026, 8, 21)
    d = [t - timedelta(days=i) for i in range(5)]
    assert db.streak(d, t) == 5
    assert db.streak(d[1:], t) == 4
    assert db.streak(d[2:], t) == 0
    assert db.streak([], t) == 0
    assert db.best_streak(d + [t - timedelta(days=20)]) == 5
    assert db.best_streak([t, t]) == 1


def test_api():
    db.init()
    c = TestClient(main.app)
    w = c.post("/api/words", json={"text": "apple", "translation": "яблоко", "language": "en"})
    assert w.status_code == 200, w.text

    assert c.post("/api/words", json={"text": "APPLE", "translation": "яблоко2",
                                      "language": "en"}).status_code == 409

    assert c.post("/api/words", json={"text": "apple", "translation": "苹果",
                                      "language": "zh"}).status_code == 200

    m = c.post("/api/words", json={"text": "apple", "translation": "плод", "language": "en",
                                   "force_merge": True}).json()
    assert m["id"] == w.json()["id"] and "плод" in m["translation"]
    assert len(c.get("/api/words").json()) == 2

    wid = w.json()["id"]
    assert any(x["id"] == wid for x in c.get("/api/words/due").json()["cards"])
    r = c.post(f"/api/words/{wid}/review", json={"quality": 5}).json()
    assert r["interval"] == 1 and r["due_at"] > date.today().isoformat()
    assert not any(x["id"] == wid for x in c.get("/api/words/due").json()["cards"])
    assert c.post(f"/api/words/{wid}/review", json={"quality": 2}).status_code == 400

    h = c.post("/api/habits", json={"name": "Читать"}).json()
    c.post(f"/api/habits/{h['id']}/toggle", json={})
    assert c.get("/api/habits").json()[0]["streak"] == 1
    c.post(f"/api/habits/{h['id']}/toggle", json={})
    assert c.get("/api/habits").json()[0]["streak"] == 0


    hid = h["id"]
    y = (date.today() - timedelta(days=1)).isoformat()
    c.post(f"/api/habits/{hid}/toggle", json={})
    c.post(f"/api/habits/{hid}/toggle", json={"date": y})
    row = c.get("/api/habits").json()[0]
    assert row["streak"] == 2 and y in row["log"], row
    assert c.post(f"/api/habits/{hid}/toggle",
                  json={"date": (date.today() + timedelta(days=1)).isoformat()}).status_code == 400
    assert c.post(f"/api/habits/{hid}/toggle", json={"date": "не дата"}).status_code == 400


    cd = c.post("/api/habits", json={"name": "Годовщина", "count_from": y}).json()
    row = next(x for x in c.get("/api/habits").json() if x["id"] == cd["id"])
    assert row["days_since"] == 1 and "streak" not in row, row
    fut = c.post("/api/habits", json={"name": "Отпуск",
                 "count_from": (date.today() + timedelta(days=10)).isoformat()}).json()
    assert next(x for x in c.get("/api/habits").json() if x["id"] == fut["id"])["days_since"] == -10
    assert c.post("/api/habits", json={"name": "X", "count_from": "вчера"}).status_code == 400

    assert c.get("/api/summary").json()["habits_total"] == 1


    assert c.delete(f"/api/habits/{hid}").status_code == 204
    assert not [x for x in c.get("/api/habits").json() if x["id"] == hid]
    assert db.one("SELECT count(*) n FROM habit_logs WHERE habit_id=?", hid)["n"] == 0

    t = c.post("/api/focus/topics", json={"name": "Английский"}).json()
    c.post("/api/focus/sessions", json={"topic_id": t["id"], "duration_seconds": 1800})
    s = c.get("/api/focus/stats?period=week").json()
    assert s["total"] == 1800 and len(s["days"]) == 7 and s["days"][-1]["seconds"] == 1800
    assert c.post("/api/focus/sessions", json={"duration_seconds": 0}).status_code == 400

    n = c.post("/api/words/import", json={
        "csv": "text,translation,language,list\nbook,книга,en,Работа\napple,x,en,\n"}).json()
    assert n == {"added": 1, "skipped_duplicates": 1, "rows": 2}, n
    st = c.get("/api/words/stats").json()
    assert st["total"] == 3 and st["learning"] == 1 and st["new"] == 2 and st["days"][0]["n"] == 1
    s = c.get("/api/summary").json()
    assert s["words_total"] == 3 and s["counters"] == 2
    assert s["nearest"]["name"] == "Годовщина", s["nearest"]
    assert "book" in c.get("/api/export/words.csv").text


def test_lookup_parsing():
    """Pure parsers only — no network in the test suite."""
    wt = "{{IPA|en|/\u0279\u026a\u02c8z\u026al.j\u0259nt/}} ... {{t+|ru|\u0433\u0438\u0301\u0431\u043a\u0438\u0439}} {{t|ru|\u0433\u0438\u0431\u043a\u0438\u0439}} {{t+|ru|\u0443\u043f\u0440\u0443\u0433\u0438\u0439}}"
    ipa, ru = dictionary.parse_entry(wt)
    assert ipa == "/\u0279\u026a\u02c8z\u026al.j\u0259nt/", ipa
    assert ru == ["\u0433\u0438\u0301\u0431\u043a\u0438\u0439", "\u0443\u043f\u0440\u0443\u0433\u0438\u0439"], ru
    assert dictionary.parse_entry("no templates here") == ("", [])

    titles = ["put", "Put", "put up with", "put off",
              "put one's name in the hat", "put out to pasture"]
    assert dictionary.keep_phrasal("put", titles) == ["put up with", "put off"]
    assert dictionary.keep_phrasal("put", []) == []


def test_pinyin():
    """CC-CEDICT ships tone numbers; the cards want tone marks."""
    assert dictionary.tone_marks("ni3 hao3") == "n\u01d0 h\u01ceo"
    assert dictionary.tone_marks("xie4 xie5") == "xi\u00e8 xie"
    assert dictionary.tone_marks("ma1") == "m\u0101"
    assert dictionary.tone_marks("ou3") == "\u01d2u"
    assert dictionary.tone_marks("lu:4") == "l\u01dc"
    assert dictionary.tone_marks("m2") == "m"


def test_sentence_pinyin():
    """Greedy longest-match: whole words beat single characters, junk passes through."""
    d = {"\u4f60\u597d": ("n\u01d0 h\u01ceo", []), "\u5417": ("ma", []), "\u597d": ("h\u01ceo", [])}
    assert dictionary.pinyin_of("\u4f60\u597d\u5417", d) == "n\u01d0 h\u01ceo ma"
    assert dictionary.pinyin_of("\u4f60\u597d\uff01", d) == "n\u01d0 h\u01ceo \uff01"
    assert dictionary.pinyin_of("\u672a\u77e5", d) == "\u672a \u77e5"
    assert dictionary.pinyin_of("", d) == ""


def test_plural():
    """The nudge said "1 привычек" — Russian needs three forms, not two."""
    import bot
    f = lambda n: f"{n} " + bot.plural(n, "привычка", "привычки", "привычек")
    assert [f(n) for n in (1, 2, 5, 11, 21, 22, 25, 111, 114)] == [
        "1 привычка", "2 привычки", "5 привычек", "11 привычек", "21 привычка",
        "22 привычки", "25 привычек", "111 привычек", "114 привычек"]


def test_auth():
    """initData must be signed with the bot token and belong to the owner."""
    import hashlib, hmac, json, time
    from urllib.parse import urlencode
    main.DEV, main.BOT_TOKEN, main.OWNER_ID = False, "123:TESTTOKEN", 42
    c = TestClient(main.app)

    def sign(uid, token="123:TESTTOKEN", auth_date=None, user=None):
        d = {"auth_date": str(int(time.time()) if auth_date is None else auth_date if isinstance(auth_date, str) else int(auth_date)),
             "user": user if user is not None else json.dumps({"id": uid}, separators=(",", ":"))}
        check = "\n".join(f"{k}={v}" for k, v in sorted(d.items()))
        secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
        d["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        return urlencode(d)

    assert c.get("/api/summary").status_code == 401
    assert c.get("/api/summary", headers={"X-Init-Data": "hash=deadbeef"}).status_code == 401
    assert c.get("/api/summary",
                 headers={"X-Init-Data": sign(42, "999:OTHER")}).status_code == 401
    assert c.get("/api/summary",
                 headers={"X-Init-Data": sign(42, auth_date=time.time() - 90000)}).status_code == 401
    assert c.get("/api/summary", headers={"X-Init-Data": sign(7)}).status_code == 403
    assert c.get("/api/summary", headers={"X-Init-Data": sign(42)}).status_code == 200
    assert c.get("/api/summary", headers={"X-Init-Data": sign(42, auth_date=time.time() + 3600)}).status_code == 401
    assert c.get("/api/summary", headers={"X-Init-Data": sign(42, auth_date="invalid")}).status_code == 401
    assert c.get("/api/summary", headers={"X-Init-Data": sign(42) + "&user=duplicate"}).status_code == 401
    assert c.get("/api/summary", headers={"X-Init-Data": "hash=%F0%9F%94%91"}).status_code == 401
    for user in ("not-json", "[]", "null"):
        assert c.get("/api/summary", headers={"X-Init-Data": sign(42, user=user)}).status_code == 401
    main.BOT_TOKEN = ""
    assert c.get("/api/summary").status_code == 503
    main.BOT_TOKEN = "123:TESTTOKEN"
    main.DEV = True


def test_regressions():
    import bot
    c = TestClient(main.app)
    counter = c.post("/api/habits", json={"name": "Дата", "count_from": date.today().isoformat()}).json()
    assert c.post(f"/api/habits/{counter['id']}/toggle", json={}).status_code == 400
    assert c.post("/api/habits/999999/toggle", json={}).status_code == 404
    assert c.post("/api/habits", json={"name": "X", "count_from": "2026-10-25garbage"}).status_code == 400
    assert c.patch("/api/words/999999", json={"text": "missing"}).status_code == 404
    assert c.post("/api/words", json={"text": "a", "translation": "b", "list_id": 999999}).status_code == 400
    words = c.get("/api/words").json()
    first, other = next(w for w in words if w['text'] == 'apple' and w['language'] == 'en'), next(w for w in words if w['text'] == 'book')
    assert c.patch(f"/api/words/{other['id']}", json={"text": first['text']}).status_code == 409
    assert c.patch(f"/api/words/{other['id']}", json={"translation": "  "}).status_code == 400
    for value in ("bad", None, -1, True, 1.5, [10]):
        assert c.post("/api/focus/sessions", json={"duration_seconds": value}).status_code == 400
    assert c.post("/api/focus/sessions", json={"duration_seconds": 60, "started_at": "bad"}).status_code == 400
    assert c.post("/api/focus/sessions", json={"duration_seconds": 60, "topic_id": 999999}).status_code == 400
    stamp = "2026-08-21T23:30:00+00:00"
    session = c.post("/api/focus/sessions", json={"duration_seconds": 60, "started_at": stamp}).json()
    from datetime import datetime
    assert session['started_at'] == datetime.fromisoformat(stamp).astimezone().replace(tzinfo=None).isoformat(timespec='seconds')
    assert c.post("/api/words/import", json={"csv": "text,translation\na,b,extra\n"}).status_code == 400
    assert c.post("/api/words/import", json={"csv": "text,translation,language\na,b,invalid\n"}).status_code == 400
    assert c.post("/api/words/import", json={"csv": "\ufefftext,translation,language\nnew,новое,en\n"}).json()['added'] == 1
    assert 'Дата' not in bot.digest_text()
    assert 'Годовщина' not in bot.digest_text()
    for habit in c.get('/api/habits').json():
        if not habit['count_from']:
            c.patch(f"/api/habits/{habit['id']}", json={'archived': 1})
    db.x("UPDATE words SET due_at=?", (date.today() + timedelta(days=1)).isoformat())
    assert bot.nudge_text() is None
    bot.backup()
    assert os.path.isfile(os.path.join(os.path.dirname(db.PATH), 'backups', f'app-{date.today()}.db'))


def test_sessions_and_pagination():
    c = TestClient(main.app)
    focus = {"client_id": "focus-retry-example", "duration_seconds": 75}
    first = c.post('/api/focus/sessions', json=focus)
    again = c.post('/api/focus/sessions', json=focus)
    assert first.status_code == again.status_code == 200
    assert first.json()['id'] == again.json()['id']
    assert db.one("SELECT count(*) n FROM focus_sessions WHERE client_id=?", focus['client_id'])['n'] == 1
    assert c.post('/api/focus/sessions', json={**focus, 'duration_seconds': 90}).status_code == 409
    first_page = c.get('/api/words?limit=2&offset=0').json()
    second_page = c.get('/api/words?limit=2&offset=2').json()
    assert len(first_page) == len(second_page) == 2
    assert not {word['id'] for word in first_page}.intersection(word['id'] for word in second_page)
    assert c.get('/api/words?limit=10000').status_code == 422


def test_migrate_existing_database():
    original = db.PATH
    try:
        db.PATH = os.path.join(_test_data.name, 'legacy.db')
        with db.conn() as connection:
            connection.executescript(db.SCHEMA)
            connection.execute("CREATE TABLE workout_log (id INTEGER PRIMARY KEY, seconds INTEGER)")
            connection.execute("INSERT INTO workout_log(seconds) VALUES(123)")
            connection.execute("INSERT INTO focus_sessions(started_at,duration_seconds) VALUES('2026-10-20T12:00:00',456)")
        db.init()
        db.init()
        assert db.one("SELECT name FROM sqlite_master WHERE name='workout_log'") is None
        assert db.one('SELECT duration_seconds,client_id FROM focus_sessions')['duration_seconds'] == 456
    finally:
        db.PATH = original


def test_publication_boundary():
    c = TestClient(main.app)
    for path in ('/api/summary', '/api/words', '/api/export/words.csv'):
        assert c.get(path).headers['cache-control'] == 'private, no-store'
    assert c.get('/api/workouts').status_code == 404
    assert c.post('/api/workouts', json={}).status_code == 404
    assert 'sport_week' not in c.get('/api/summary').json()
    assert db.one("SELECT name FROM sqlite_master WHERE name='workout_log'") is None
    main.DEV, main.BOT_TOKEN, main.OWNER_ID = False, '123:TESTTOKEN', 42
    try:
        for path in ('/words', '/habits', '/summary', '/lists', '/focus/stats', '/focus/topics',
                     '/export/words.csv', '/export/habits.csv', '/export/focus.csv'):
            response = c.get('/api' + path)
            assert response.status_code == 401, path
            assert response.headers['cache-control'] == 'private, no-store'
        for path in ('/words', '/habits', '/focus/sessions'):
            assert c.post('/api' + path, json={}).status_code == 401, path
    finally:
        main.DEV = True


if __name__ == "__main__":
    checks = [test_sm2, test_streaks, test_api, test_lookup_parsing, test_pinyin,
              test_sentence_pinyin, test_plural, test_auth, test_regressions, test_sessions_and_pagination, test_migrate_existing_database, test_publication_boundary]
    suite = unittest.TestSuite(unittest.FunctionTestCase(check) for check in checks)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
