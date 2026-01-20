import asyncio
import json
import os
import time
import logging
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import websockets
from collections import deque, OrderedDict
import hashlib
import re
import threading
import openai
import numpy as np
import sounddevice as sd
from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    ConnectEvent,
    CommentEvent,
    GiftEvent,
    DisconnectEvent,
    FollowEvent,
    LikeEvent,
    SubscribeEvent,
    ShareEvent,
    JoinEvent,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("ChatPalBrain")

SETTINGS_FILE = "settings.json"
MEMORY_FILE = "memory.json"

DEFAULT_SETTINGS = {
    "tiktok": {"unique_id": "@PupCid", "session_id": ""},
    "animaze": {"host": "localhost", "port": 9000},
    "openai": {"api_key": "", "model": "gpt-4o-mini"},
    "style": {"max_line_length": 140},
    "comment": {
        "enabled": 1,
        "global_cooldown": 6,
        "per_user_cooldown": 15,
        "min_length": 3,
        "max_replies_per_min": 20,
        "reply_threshold": 0.6,
        "respond_to_greetings": 1,
        "greeting_cooldown": 360,
        "respond_to_thanks": 1,
        "ignore_if_startswith": ["!"],
        "ignore_contains": ["http://", "https://", "discord.gg"],
        "keywords_bonus": [
            "warum","wieso","wie","wann","wo","wer","was","welche","welcher","welches",
            "why","how","when","where","who","what","which","how much","how many"
        ],
        "greetings": ["hallo","hi","hey","servus","moin","gruss","grüß","guten morgen","guten abend","hello"],
        "thanks": ["danke","thx","thanks","ty","merci"]
    },
    "batch_window": 25,
    "like_threshold": 20,
    "memory": {"enabled": 1, "file": MEMORY_FILE, "per_user_history": 100, "decay_days": 90},
    "dedupe_ttl": 600,
    "system_prompt": "Neutraler Assistent: präzise, kurze Antworten (max 25 Wörter) basierend auf Chat-Kontext und Memory.",
    "microphone": {
        "enabled": 1,
        "device": "",
        "silence_threshold": 0.02,
        "attack_ms": 120,
        "release_ms": 1200,
        "flush_delay_ms": 400
    },
    "join_rules": {
        "enabled": 1,
        "greet_after_seconds": 30,
        "active_ttl_seconds": 45,
        "min_idle_since_last_output_sec": 25,
        "greet_global_cooldown_sec": 180
    },
    "outbox": {"window_seconds": 8, "max_items": 8, "max_chars": 320, "separator": " • "},
    "speech": {"wait_start_timeout_ms": 1200, "max_speech_ms": 15000, "post_gap_ms": 250}
}

def load_settings():
    if not os.path.isfile(SETTINGS_FILE):
        save_settings(DEFAULT_SETTINGS)
        return json.loads(json.dumps(DEFAULT_SETTINGS))
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        save_settings(DEFAULT_SETTINGS)
        return json.loads(json.dumps(DEFAULT_SETTINGS))
    def merge(a, b):
        for k, v in b.items():
            if isinstance(v, dict):
                a[k] = merge(a.get(k, {}), v)
            else:
                a.setdefault(k, v)
        return a
    merged = merge(cfg, DEFAULT_SETTINGS)
    save_settings(merged)
    return merged

def save_settings(cfg):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

def load_memory(path: str, decay_days: int):
    if not os.path.isfile(path):
        return {"users": {}, "created": time.time()}
    try:
        with open(path, "r", encoding="utf-8") as f:
            mem = json.load(f)
        decay_sec = decay_days * 86400
        now = time.time()
        mem["users"] = {uid: u for uid, u in mem.get("users", {}).items() if now - u.get("last_seen", 0) < decay_sec}
        return mem
    except Exception:
        return {"users": {}, "created": time.time()}

