"""aiogram bot: launch button, morning digest, evening nudge, nightly backup."""
import asyncio
import json
import os
import sqlite3
from contextlib import suppress
from datetime import date, datetime, timedelta
from urllib.request import urlopen

from aiogram import Bot, Dispatcher
from aiogram.filters import Command, CommandStart
from aiogram.types import (InlineKeyboardButton, InlineKeyboardMarkup, Message,
                           MenuButtonWebApp, WebAppInfo)

import db

TOKEN = os.environ.get("BOT_TOKEN", "")
OWNER = int(os.environ.get("OWNER_TELEGRAM_ID") or 0)
PINNED = os.environ.get("WEBAPP_URL", "")
URL = PINNED
DIGEST_HOUR = int(os.environ.get("DIGEST_HOUR") or 8)
REMIND_HOUR = int(os.environ.get("REMIND_HOUR") or 20)

dp = Dispatcher()


def kb():
    if not URL:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🎮 Открыть", web_app=WebAppInfo(url=URL))]])


async def probe_url():
    """One shot: ask cloudflared for its current quick-tunnel hostname."""
    fetch = lambda: json.loads(urlopen("http://tunnel:2000/quicktunnel", timeout=2).read())
    try:
        if host := (await asyncio.to_thread(fetch)).get("hostname"):
            return "https://" + host
    except Exception:
        pass
    return ""


async def refresh_url(b):
    """Refresh the launch button when cloudflared rotates its hostname."""
    global URL
    if PINNED:
        return PINNED
    if (u := await probe_url()) and u != URL:
        await b.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Открыть", web_app=WebAppInfo(url=u)))
        URL = u
        print("bot: адрес Mini App обновлён", flush=True)
    return URL


async def wait_for_url(b):
    for _ in range(90):
        if await refresh_url(b):
            return URL
        await asyncio.sleep(2)
    print("bot: не удалось узнать адрес туннеля, кнопка запуска будет пустой", flush=True)
    return ""


@dp.message(CommandStart())
async def start(m: Message):
    if m.from_user.id != OWNER:
        return
    await refresh_url(m.bot)
    await m.answer("Привет! Твоё меню: словарь, привычки, фокус.", reply_markup=kb())


@dp.message(Command("stats"))
async def stats(m: Message):
    if m.from_user.id != OWNER:
        return
    await m.answer(digest_text(), reply_markup=kb())


def digest_text():
    today = date.today().isoformat()
    due = db.one("SELECT count(*) n FROM words WHERE due_at<=?", today)["n"]
    hab = db.q("SELECT h.name, (SELECT done FROM habit_logs l WHERE l.habit_id=h.id"
               " AND l.date=?) done FROM habits h WHERE h.archived=0 AND h.count_from IS NULL", today)
    left = [h["name"] for h in hab if not h["done"]]
    y = (date.today() - timedelta(days=1)).isoformat()
    f = db.one("SELECT coalesce(sum(duration_seconds),0) s FROM focus_sessions"
               " WHERE date(started_at)=?", y)["s"]
    return (f"☀️ Доброе утро!\n\n"
            f"📚 Слов на повторение: {due}\n"
            f"🔥 Привычек не отмечено: {len(left)}"
            + (" — " + ", ".join(left) if left else " (всё готово)")
            + f"\n⏱ Фокус вчера: {f // 3600}ч {f % 3600 // 60}м")


def plural(n, one, few, many):
    """1 привычка, 2 привычки, 5 привычек — и 11 привычек, не 11 привычка."""
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def nudge_text():
    today = date.today().isoformat()
    due = db.one("SELECT count(*) n FROM words WHERE due_at<=?", today)["n"]
    left = db.one("SELECT count(*) n FROM habits h WHERE h.archived=0 AND h.count_from IS NULL AND NOT EXISTS"
                  "(SELECT 1 FROM habit_logs l WHERE l.habit_id=h.id AND l.date=? AND l.done=1)",
                  today)["n"]
    if not due and not left:
        return None
    parts = []
    if due:
        parts.append(f"{due} {plural(due, 'карточка', 'карточки', 'карточек')}")
    if left:
        parts.append(f"{left} {plural(left, 'привычка', 'привычки', 'привычек')}")
    return "🌙 На сегодня осталось: " + " и ".join(parts) + "."


def backup():
    d = os.path.join(os.path.dirname(db.PATH), "backups")
    os.makedirs(d, exist_ok=True)
    with db.conn() as src:
        dst = sqlite3.connect(os.path.join(d, f"app-{date.today()}.db"))
        try:
            src.backup(dst)
        finally:
            dst.close()


async def daily_loop(bot: Bot):
    """Run daily reminders and backups in the configured local timezone."""
    sent = {}
    while True:
        now = datetime.now()
        key = now.date().isoformat()
        try:
            await refresh_url(bot)
            if now.hour == DIGEST_HOUR and sent.get("digest") != key:
                await bot.send_message(OWNER, digest_text(), reply_markup=kb())
                sent["digest"] = key
            if now.hour == REMIND_HOUR and sent.get("nudge") != key:
                if t := nudge_text():
                    await bot.send_message(OWNER, t, reply_markup=kb())
                sent["nudge"] = key
            if now.hour == 3 and sent.get("backup") != key:
                await asyncio.to_thread(backup)
                sent["backup"] = key
        except Exception as e:
            print("daily_loop:", e, flush=True)
        await asyncio.sleep(60)


async def run():
    b = Bot(TOKEN)
    daily = None
    try:
        await wait_for_url(b)
        if PINNED:
            await b.set_chat_menu_button(
                menu_button=MenuButtonWebApp(text="Открыть", web_app=WebAppInfo(url=PINNED)))
        daily = asyncio.create_task(daily_loop(b))
        await dp.start_polling(b, handle_signals=False, close_bot_session=False)
    finally:
        if daily:
            daily.cancel()
            with suppress(asyncio.CancelledError):
                await daily
        await b.session.close()
