"""Mimic brain: a tiny local service that lets the host's own AI choose what Emberdeep's mimic says.

Run it on the computer that hosts the game, next to Ollama:

    uv run --with faster-whisper --with av==18.0.0 python tools/mimic_brain.py

(av is pinned to 18 because av 19 breaks faster-whisper's audio decoding.)

Then, in the game's pause menu (host only), tick "Local AI picks the mimic's lines".
The contract is in docs/mimic-brain.md. Clips are kept in memory only for the length of one
request; nothing is written to disk or sent anywhere except the local Ollama.

Settings (environment variables):
    MIMIC_PORT      port to listen on (default 7794)
    MIMIC_OLLAMA    Ollama base URL (default http://127.0.0.1:7790/ollama, AI-Router's queue;
                    falls back to http://127.0.0.1:11434 if that does not answer)
    MIMIC_MODEL     chat model (default qwen3:4b-instruct-2507)
    MIMIC_WHISPER   faster-whisper model size (default small.en, on the CPU so the GPU stays
                    free for the game and the chat model)
    MIMIC_ORIGINS   comma-separated pages allowed to call this service
"""
import io
import json
import os
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("MIMIC_PORT", "7794"))
OLLAMA = [u.rstrip("/") for u in os.environ.get(
    "MIMIC_OLLAMA", "http://127.0.0.1:7790/ollama,http://127.0.0.1:11434").split(",") if u.strip()]
MODEL = os.environ.get("MIMIC_MODEL", "qwen3:4b-instruct-2507")
WHISPER = os.environ.get("MIMIC_WHISPER", "small.en")
ORIGINS = {o.strip() for o in os.environ.get(
    "MIMIC_ORIGINS", "https://dndnoob.github.io,http://localhost:8123,http://127.0.0.1:8123").split(",") if o.strip()}
MAX_CLIP = 300_000   # bytes; the game never sends more than 200 KB
MAX_JSON = 20_000

_whisper = None
_whisper_lock = threading.Lock()
_pending = 0   # transcribe requests waiting for the lock or running
_pending_lock = threading.Lock()
MAX_PENDING = 2


def transcribe(audio: bytes) -> str:
    """Speech to text for one short clip (webm/opus from the browser)."""
    global _whisper
    with _whisper_lock:   # one clip at a time; the model is not thread-safe
        if _whisper is None:
            from faster_whisper import WhisperModel
            _whisper = WhisperModel(WHISPER, device="cpu", compute_type="int8")
        segments, _ = _whisper.transcribe(io.BytesIO(audio), language="en", beam_size=1,
                                          vad_filter=False, condition_on_previous_text=False)
        return " ".join(s.text.strip() for s in segments).strip()[:200]


def ask_ollama(prompt: str, keys: list) -> str:
    """Ask the chat model for one key; returns '' if nothing usable comes back."""
    body = json.dumps({
        "model": MODEL, "stream": False, "think": False,
        "messages": [{"role": "user", "content": prompt}],
        "format": {"type": "object", "properties": {"key": {"type": "string", "enum": keys}}, "required": ["key"]},
        "options": {"temperature": 0.5, "num_ctx": 2048, "num_predict": 40},
    }).encode()
    for base in OLLAMA:
        try:
            req = urllib.request.Request(base + "/api/chat", data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                out = json.loads(r.read())
            key = json.loads(out["message"]["content"]).get("key", "")
            if key in keys:
                return key
        except Exception as e:   # try the next address, then give up quietly
            print(f"ollama at {base}: {e}", file=sys.stderr)
    return ""


def pick(q: dict) -> str:
    clips = [c for c in q.get("clips", []) if isinstance(c, dict) and c.get("key") and c.get("text")][:12]
    if not clips:
        return ""
    last = str(q.get("last") or "")
    if len(clips) >= 2:   # never repeat the previous line when there is any other choice
        clips = [c for c in clips if str(c["key"]) != last] or clips
    keys = [str(c["key"]) for c in clips]
    lines = "\n".join(f'{c["key"]} | "{str(c["text"])[:120]}"' for c in clips)
    prompt = (
        "You are the mind of a mimic in a co-op horror maze game. The mimic looks exactly like the player "
        f'{str(q.get("as", "a player"))[:20]} and can replay recordings of that player\'s real voice. '
        f'It is hunting {str(q.get("victim", "another player"))[:20]}, who is about {q.get("distance", "?")} tiles away'
        f'{" in total darkness" if q.get("dark") else ""}.\n'
        "Choose the ONE recording most likely to make the victim trust it and walk toward it: calls for help, "
        '"come here", "over here", "I found it", "wait for me", or their name. Avoid lines that mention the mimic, '
        "that sound like a warning, or that are just noise. "
        "\n\n"
        f"Recordings (key | what is said):\n{lines}\n\n"
        'Answer with JSON only: {"key": "<one of the keys>"}'
    )
    return ask_ollama(prompt, keys)


class Handler(BaseHTTPRequestHandler):
    server_version = "MimicBrain/1"

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")

    def _json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _allowed(self):
        # a page from anywhere else on the web may not use this service
        origin = self.headers.get("Origin")
        return origin is None or origin in ORIGINS

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") == "/emberdeep/health":
            return self._json(200, {"ok": True, "model": MODEL, "whisper": WHISPER})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._allowed():
            return self._json(403, {"error": "origin not allowed"})
        path = self.path.rstrip("/")
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = -1
        try:
            if path == "/emberdeep/transcribe":
                global _pending
                if not 0 < n <= MAX_CLIP:
                    return self._json(413, {"error": "clip too large"})
                with _pending_lock:
                    busy = _pending >= MAX_PENDING
                    if not busy:
                        _pending += 1
                if busy:   # shed load: the game treats a non-200 as "no text"
                    self.rfile.read(n)
                    return self._json(503, {"error": "busy"})
                try:
                    return self._json(200, {"text": transcribe(self.rfile.read(n))})
                finally:
                    with _pending_lock:
                        _pending -= 1
            if path == "/emberdeep/pick":
                if not 0 < n <= MAX_JSON:
                    return self._json(413, {"error": "request too large"})
                q = json.loads(self.rfile.read(n))
                key = pick(q if isinstance(q, dict) else {})
                return self._json(200, {"key": key} if key else {})
        except Exception as e:
            print(f"{path}: {e}", file=sys.stderr)
            return self._json(500, {"error": "failed"})
        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):   # one short line per request, no clip contents
        print(f"{self.command} {self.path.split('?')[0]} -> {args[1] if len(args) > 1 else ''}", file=sys.stderr)


if __name__ == "__main__":
    print(f"Mimic brain on http://127.0.0.1:{PORT}/emberdeep  (model {MODEL}, whisper {WHISPER})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