def save_memory(mem: dict, path: str):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(mem, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

cfg = load_settings()
mem_cfg = cfg.get("memory", {})
MEMORY = load_memory(mem_cfg.get("file", MEMORY_FILE), mem_cfg.get("decay_days", 90))

animaze_uri = f"ws://{cfg['animaze']['host']}:{cfg['animaze']['port']}"
animaze_ws = None

class SpeechState:
    def __init__(self):
        self._started = asyncio.Event()
        self._ended = asyncio.Event()
        self._ended.set()
    def mark_started(self):
        self._ended.clear()
        self._started.set()
        log.info("ChatPal meldet: SpeechStarted")
    def mark_ended(self):
        self._started.clear()
        self._ended.set()
        log.info("ChatPal meldet: SpeechEnded")
    async def wait_idle(self):
        await self._ended.wait()
    async def wait_started(self, timeout=None):
        if timeout is None:
            await self._started.wait()
            return True
        try:
            await asyncio.wait_for(self._started.wait(), timeout)
            return True
        except asyncio.TimeoutError:
            return False
    async def wait_ended(self, timeout=None):
        if timeout is None:
            await self._ended.wait()
            return True
        try:
            await asyncio.wait_for(self._ended.wait(), timeout)
            return True
        except asyncio.TimeoutError:
            return False
    def is_speaking(self):
        return self._started.is_set() and not self._ended.is_set()

speech = SpeechState()

class MicState:
    def __init__(self):
        self._active = False
        self._active_event = asyncio.Event()
        self._idle_event = asyncio.Event()
        self._idle_event.set()
        self.last_active_ts = 0.0
        self.last_idle_ts = time.time()
    def mark_active(self):
        if not self._active:
            self._active = True
            self._active_event.set()
            self._idle_event.clear()
            self.last_active_ts = time.time()
            log.info("Mic Status: aktiv")
    def mark_idle(self):
        if self._active:
            self._active = False
            self._idle_event.set()
            self._active_event.clear()
            self.last_idle_ts = time.time()
            log.info("Mic Status: idle")
    async def wait_idle(self):
        await self._idle_event.wait()
    def is_active(self):
        return self._active

mic = MicState()

message_queue: asyncio.Queue[str] = asyncio.Queue()
comment_queue: asyncio.Queue[dict] = asyncio.Queue()

class EventDeduper:
    def __init__(self, ttl: int):
        self.ttl = ttl
        self._store = OrderedDict()
        self._lock = asyncio.Lock()
    async def seen(self, signature: str) -> bool:
        now = time.time()
        async with self._lock:
            expired = [k for k, v in self._store.items() if v < now]
            for k in expired:
                self._store.pop(k, None)
            if signature in self._store:
                return True
            self._store[signature] = now + self.ttl
            if len(self._store) > 5000:
                self._store.popitem(last=False)
            return False

deduper = EventDeduper(int(cfg.get("dedupe_ttl", 600)))

gift_queue: asyncio.Queue = asyncio.Queue()
like_queue: asyncio.Queue = asyncio.Queue()
join_queue: asyncio.Queue = asyncio.Queue()
follow_queue: asyncio.Queue = asyncio.Queue()
share_queue: asyncio.Queue = asyncio.Queue()
subscribe_queue: asyncio.Queue = asyncio.Queue()

LAST_OUTPUT_TS = 0.0
LAST_JOIN_ANNOUNCE_TS = 0.0
PENDING_JOINS = set()

async def connect_animaze():
    global animaze_ws
    if animaze_ws is not None:
        return
    try:
        animaze_ws = await websockets.connect(animaze_uri, ping_interval=20, ping_timeout=20)
        log.info("Verbunden mit ChatPal WebSocket")
        asyncio.create_task(handle_animaze_messages())
    except Exception as e:
        log.error(f"ChatPal Verbindung fehlgeschlagen: {e}")
        animaze_ws = None

async def handle_animaze_messages():
    global animaze_ws
    try:
        async for raw in animaze_ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            act = msg.get("action") or msg.get("event") or ""
            if act == "ChatbotSpeechStarted":
                speech.mark_started()
            elif act == "ChatbotSpeechEnded":
                speech.mark_ended()
            else:
                log.info(f"ChatPal ← {msg}")
    except Exception as e:
        log.warning(f"ChatPal Verbindung beendet: {e}")
    finally:
        animaze_ws = None
        speech.mark_ended()
        await asyncio.sleep(1.5)
        asyncio.create_task(connect_animaze())

def _trim(s: str) -> str:
    maxlen = int(cfg.get("style", {}).get("max_line_length", 140))
    s = s.strip()
    return s if len(s) <= maxlen else (s[: maxlen - 1] + "…")

async def send_to_animaze(text: str):
    if not text:
        return
    t = _trim(text)
    log.info(f"→ ChatPal enqueue: {t}")
    await message_queue.put(t)

async def sender_worker():
    global LAST_OUTPUT_TS
    while True:
        text = await message_queue.get()
        for _ in range(6):
            await connect_animaze()
            if animaze_ws is not None:
                break
            await asyncio.sleep(0.5)
        if animaze_ws is None:
            log.warning("ChatPal nicht erreichbar, retry wird eingeplant")
            await asyncio.sleep(0.8)
            await message_queue.put(text)
            continue
        await speech.wait_idle()
        try:
            payload = {"action": "ChatbotSendMessage", "id": str(time.time_ns()), "message": text, "priority": 1}
            log.info(f"→ ChatPal SEND: {payload['message']}")
            await animaze_ws.send(json.dumps(payload))
            st = int(cfg.get("speech", {}).get("wait_start_timeout_ms", 1200)) / 1000.0
            mt = int(cfg.get("speech", {}).get("max_speech_ms", 15000)) / 1000.0
            pg = int(cfg.get("speech", {}).get("post_gap_ms", 250)) / 1000.0
            started = await speech.wait_started(timeout=st)
            if started:
                await speech.wait_ended(timeout=mt)
            await asyncio.sleep(pg)
            LAST_OUTPUT_TS = time.time()
        except Exception as e:
            log.error(f"ChatPal SEND Fehler: {e}")
            await asyncio.sleep(0.5)
            await message_queue.put(text)
        await asyncio.sleep(0.02)

def _mem_user(uid: str) -> dict:
    u = MEMORY["users"].get(uid)
    if not u:
        u = {
            "first_seen": time.time(),
            "last_seen": time.time(),
            "nickname": "",
            "likes": 0,
            "gifts": 0,
            "follows": 0,
            "subs": 0,
            "shares": 0,
            "joins": 0,
            "messages": deque(maxlen=mem_cfg.get("per_user_history", 10)),
            "last_greet": 0.0,
            "background": {}
        }
        MEMORY["users"][uid] = u
    return u

def remember_event(uid: str, nickname: str = "", *, like_inc=0, gift_inc=0, follow=False, sub=False, share=False, join=False, message: str = None, background: dict = None):
    if not mem_cfg.get("enabled", 1):
        return
    u = _mem_user(uid)
    u["last_seen"] = time.time()
    if nickname:
        u["nickname"] = nickname
    if like_inc:
        u["likes"] = int(u.get("likes", 0)) + int(like_inc)
    if gift_inc:
        u["gifts"] = int(u.get("gifts", 0)) + int(gift_inc)
    if follow:
        u["follows"] = int(u.get("follows", 0)) + 1
    if sub:
        u["subs"] = int(u.get("subs", 0)) + 1
    if share:
        u["shares"] = int(u.get("shares", 0)) + 1
    if join:
        u["joins"] = int(u.get("joins", 0)) + 1
    if message:
        try:
            u["messages"].append(message)
        except Exception:
            u["messages"] = deque([message], maxlen=mem_cfg.get("per_user_history", 10))
    if background:
        u["background"].update(background)
    try:
        save_memory(MEMORY, mem_cfg.get("file", MEMORY_FILE))
    except Exception:
        pass

def get_background_info(uid: str) -> str:
    u = MEMORY["users"].get(uid, {})
    bg = u.get("background", {})
    if not bg:
        return ""
    parts = []
    for k, v in bg.items():
        if v is None:
            continue
        ks = str(k).strip()
        vs = str(v).strip()
        if not ks or not vs:
            continue
        parts.append(f"{ks}={vs[:48]}{'…' if len(vs)>48 else ''}")
    return ", ".join(parts)

class Relevance:
    def __init__(self, conf: dict):
        self.kw_bonus = [k.lower() for k in conf.get("keywords_bonus", [])]
        self.ignore_sw = [s.lower() for s in conf.get("ignore_if_startswith", [])]
        self.ignore_contains = [c.lower() for c in conf.get("ignore_contains", [])]
        self.url_re = re.compile(r"https?://|\bdiscord\.gg\b", re.I)
        self.greetings_re = re.compile(r"\b(?:hallo|hi|hey|servus|moin|gruss|gru[eü]ß|guten morgen|guten abend|hello)\b", re.I | re.UNICODE)
        self.thanks_re = re.compile(r"\b(?:danke|thx|thanks|ty|merci)\b", re.I | re.UNICODE)
    def is_ignored(self, text: str) -> bool:
        low = text.lower().strip()
        if any(low.startswith(s) for s in self.ignore_sw):
            return True
        if any(c in low for c in self.ignore_contains):
            return True
        if self.url_re.search(low):
            return True
        return False
    def is_greeting(self, text: str) -> bool:
        return bool(self.greetings_re.search(text))
    def is_thanks(self, text: str) -> bool:
        return bool(self.thanks_re.search(text))
    def score(self, text: str) -> float:
        low = text.lower().strip()
        score = 0.0
        if "?" in low:
            score += 0.6
        if any(k in low for k in self.kw_bonus):
            score += 0.35
        if len(low) >= 7:
            score += 0.1
        if any(p in low for p in [":", ";", "!"]):
            score += 0.05
        return min(1.0, score)

class ResponseEngine:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.openai_client = openai.OpenAI(api_key=cfg["openai"]["api_key"])
        self.system_prompt = cfg.get("system_prompt", "")
    async def reply_to_comment(self, nick: str, text: str, uid: str) -> str | None:
        user_history = "\n".join(MEMORY["users"].get(uid, {}).get("messages", []))
        bg_info = get_background_info(uid)
        prompt = f"User: {nick}\nBackground: {bg_info}\nChat history:\n{user_history}\nCurrent comment: {text}"
        try:
            fut = asyncio.to_thread(
                self.openai_client.chat.completions.create,
                model=self.cfg["openai"]["model"],
                messages=[{"role": "system", "content": self.system_prompt}, {"role": "user", "content": prompt}],
            )
            response = await asyncio.wait_for(fut, timeout=10.0)
            reply = response.choices[0].message.content.strip()
            words = reply.split()
            if len(words) > 18:
                reply = " ".join(words[:18]) + "."
            return reply
        except Exception as e:
            log.error(f"OpenAI Fehler: {e}")
            return None

class TokenBucket:
    def __init__(self, capacity: int, rate_per_sec: float):
        self.capacity = max(1, capacity)
        self.tokens = float(capacity)
        self.rate = float(rate_per_sec)
        self.updated = time.time()
        self._lock = asyncio.Lock()
    async def take(self):
        async with self._lock:
            now = time.time()
            elapsed = now - self.updated
            self.updated = now
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            if self.tokens < 1.0:
                need = (1.0 - self.tokens) / self.rate
                await asyncio.sleep(max(0.01, need))
                return await self.take()
            self.tokens -= 1.0

class OutboxBatcher:
    def __init__(self, window_s: int, max_items: int, max_chars: int, sep: str):
        self.window_s = window_s
        self.max_items = max_items
        self.max_chars = max_chars
        self.sep = sep
        self.buffer = []
        self.first_ts = None
        self._lock = asyncio.Lock()
    async def add(self, text: str):
        if not text:
            return
        async with self._lock:
            self.buffer.append(text.strip())
            if self.first_ts is None:
                self.first_ts = time.time()
            joined = self.sep.join(self.buffer)
            if len(joined) > self.max_chars or len(self.buffer) >= self.max_items:
                await self._flush_locked()
            else:
                log.info(f"Batch add: {text}")
    async def worker(self):
        while True:
            await asyncio.sleep(0.25)
            if mic.is_active() or speech.is_speaking():
                continue
            async with self._lock:
                if not self.buffer:
                    continue
                if (time.time() - (self.first_ts or time.time())) >= self.window_s:
                    await self._flush_locked()
    async def _flush_locked(self):
        if not self.buffer:
            return
        payload = self.sep.join(self.buffer)
        self.buffer.clear()
        self.first_ts = None
        log.info(f"Batch flush → {payload}")
        await send_to_animaze(payload)

batcher: OutboxBatcher | None = None

class MicrophoneMonitor:
    def __init__(self, cfg: dict, level_cb=None):
        self.cfg = cfg
        self.stream = None
        self.running = False
        self.threshold = float(cfg["microphone"].get("silence_threshold", 0.02))
        self.attack_ms = int(cfg["microphone"].get("attack_ms", 120))
        self.release_ms = int(cfg["microphone"].get("release_ms", 1200))
        self.device = cfg["microphone"].get("device", "")
        self._last_above = 0.0
        self._last_below = time.time()
        self._level = 0.0
        self._level_cb = level_cb
        self._attack_reached = False
    def _callback(self, indata, frames, time_info, status):
        try:
            data = np.asarray(indata, dtype=np.float32)
            if data.ndim > 1:
                data = np.mean(data, axis=1)
            rms = float(np.sqrt(np.mean(np.square(data)))) if data.size else 0.0
            self._level = rms
            if self._level_cb:
                try:
                    self._level_cb(rms)
                except Exception:
                    pass
            now = time.time()
            if rms >= self.threshold:
                if not self._attack_reached:
                    self._attack_reached = True
                    self._last_above = now
                if (now - self._last_above) * 1000 >= self.attack_ms:
                    mic.mark_active()
                self._last_below = now
            else:
                if (now - self._last_below) * 1000 >= self.release_ms:
                    mic.mark_idle()
                    self._attack_reached = False
        except Exception:
            pass
    def start(self):
        if self.running:
            return
        self.running = True
        kwargs = {"channels": 1, "dtype": "float32", "callback": self._callback}
        if self.device:
            try:
                dev_index = int(self.device)
                kwargs["device"] = dev_index
            except ValueError:
                kwargs["device"] = self.device
        self.stream = sd.InputStream(**kwargs)
        self.stream.start()
        log.info("Mic Monitor gestartet")
    def stop(self):
        if not self.running:
            return
        try:
            self.stream.stop()
            self.stream.close()
        except Exception:
            pass
        self.running = False
        log.info("Mic Monitor gestoppt")
    def set_device(self, device):
        self.device = device
        try:
            self.stop()
        except Exception:
            pass
        try:
            self.start()
        except Exception:
            pass
    @property
    def level(self):
        return self._level

micmon: MicrophoneMonitor | None = None

viewers: dict[str, dict] = {}
greet_tasks: dict[str, asyncio.Task] = {}

def touch_viewer(uid: str, nick: str = ""):
    now = time.time()
    v = viewers.get(uid, {"nick": nick or uid, "joined": now, "last_active": now, "greeted": False})
    if nick:
        v["nick"] = nick
    v["last_active"] = now
    viewers[uid] = v
    return v

def should_consider_present(uid: str) -> bool:
    ttl = int(cfg.get("join_rules", {}).get("active_ttl_seconds", 45))
    v = viewers.get(uid)
    if not v:
        return False
    return (time.time() - v["last_active"]) <= ttl

async def schedule_greeting(uid: str):
    if not int(cfg.get("join_rules", {}).get("enabled", 1)):
        return
    delay = int(cfg.get("join_rules", {}).get("greet_after_seconds", 30))
    try:
        await asyncio.sleep(delay)
        v = viewers.get(uid)
        if not v:
            return
        if v.get("greeted"):
            return
        u = _mem_user(uid)
        gcool = int(cfg.get("comment", {}).get("greeting_cooldown", 360))
        if time.time() - u.get("last_greet", 0) < gcool:
            return
        if not should_consider_present(uid):
            return
        v["greeted"] = True
        u["last_greet"] = time.time()
        PENDING_JOINS.add(v["nick"])
        log.info(f"Greet queued (pending summary): {v['nick']}")
    except Exception as e:
        log.error(f"Greet task error uid={uid}: {e}")
    finally:
        greet_tasks.pop(uid, None)

async def process_comments():
    comment_cfg = cfg.get("comment", {})
    if not bool(int(comment_cfg.get("enabled", 1))):
        while True:
            _ = await comment_queue.get()
        return
    global_cd = int(comment_cfg.get("global_cooldown", 6))
    per_user_cd = int(comment_cfg.get("per_user_cooldown", 15))
    max_per_min = int(comment_cfg.get("max_replies_per_min", 20))
    reply_threshold = float(comment_cfg.get("reply_threshold", 0.6))
    # guard against excessively high thresholds that would suppress almost all replies
    # If the configured threshold is above 0.8, lower it to 0.4.  This ensures that
    # comments mentioning the character by name or containing common keywords are
    # answered, while very short or trivial messages remain ignored.
    if reply_threshold > 0.8:
        log.info(f"reply_threshold {reply_threshold} zu hoch, setze auf 0.4")
        reply_threshold = 0.4
    resp_greet = bool(int(comment_cfg.get("respond_to_greetings", 1)))
    greet_cd = int(comment_cfg.get("greeting_cooldown", 360))
    resp_thanks = bool(int(comment_cfg.get("respond_to_thanks", 1)))
    scorer = Relevance(comment_cfg)
    resp = ResponseEngine(cfg)
    bucket = TokenBucket(capacity=max_per_min, rate_per_sec=max(1, max_per_min) / 60.0)
    next_allowed_global = 0.0
    per_user_until_local: dict[str, float] = {}
    while True:
        item = await comment_queue.get()
        try:
            txt = item["text"]
            uid = item["uid"]
            nick = item["nick"]
            touch_viewer(uid, nick)
            now = time.time()
            if len(txt) < int(comment_cfg.get("min_length", 3)) or scorer.is_ignored(txt):
                continue
            if now < per_user_until_local.get(uid, 0):
                await asyncio.sleep(0.05)
                await comment_queue.put(item)
                continue
            score = scorer.score(txt)
            quick = False
            if resp_greet and scorer.is_greeting(txt) and ("?" not in txt) and (len(txt.split()) <= 4):
                u = _mem_user(uid)
                if now - u.get("last_greet", 0) >= greet_cd:
                    u["last_greet"] = now
                    await bucket.take()
                    if time.time() < next_allowed_global:
                        await asyncio.sleep(max(0.01, next_allowed_global - time.time()))
                    if batcher:
                        await batcher.add(f"{nick} sagt hallo")
                    next_allowed_global = time.time() + global_cd
                    per_user_until_local[uid] = time.time() + per_user_cd
                    quick = True
            if quick:
                continue
            if resp_thanks and scorer.is_thanks(txt):
                await bucket.take()
                if time.time() < next_allowed_global:
                    await asyncio.sleep(max(0.01, next_allowed_global - time.time()))
                if batcher:
                    await batcher.add(f"{nick} bedankt sich")
                next_allowed_global = time.time() + global_cd
                per_user_until_local[uid] = time.time() + per_user_cd
                continue
            if score >= reply_threshold:
                await bucket.take()
                if time.time() < next_allowed_global:
                    await asyncio.sleep(max(0.01, next_allowed_global - time.time()))
                reply = await resp.reply_to_comment(nick, txt, uid)
                if reply and batcher:
                    await batcher.add(f"@{nick}: {txt} → {reply}")
                    next_allowed_global = time.time() + global_cd
                    per_user_until_local[uid] = time.time() + per_user_cd
        except Exception as e:
            log.error(f"process_comments Fehler: {e}")

async def process_event_batch():
    while True:
        try:
            tasks = [
                asyncio.create_task(gift_queue.get()),
                asyncio.create_task(join_queue.get()),
                asyncio.create_task(follow_queue.get()),
                asyncio.create_task(share_queue.get()),
                asyncio.create_task(subscribe_queue.get()),
                asyncio.create_task(like_queue.get())
            ]
            done, pending = await asyncio.wait(tasks, timeout=0.2, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
            for t in done:
                evt = t.result()
                uid = getattr(evt.user, "uniqueId", "") or getattr(evt.user, "id", "")
                if not uid:
                    continue
                nick = getattr(evt.user, "nickname", "") or uid
                touch_viewer(uid, nick)
                if isinstance(evt, GiftEvent):
                    gname = getattr(evt.gift, "name", "Gift")
                    count = int(getattr(evt, "repeat_count", getattr(evt.gift, "repeat_count", 1)) or 1)
                    remember_event(uid, nickname=nick, gift_inc=count)
                    if batcher:
                        await batcher.add(f"{nick} sent {gname} x{count}")
                elif isinstance(evt, JoinEvent):
                    remember_event(uid, nickname=nick, join=True)
                    if int(cfg.get("join_rules", {}).get("enabled", 1)):
                        if uid not in greet_tasks:
                            greet_tasks[uid] = asyncio.create_task(schedule_greeting(uid))
                        PENDING_JOINS.add(nick)
                elif isinstance(evt, FollowEvent):
                    remember_event(uid, nickname=nick, follow=True)
                    if batcher:
                        await batcher.add(f"{nick} followed")
                elif isinstance(evt, ShareEvent):
                    remember_event(uid, nickname=nick, share=True)
                    if batcher:
                        await batcher.add(f"{nick} shared")
                elif isinstance(evt, SubscribeEvent):
                    remember_event(uid, nickname=nick, sub=True)
                    if batcher:
                        await batcher.add(f"{nick} subscribed")
                elif isinstance(evt, LikeEvent):
                    count = int(getattr(evt, "count", 1))
                    if count >= int(cfg.get("like_threshold", 20)):
                        remember_event(uid, nickname=nick, like_inc=count)
                        if batcher:
                            await batcher.add(f"{nick} liked x{count}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            log.error(f"process_event_batch Fehler: {e}")

async def join_announcer_worker():
    global LAST_JOIN_ANNOUNCE_TS
    while True:
        await asyncio.sleep(1.0)
        if not batcher:
            continue
        if speech.is_speaking() or mic.is_active():
            continue
        if not PENDING_JOINS:
            continue
        idle_need = int(cfg.get("join_rules", {}).get("min_idle_since_last_output_sec", 25))
        gcd = int(cfg.get("join_rules", {}).get("greet_global_cooldown_sec", 180))
        if (time.time() - LAST_OUTPUT_TS) < idle_need:
            continue
        if (time.time() - LAST_JOIN_ANNOUNCE_TS) < gcd:
            continue
        names = list(PENDING_JOINS)[:20]
        for n in names:
            PENDING_JOINS.discard(n)
        if names:
            joined_chunk = ", ".join(names)
            await batcher.add(f"Neu dabei: {joined_chunk}")
            LAST_JOIN_ANNOUNCE_TS = time.time()

async def tiktok_listener():
    sess = cfg["tiktok"].get("session_id") or ""
    # Create the client without a session.  Session information will be
    # applied to the underlying HTTP client if supported.
    client = TikTokLiveClient(unique_id=cfg["tiktok"]["unique_id"])
    # Apply the login session token to the HTTP client if provided.  Newer
    # versions of TikTokLive require calling `client.web.set_session()` or
    # `client.web.set_session_id()` before connecting.  We attempt both
    # methods if available.
    if sess:
        try:
            if hasattr(client.web, "set_session_id"):
                client.web.set_session_id(sess)
            elif hasattr(client.web, "set_session"):
                client.web.set_session(sess)
            else:
                log.warning("TikTok Session ID konnte nicht gesetzt werden: keine passende Methode")
        except Exception as e:
            log.warning(f"TikTok Session ID konnte nicht gesetzt werden: {e}")
    comment_cfg = cfg.get("comment", {})
    min_len = int(comment_cfg.get("min_length", 3))
    scorer = Relevance(comment_cfg)
    def make_sig(prefix: str, *parts) -> str:
        raw = prefix + "|" + "|".join(str(p) for p in parts)
        return hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()
    @client.on(ConnectEvent)
    async def on_connect(evt: ConnectEvent):
        log.info(f"TikTok connected (Room {client.room_id})")
    @client.on(CommentEvent)
    async def on_comment(evt: CommentEvent):
        txt = (evt.comment or "").strip()
        low = txt.lower()
        if len(low) < min_len or scorer.is_ignored(low):
            return
        uid = getattr(evt.user, "uniqueId", "") or getattr(evt.user, "id", "")
        if not uid:
            return
        nick = getattr(evt.user, "nickname", "") or uid
        sig = make_sig("comment", uid, low)
        if await deduper.seen(sig):
            return
        touch_viewer(uid, nick)
        remember_event(uid, nickname=nick, message=txt)
        await comment_queue.put({"uid": uid, "nick": nick, "text": low})
        log.info(f"TikTok Kommentar von {nick}: {txt}")
    @client.on(GiftEvent)
    async def on_gift(evt: GiftEvent):
        uid = getattr(evt.user, "uniqueId", "") or getattr(evt.user, "id", "")
        sig = make_sig("gift", uid, getattr(evt.gift, "name", "Gift"), getattr(evt, "repeat_count", 1))
        if await deduper.seen(sig):
            return
        await gift_queue.put(evt)
    @client.on(FollowEvent)
    async def on_follow(evt: FollowEvent):
        now = time.time()
        if now - getattr(on_follow, "_last", 0) < int(cfg.get("comment", {}).get("global_cooldown", 6)):
            return
        setattr(on_follow, "_last", now)
        uid = getattr(evt.user, "uniqueId", "") or getattr(evt.user, "id", "")
        sig = make_sig("follow", uid)
        if await deduper.seen(sig):
            return
        await follow_queue.put(evt)
    @client.on(SubscribeEvent)
    async def on_subscribe(evt: SubscribeEvent):
        uid = getattr(evt.user, "uniqueId", "") or getattr(evt.user, "id", "")
        sig = make_sig("subscribe", uid)
        if await deduper.seen(sig):
            return
        await subscribe_queue.put(evt)
    @client.on(LikeEvent)
    async def on_like(evt: LikeEvent):
        await like_queue.put(evt)
    @client.on(ShareEvent)
    async def on_share(evt: ShareEvent):
        uid = getattr(evt.user, "uniqueId", "") or getattr(evt.user, "id", "")
        sig = make_sig("share", uid)
        if await deduper.seen(sig):
            return
        await share_queue.put(evt)
    @client.on(JoinEvent)
    async def on_join(evt: JoinEvent):
        uid = getattr(evt.user, "uniqueId", "") or getattr(evt.user, "id", "")
        if not uid:
            return
        nick = getattr(evt.user, "nickname", "") or uid
        sig = make_sig("join", uid)
        if await deduper.seen(sig):
            return
        touch_viewer(uid, nick)
        await join_queue.put(evt)
    @client.on(DisconnectEvent)
    async def on_disconnect(evt: DisconnectEvent):
        log.warning("TikTok disconnected; reconnecting…")
        await asyncio.sleep(5)
        await client.connect()
    asyncio.create_task(process_event_batch())
    asyncio.create_task(process_comments())
    await client.connect(fetch_gift_info=True)

async def clean_memory_periodic():
    while True:
        await asyncio.sleep(3600)
        decay_sec = mem_cfg.get("decay_days", 90) * 86400
        now = time.time()
        MEMORY["users"] = {uid: u for uid, u in MEMORY["users"].items() if now - u.get("last_seen", 0) < decay_sec}
        try:
            save_memory(MEMORY, mem_cfg.get("file", MEMORY_FILE))
        except Exception:
            pass
        log.info("Memory gecleant")

async def start_all():
    global batcher
    asyncio.create_task(sender_worker())
    asyncio.create_task(clean_memory_periodic())
    ob = cfg.get("outbox", {})
    batcher = OutboxBatcher(
        window_s=int(ob.get("window_seconds", 8)),
        max_items=int(ob.get("max_items", 8)),
        max_chars=int(ob.get("max_chars", 320)),
        sep=str(ob.get("separator", " • "))
    )
    asyncio.create_task(batcher.worker())
    asyncio.create_task(join_announcer_worker())
    await tiktok_listener()

class ScrollableFrame(ttk.Frame):
    def __init__(self, parent, *args, **kwargs):
        super().__init__(parent, *args, **kwargs)
        self.canvas = tk.Canvas(self, borderwidth=0, highlightthickness=0)
        self.vscroll = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self.vscroll.set)
        self.inner = ttk.Frame(self.canvas)
        self.inner.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.window_id = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.vscroll.grid(row=0, column=1, sticky="ns")
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)
        def _on_resize(event):
            self.canvas.itemconfig(self.window_id, width=event.width)
        self.canvas.bind("<Configure>", _on_resize)
        def _on_mousewheel(event):
            delta = 0
            if getattr(event, 'num', None) == 4: delta = -1
            elif getattr(event, 'num', None) == 5: delta = 1
            elif getattr(event, 'delta', 0): delta = -1 if event.delta > 0 else 1
            self.canvas.yview_scroll(delta, "units")
        self.canvas.bind_all("<MouseWheel>", _on_mousewheel)
        self.canvas.bind_all("<Button-4>", _on_mousewheel)
        self.canvas.bind_all("<Button-5>", _on_mousewheel)

class ConfigGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("TikTok → Animaze ChatPal Brain")
        self.geometry("980x720")
        self.minsize(820, 560)
        self.cfg = cfg
        self.grid_rowconfigure(0, weight=0)
        self.grid_rowconfigure(1, weight=0)
        self.grid_rowconfigure(2, weight=1)
        self.grid_columnconfigure(0, weight=1)
        self.scroll = ScrollableFrame(self)
        self.scroll.grid(row=0, column=0, sticky="nsew", padx=12, pady=(12, 6))
        frm = self.scroll.inner
        entries = [
            ("TikTok Handle", "tiktok", "unique_id"),
            ("TikTok Session ID (optional)", "tiktok", "session_id"),
            ("Animaze Host", "animaze", "host"),
            ("Animaze Port", "animaze", "port"),
            ("OpenAI API Key", "openai", "api_key"),
            ("OpenAI Model", "openai", "model"),
            ("Max Line Length", "style", "max_line_length"),
            ("Comment Enabled (0/1)", "comment", "enabled"),
            ("Comment Global Cooldown (s)", "comment", "global_cooldown"),
            ("Comment Per-User Cooldown (s)", "comment", "per_user_cooldown"),
            ("Comment Min Length", "comment", "min_length"),
            ("Max Replies Per Minute", "comment", "max_replies_per_min"),
            ("Reply Threshold (0..1)", "comment", "reply_threshold"),
            ("Respond to Greetings (0/1)", "comment", "respond_to_greetings"),
            ("Greeting Cooldown (s)", "comment", "greeting_cooldown"),
            ("Respond to Thanks (0/1)", "comment", "respond_to_thanks"),
            ("Ignore if startswith (csv)", "comment", "ignore_if_startswith"),
            ("Ignore if contains (csv)", "comment", "ignore_contains"),
            ("De-dupe TTL (s)", None, "dedupe_ttl"),
            ("Mic Enabled (0/1)", "microphone", "enabled"),
            ("Mic Device (Name oder Index)", "microphone", "device"),
            ("Mic Silence Threshold (RMS 0..1)", "microphone", "silence_threshold"),
            ("Mic Attack (ms)", "microphone", "attack_ms"),
            ("Mic Release (ms)", "microphone", "release_ms"),
            ("Flush Delay (ms)", "microphone", "flush_delay_ms"),
            ("Join: Enabled (0/1)", "join_rules", "enabled"),
            ("Join: Greet after seconds", "join_rules", "greet_after_seconds"),
            ("Join: Active TTL seconds", "join_rules", "active_ttl_seconds"),
            ("Join: Min idle since last output (s)", "join_rules", "min_idle_since_last_output_sec"),
            ("Join: Global welcome cooldown (s)", "join_rules", "greet_global_cooldown_sec"),
            ("Outbox: Window (s)", "outbox", "window_seconds"),
            ("Outbox: Max Items", "outbox", "max_items"),
            ("Outbox: Max Chars", "outbox", "max_chars"),
            ("Outbox: Separator", "outbox", "separator"),
            ("Speech: Wait start (ms)", "speech", "wait_start_timeout_ms"),
            ("Speech: Max speech (ms)", "speech", "max_speech_ms"),
            ("Speech: Post gap (ms)", "speech", "post_gap_ms")
        ]
        self.vars = {}
        for i, (label, sec, key) in enumerate(entries):
            ttk.Label(frm, text=label + ":").grid(row=i, column=0, sticky="w", pady=3, padx=(2, 8))
            val = self._get_val(sec, key)
            if isinstance(val, list):
                val = ",".join(map(str, val))
            var = tk.StringVar(value=str(val))
            self.vars[(sec, key)] = var
            ttk.Entry(frm, textvariable=var, width=56).grid(row=i, column=1, pady=3, sticky="ew")
        dev_row = len(entries) + 1
        ttk.Label(frm, text="Input-Gerät wählen:").grid(row=dev_row, column=0, sticky="w", pady=(10,3))
        try:
            devices = sd.query_devices()
            self.input_devs = [f"{i}: {d['name']}" for i, d in enumerate(devices) if int(d.get('max_input_channels', 0)) > 0]
        except Exception:
            self.input_devs = []
        self.dev_combo_var = tk.StringVar(value=self.input_devs[0] if self.input_devs else "Keine Eingänge gefunden")
        self.dev_combo = ttk.Combobox(frm, textvariable=self.dev_combo_var, values=self.input_devs, state="readonly", width=56)
        self.dev_combo.grid(row=dev_row, column=1, sticky="ew", pady=(10,3))
        btns = ttk.Frame(frm)
        btns.grid(row=dev_row+1, column=1, sticky="w", pady=(0,6))
        ttk.Button(btns, text="Als Mic Device übernehmen", command=self.apply_selected_device_to_cfg).grid(row=0, column=0, padx=(0,8))
        ttk.Button(btns, text="Laufend wechseln (ohne Neustart)", command=self.switch_device_live).grid(row=0, column=1)
        vu_row = dev_row + 2
        ttk.Label(frm, text="Mic Level (VU):").grid(row=vu_row, column=0, sticky="w", pady=(8,3))
        self.vu = ttk.Progressbar(frm, orient="horizontal", mode="determinate", length=380, maximum=1.0)
        self.vu.grid(row=vu_row, column=1, sticky="ew", pady=(8,3))
        frm.columnconfigure(1, weight=1)
        btn_frame = ttk.Frame(self)
        btn_frame.grid(row=1, column=0, sticky="ew", padx=12, pady=(0, 6))
        btn_frame.columnconfigure(0, weight=1)
        ttk.Button(btn_frame, text="Save & Start", command=self.on_save).grid(row=0, column=0, padx=5, sticky="w")
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).grid(row=0, column=1, padx=5, sticky="w")
        self.log_text = scrolledtext.ScrolledText(self, wrap=tk.WORD)
        self.log_text.grid(row=2, column=0, sticky="nsew", padx=12, pady=(0, 12))
        self.log_text.configure(height=12)
        logging.getLogger().addHandler(GUIHandler(self.log_text))
        self.after(60, self._update_vu)

    def _update_vu(self):
        try:
            if micmon:
                self.vu["value"] = float(micmon.level)
            else:
                self.vu["value"] = 0.0
        except Exception:
            self.vu["value"] = 0.0
        self.after(60, self._update_vu)

    def apply_selected_device_to_cfg(self):
        sel = self.dev_combo_var.get()
        if ":" in sel:
            idx = sel.split(":")[0].strip()
        else:
            idx = sel.strip()
        if ("microphone","device") in self.vars:
            self.vars[("microphone","device")].set(idx)
        self.cfg.setdefault("microphone", {})["device"] = idx
        save_settings(self.cfg)

    def switch_device_live(self):
        sel = self.dev_combo_var.get()
        if not sel or ":" not in sel:
            messagebox.showerror("Fehler", "Kein gültiges Eingabegerät gewählt.")
            return
        idx = sel.split(":")[0].strip()
        global micmon
        if not micmon:
            messagebox.showerror("Fehler", "Mic-Monitor läuft noch nicht.")
            return
        micmon.set_device(idx)
        if ("microphone","device") in self.vars:
            self.vars[("microphone","device")].set(idx)
        self.cfg.setdefault("microphone", {})["device"] = idx
        save_settings(self.cfg)

    def _get_val(self, sec, key):
        if sec:
            return self.cfg.get(sec, {}).get(key)
        return self.cfg.get(key)

    def on_save(self):
        numeric_keys = {
            ("style", "max_line_length"),
            ("comment", "enabled"), ("comment", "global_cooldown"), ("comment", "per_user_cooldown"),
            ("comment", "min_length"), ("comment", "max_replies_per_min"),
            ("comment", "respond_to_greetings"), ("comment", "greeting_cooldown"), ("comment", "respond_to_thanks"),
            (None, "dedupe_ttl"), ("animaze", "port"),
            ("microphone", "enabled"), ("microphone", "attack_ms"), ("microphone", "release_ms"),
            ("microphone", "flush_delay_ms"),
            ("join_rules", "enabled"), ("join_rules", "greet_after_seconds"), ("join_rules", "active_ttl_seconds"),
            ("join_rules", "min_idle_since_last_output_sec"), ("join_rules", "greet_global_cooldown_sec"),
            ("outbox", "window_seconds"), ("outbox", "max_items"), ("outbox", "max_chars"),
            ("speech", "wait_start_timeout_ms"), ("speech", "max_speech_ms"), ("speech", "post_gap_ms")
        }
        float_keys = {("comment", "reply_threshold"), ("microphone", "silence_threshold")}
        list_keys = {("comment", "ignore_if_startswith"), ("comment", "ignore_contains")}
        for (sec, key), var in self.vars.items():
            v = var.get().strip()
            if (sec, key) in list_keys:
                items = [x.strip() for x in v.split(",") if x.strip()]
                if sec: self.cfg.setdefault(sec, {})[key] = items
                else: self.cfg[key] = items
                continue
            if (sec, key) in float_keys:
                try: v = float(v)
                except ValueError:
                    messagebox.showerror("Ungültiger Wert", f"{key} muss eine Kommazahl sein."); return
            elif (sec, key) in numeric_keys:
                try: v = int(float(v))
                except ValueError:
                    messagebox.showerror("Ungültiger Wert", f"{key} muss eine Zahl sein."); return
            if sec: self.cfg.setdefault(sec, {})[key] = v
            else: self.cfg[key] = v
        save_settings(self.cfg)
        messagebox.showinfo("Gespeichert", "Einstellungen gespeichert. Starte…")
        global cfg, animaze_uri, animaze_ws, gift_queue, like_queue, join_queue, follow_queue, share_queue, subscribe_queue, mem_cfg, MEMORY, deduper, micmon, batcher, viewers, greet_tasks, LAST_OUTPUT_TS, LAST_JOIN_ANNOUNCE_TS, PENDING_JOINS
        cfg = self.cfg
        animaze_uri = f"ws://{cfg['animaze']['host']}:{cfg['animaze']['port']}"
        animaze_ws = None
        gift_queue = asyncio.Queue()
        like_queue = asyncio.Queue()
        join_queue = asyncio.Queue()
        follow_queue = asyncio.Queue()
        share_queue = asyncio.Queue()
        subscribe_queue = asyncio.Queue()
        mem_cfg = cfg.get("memory", {})
        MEMORY = load_memory(mem_cfg.get("file", MEMORY_FILE), mem_cfg.get("decay_days", 90))
        deduper = EventDeduper(int(cfg.get("dedupe_ttl", 600)))
        viewers = {}
        greet_tasks = {}
        LAST_OUTPUT_TS = 0.0
        LAST_JOIN_ANNOUNCE_TS = 0.0
        PENDING_JOINS = set()
        try:
            if micmon:
                micmon.stop()
        except Exception:
            pass
        def vu_cb(level):
            pass
        mic_device = str(cfg.get("microphone", {}).get("device", "")).strip()
        mic_enabled = int(cfg.get("microphone", {}).get("enabled", 1))
        if mic_enabled:
            micmon_obj = MicrophoneMonitor(cfg, level_cb=vu_cb)
            if mic_device:
                micmon_obj.set_device(mic_device)
            else:
                micmon_obj.start()
            micmon = micmon_obj
        else:
            micmon = None
        ob = cfg.get("outbox", {})
        batcher = OutboxBatcher(
            window_s=int(ob.get("window_seconds", 8)),
            max_items=int(ob.get("max_items", 8)),
            max_chars=int(ob.get("max_chars", 320)),
            sep=str(ob.get("separator", " • "))
        )
        threading.Thread(target=lambda: asyncio.run(start_all()), daemon=True).start()

class GUIHandler(logging.Handler):
    def __init__(self, text_widget):
        super().__init__()
        self.text_widget = text_widget
    def emit(self, record):
        try:
            msg = self.format(record)
            self.text_widget.insert(tk.END, msg + "\n")
            self.text_widget.see(tk.END)
        except Exception:
            pass

if __name__ == "__main__":
    app = ConfigGUI()
    app.mainloop()
