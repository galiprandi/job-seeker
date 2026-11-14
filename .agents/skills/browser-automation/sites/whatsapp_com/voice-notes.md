---
name: whatsapp-web-voice-notes
description: Extract WhatsApp Web voice notes from the browser's Cache Storage and transcribe them locally. Use when you need to read the content of a voice message.
---

# WhatsApp Web — Voice Note Extraction & Transcription

## When to use

You need to know the content of a WhatsApp Web voice note (push-to-talk audio message). WhatsApp Web does not expose `<audio>` elements in the DOM, does not provide a native transcription feature, and does not show a downloadable URL. The audio is stored in the browser's Cache Storage after it has been played or pre-fetched.

## Prerequisites

- A WhatsApp Web session is authenticated and the conversation containing the voice note is open.
- The voice note has been played at least once (this triggers WhatsApp to fetch and cache the audio). If it hasn't been played, click the play button first.
- `ffmpeg`/`ffprobe` installed locally (for duration inspection).
- Nothing else — transcription runs locally via `audio-transcription` (auto-installed on first use, ~640MB one-time download to `~/.cache/audio-transcription`). See `references/audio-transcription.md`.

## Why DOM extraction fails

WhatsApp Web plays voice notes via the Web Audio API, not via `<audio>` or `<source>` elements. Inspecting the DOM for media elements returns empty results:

```js
document.querySelectorAll('audio')   // → []
document.querySelectorAll('source')  // → []
```

Network interception also fails because the audio is fetched once, cached, and subsequent plays read from cache without new network requests.

## The working approach: Cache Storage extraction

WhatsApp Web stores media blobs in the Cache API under the key `lru-media-array-buffer-cache`. Voice notes are Ogg/Opus files with the magic bytes `OggS`.

### Step 1: List all cached media and identify Ogg files

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  return caches.open('lru-media-array-buffer-cache').then(cache => {
    return cache.keys().then(keys => {
      return Promise.all(keys.map((k, i) => {
        return cache.match(k).then(r => {
          if (!r) return {i, size: 0, magic: null};
          return r.blob().then(b => {
            return b.slice(0, 4).arrayBuffer().then(buf => {
              const bytes = new Uint8Array(buf);
              const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
              return {i, size: b.size, magic};
            });
          });
        });
      })).then(results => JSON.stringify(results.filter(r => r.magic === 'OggS')));
    });
  });
})()"
```

This returns an array of `{i, size, magic}` for all Ogg/Opus files in the cache.

### Step 2: Match by duration

Voice notes have known durations shown in the UI (e.g., `0:31`). Use `ffprobe` to check each extracted file's duration and match it to the target note.

### Step 3: Extract a specific Ogg file as base64

Replace `<INDEX>` with the cache index from step 1:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "(() => {
  return caches.open('lru-media-array-buffer-cache').then(cache => {
    return cache.keys().then(keys => {
      return cache.match(keys[<INDEX>]).then(r => {
        if (!r) return 'no response';
        return r.blob().then(b => {
          return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(b);
          });
        });
      });
    });
  });
})()"
```

The base64 output can be piped to Python to decode and save:

```bash
node .agents/skills/browser-automation/scripts/browser.js exec eval "..." 2>&1 | python3 -c "
import sys, base64
data = sys.stdin.read()
start = data.find('\"') + 1
end = data.rfind('\"')
b64 = data[start:end]
with open('audios/voice_<INDEX>.ogg', 'wb') as f:
    f.write(base64.b64decode(b64))
print('saved')
"
```

> **Output truncation caveat (verified 2026-11-02):** the wrapper output is capped at ~50,000 chars. Files whose base64 exceeds ~50KB (i.e., most voice notes longer than ~25s) come out truncated and fail to decode ("Incorrect padding" or empty files). Fix: extract the base64 in chunks under 50KB each and concatenate:
>
> ```bash
> # for CHUNK in 0..N-1 (N = ceil(base64_len / 40000)):
> #   resolve(d.slice(CHUNK*40000, (CHUNK+1)*40000))
> # append each chunk to a file, then base64 -d
> ```
>
> Quick sizing rule: 16kbps Opus → ~2KB/s → ~2.7KB base64/s, so notes under ~25s fit in one shot; longer ones need 2-3 chunks.

### Step 4: Check duration with ffprobe

```bash
ffprobe audios/voice_<INDEX>.ogg 2>&1 | grep "Duration"
```

### Step 5: Transcribe locally

```bash
node .agents/skills/browser-automation/scripts/transcribe-audio.js audios/voice_<INDEX>.ogg
```

Prints the transcript to stdout and writes `audios/voice_<INDEX>.txt` next to it. Fully local (sherpa-onnx Parakeet) — no API key, audio never leaves the machine. First run downloads the model once; later runs take seconds. See `references/audio-transcription.md` for options (`--stdout-only`, `--threads`, `--out`).

### Step 6: Clean up

Remove the temporary audio file after transcription:

```bash
rm audios/voice_<INDEX>.ogg
```

Ensure `audios/` is in `.gitignore` to prevent accidental commits.

## Identifying the correct voice note

When multiple voice notes are cached, match by duration:

1. Note the duration shown in WhatsApp Web (e.g., `0:31`).
2. Extract all Ogg files and run `ffprobe` on each.
3. The file whose duration is closest to the UI display is the target.

If two files have similar durations, transcribe both and pick the one whose content matches the conversation context.

## Anti-patterns

- **Do not** look for `<audio>` elements in the DOM — WhatsApp Web does not use them for voice notes.
- **Do not** rely on network interception alone — the audio may already be cached from a previous play.
- **Do not** assume the first Ogg file in the cache is the target — always match by duration.
- **Do not** use local `openai-whisper` with `--model large` on CPU — it is very slow and heavy. Use `transcribe-audio.js` (Parakeet int8 via sherpa-onnx) instead: ~3x realtime, ~650MB RAM.

## Limitations

- The voice note must have been played or pre-fetched at least once for it to appear in Cache Storage.
- The Cache Storage key `lru-media-array-buffer-cache` may change in future WhatsApp Web versions.
- The cache is LRU-based; old media may be evicted if many files are loaded.
- Transcription is serialized machine-wide: concurrent voice notes queue rather than run in parallel (protects CPU).
- Parakeet v3 covers 25 European languages; heavy code-switching or very noisy audio may transcribe worse than Whisper-large. If quality is insufficient, report it — the engine can be swapped inside `audio-transcription`.

## Notes

- WhatsApp voice notes are Ogg/Opus format, mono, 16-48 kHz.
- The Cache API is accessible via `caches.open()` in the page context.
- Other media types in the cache: JPEG (`ÿØÿà`), WAV/RIFF (`RIFF`).

**Validated:** 2026-08-21 against live `web.whatsapp.com`; transcription path updated 2026-11-14 to local `audio-transcription` (was Groq Whisper).
