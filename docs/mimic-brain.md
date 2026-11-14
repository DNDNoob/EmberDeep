# Mimic brain: local AI picks what the mimic says

Optional. When the host turns on **Local AI picks the mimic's lines** (pause menu, host only), the host's browser talks to a small HTTP service on the host's own computer. If the service is missing or slow, the mimic falls back to its built-in choice (longer, louder clips, never the same one twice in a row).

Default address: `http://127.0.0.1:7790/emberdeep` (AI-Router's port). It can be changed in the pause menu.

## Endpoints

`POST /emberdeep/transcribe`
Body: the raw clip audio, usually `audio/webm` (Opus), 0.6 to 4.5 seconds.
Reply: `{"text": "over here, I found a shard"}`. faster-whisper is a good fit.

`POST /emberdeep/pick`
Body:
```json
{"as": "Sam", "victim": "Andrew", "depth": 3, "dark": false, "distance": 7.5, "last": "id:4",
 "clips": [{"key": "id:3", "text": "wait for me", "seconds": 1.4}, {"key": "id:4", "text": "over here", "seconds": 0.9}]}
```
`as` is the player the mimic is pretending to be, `victim` is who it is hunting, and `distance` is in tiles.
Reply: `{"key": "id:3"}`, one of the given keys. Pick the line most likely to make `victim` walk toward `as` (calls for help, "come here", "I found it"), and avoid `last`. A small model (qwen3:4b-instruct) is plenty. It is asked a second or two before the line is needed, so a reply within about 1.5 s is used right away and a slower reply is used for the line after.

## Browser rules the service must follow

The game page is served over https from GitHub Pages and calls `http://127.0.0.1`. Chrome allows this only if the service replies to the `OPTIONS` preflight with:

```
Access-Control-Allow-Origin: https://dndnoob.github.io
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Private-Network: true
```

Clips are friends' voices: keep them in memory only, and don't write them to disk or send them anywhere else.
