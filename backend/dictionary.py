"""Dictionary lookups, pinyin and example sentences."""
import asyncio
import gzip
import json
import os
import re
import threading
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen

WIKI = "https://en.wiktionary.org/w/api.php"
UA = {"User-Agent": "tgapp/1.0 (personal vocabulary trainer; single user; contact via Telegram)"}

_gate, _last = threading.Lock(), [0.0]


def _pace(seconds=0.6):
    # Wiktionary limits bursts, including requests for different words.
    with _gate:
        wait = seconds - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()


@lru_cache(maxsize=512)
def _get(url, pace=False):
    """Cached so re-looking-up a word costs the free services nothing."""
    if pace:
        _pace()
    with urlopen(UrlRequest(url, headers=UA), timeout=10) as r:
        return json.load(r)


def parse_entry(wikitext):
    """(ipa, [russian translations]) out of an en.wiktionary page. Pure: tested offline."""
    ipa = re.findall(r"\{\{IPA\|en\|([^|}]+)", wikitext)
    ru, seen = [], set()
    for w in re.findall(r"\{\{t\+?\|ru\|([^|}]+)", wikitext):
        k = w.replace("\u0301", "").lower()
        if k not in seen:
            seen.add(k)
            ru.append(w)
    return (ipa[0] if ipa else ""), ru


def keep_phrasal(word, titles):
    """Keep short phrases, excluding the base word and possessive templates."""
    out = []
    for t in titles:
        parts = t.split()
        if t.lower() != word and 2 <= len(parts) <= 3 and "'" not in t:
            out.append(t)
    return out


def _wiki_entry(word):
    d = _get(f"{WIKI}?action=parse&page={quote(word)}&prop=wikitext&format=json", pace=True)
    return parse_entry(d["parse"]["wikitext"]["*"])


def _wiki_phrasal(word):
    if " " in word:
        return []
    d = _get(f"{WIKI}?action=query&list=prefixsearch&pssearch={quote(word + ' ')}"
             "&pslimit=20&format=json", pace=True)
    return keep_phrasal(word, [p["title"] for p in d["query"]["prefixsearch"]])


CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"
CEDICT = Path(os.environ.get("DB_PATH", "/data/app.db")).parent / "cedict.txt.gz"

VOWELS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "v": "ǖǘǚǜ"}


def tone_marks(syllables):
    """'ni3 hao3' -> 'nǐ hǎo'. Mark goes on a/e, on the o of 'ou', else the last vowel."""
    out = []
    for s in syllables.split():
        n = s[-1]
        if not n.isdigit():
            out.append(s)
            continue
        body, n = s[:-1].replace("u:", "v"), int(n)
        if n in (0, 5):
            out.append(body.replace("v", "ü"))
            continue
        low = body.lower()
        i = (low.find("a") if "a" in low else
             low.find("e") if "e" in low else
             low.find("o") if "ou" in low else
             max(low.rfind(c) for c in "aeiouv"))
        if i < 0:
            out.append(body.replace("v", "ü"))
            continue
        out.append((body[:i] + VOWELS[low[i]][n - 1] + body[i + 1:]).replace("v", "ü"))
    return " ".join(out)


def pinyin_of(text, d, maxlen=6):
    """Read whole words first; ambiguous segmentation can still need manual correction."""
    out, i = [], 0
    while i < len(text):
        for n in range(min(maxlen, len(text) - i), 0, -1):
            hit = d.get(text[i:i + n])
            if hit and hit[0]:
                out.append(hit[0])
                i += n
                break
        else:
            out.append(text[i])
            i += 1
    return " ".join(out)


PARTICLES = {"吗": "ma", "嗎": "ma", "呢": "ne", "吧": "ba", "的": "de", "了": "le"}


@lru_cache(maxsize=1)
def cedict():
    """word -> (pinyin, [glosses]). Downloaded once into the volume, then in memory."""
    if not CEDICT.exists():
        with urlopen(UrlRequest(CEDICT_URL, headers=UA), timeout=120) as r:
            CEDICT.write_bytes(r.read())
    out = {}
    with gzip.open(CEDICT, "rt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            head, _, gloss = line.partition("/")
            parts = head.split(" ", 2)
            if len(parts) < 3 or "[" not in parts[2]:
                continue
            trad, simp = parts[0], parts[1]
            pin = tone_marks(parts[2].strip().strip("[]"))

            defs = [g for g in gloss.strip().strip("/").split("/") if g and not g.startswith("CL:")]
            for key in (simp, trad):
                prev = out.get(key)


                if prev is None or (prev[0][:1].isupper() and not pin[:1].isupper()):
                    out[key] = (pin, defs)
    for ch, reading in PARTICLES.items():
        if ch in out:
            out[ch] = (reading, out[ch][1])
    return out


def _tatoeba(word, language):
    src = "cmn" if language == "zh" else "eng"
    d = _get(f"https://tatoeba.org/en/api_v0/search?from={src}&to=rus"
             f"&query={quote(word)}&limit=12")
    out = []
    for s in d.get("results", []):


        direct = (s.get("translations") or [[]])[0]
        ru = [t["text"] for t in direct if t.get("lang") == "rus"]
        if ru:
            out.append({"text": s["text"], "ru": ru[0]})
        if len(out) == 4:
            break
    return out


async def lookup(text: str, language: str = "en"):
    word = text.strip().lower()

    entry, phrasal, examples = await asyncio.gather(
        asyncio.to_thread(_wiki_entry, word) if language == "en" else asyncio.sleep(0, ("", [])),
        asyncio.to_thread(_wiki_phrasal, word) if language == "en" else asyncio.sleep(0, []),
        asyncio.to_thread(_tatoeba, word, language),
        return_exceptions=True,
    )
    for r in (entry, phrasal, examples):
        if isinstance(r, Exception):
            print(f"dictionary: {type(r).__name__}", flush=True)
    failed = isinstance(entry, Exception)
    ipa, ru = entry if isinstance(entry, tuple) else ("", [])
    exs = examples if isinstance(examples, list) else []
    meanings = []
    if language == "zh":
        try:
            d = await asyncio.to_thread(cedict)
            ipa, meanings = d.get(word, ("", []))
            for e in exs:
                e["pin"] = pinyin_of(e["text"], d)
        except Exception as e:
            failed = True
            print(f"cedict: {type(e).__name__}", flush=True)
    return {
        "transcription": ipa,
        "translations": ru[:6],
        "meanings": meanings[:6],
        "phrasal": phrasal if isinstance(phrasal, list) else [],
        "examples": exs,
        "failed": failed,
    }
