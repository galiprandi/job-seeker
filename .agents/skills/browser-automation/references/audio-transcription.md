# Audio transcription (any source)

Transcribe audio files to text **fully locally** — no API keys, no cloud,
no per-request cost. Works for audio from ANY source: WhatsApp voice notes,
Telegram files, downloads, uploads, recordings.

## Quick use

```bash
node .agents/skills/browser-automation/scripts/transcribe-audio.js <audio-file>
```

Prints the transcript to stdout and writes `<audio>.txt` next to the file.

```bash
# variants
node .../transcribe-audio.js voice.ogg --stdout-only   # no .txt written
node .../transcribe-audio.js voice.ogg --out /tmp/t.txt
node .../transcribe-audio.js long-audio.mp3 --threads 4
```

## How it works

The script uses the [`audio-transcription`](https://www.npmjs.com/package/audio-transcription)
npm package (sherpa-onnx + Parakeet TDT v3, 25 European languages).

- If the package is not resolvable from the current repo, the script
  installs it on demand into `~/.cache/agent-tools` (`AGENT_TOOLS_DIR` to
  override). Nothing is added to the repo's package.json.
- First transcription on a machine downloads ~640MB (runtime + model) into
  `~/.cache/audio-transcription` — shared by ALL agents on that machine.
  Progress is logged to stderr; later runs skip setup entirely.
- Speed: ~3x realtime on a modern CPU (60s audio ≈ 20s). Decode is
  serialized machine-wide: concurrent transcriptions queue instead of
  fighting for CPU.
- Formats: anything ffmpeg supports — ogg/opus (WhatsApp/Telegram voice
  notes), mp3, m4a, wav, mp4 audio tracks.

## Privacy

Audio never leaves the machine. Prefer this over cloud ASR APIs
(Groq Whisper, OpenAI, etc.) for personal or third-party audio.

## When NOT to use

- Real-time/streaming transcription — this is batch, one file at a time.
- Very long files (hours) — works but slow on CPU; consider chunking.
- Code-switched or very noisy audio may show lower accuracy than
  Whisper-large — Parakeet v3 is strongest on clean speech. If quality is
  insufficient, tell the user; a different engine can be swapped inside
  `audio-transcription` without changing this script.

## For agents: typical flow

1. Obtain the audio file by whatever means the source requires
   (e.g., WhatsApp Web cache extraction — see `sites/whatsapp_com/voice-notes.md`).
2. Run `transcribe-audio.js <file>`.
3. Read the `.txt` (or stdout) and act on the content.
4. Delete the audio file when done — voice notes are sensitive data.
