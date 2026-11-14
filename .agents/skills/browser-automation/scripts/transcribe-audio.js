#!/usr/bin/env node
/**
 * transcribe-audio.js — local audio transcription for any agent.
 *
 * Transcribes an audio/video file to text using the `audio-transcription`
 * npm package (sherpa-onnx Parakeet, fully local — no API keys, no cloud).
 *
 * Usage:
 *   node transcribe-audio.js <audio-file> [--out <file.txt>] [--lang note]
 *
 * Options:
 *   --out <path>   Write transcript to file (default: <audio>.txt next to it)
 *   --stdout-only  Print transcript, do not write any file
 *   --threads <n>  ONNX decode threads (default: min(8, cpu count))
 *
 * First run downloads ~640MB (runtime + model) into
 * ~/.cache/audio-transcription — shared by ALL agents on this machine.
 * Subsequent runs are fast (~3x realtime on a modern CPU).
 *
 * If `audio-transcription` is not resolvable, it is installed on demand
 * into ~/.cache/agent-tools (override with AGENT_TOOLS_DIR).
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const execFileP = promisify(execFile);
const TOOLS_DIR = process.env.AGENT_TOOLS_DIR || join(homedir(), '.cache', 'agent-tools');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--stdout-only') args.stdoutOnly = true;
    else if (a === '--threads') args.threads = Number(argv[++i]);
    else if (a.startsWith('--')) { console.error(`Unknown flag: ${a}`); process.exit(2); }
    else args._.push(a);
  }
  return args;
}

async function loadTranscriber() {
  // 1) Try normal resolution (works if the repo has it as a dependency).
  try {
    return await import('audio-transcription');
  } catch {}

  // 2) Try previously installed tools dir.
  const toolsEntry = join(TOOLS_DIR, 'node_modules', 'audio-transcription', 'dist', 'index.js');
  if (existsSync(toolsEntry)) {
    return import(pathToFileURL(toolsEntry).href);
  }

  // 3) Install on demand.
  console.error('[transcribe] installing audio-transcription into ' + TOOLS_DIR + ' (first run only)…');
  await mkdir(TOOLS_DIR, { recursive: true });
  await execFileP('npm', ['install', '--prefix', TOOLS_DIR, 'audio-transcription@^0.1.0', '--no-audit', '--no-fund'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (!existsSync(toolsEntry)) {
    throw new Error('audio-transcription install completed but entry point not found');
  }
  return import(pathToFileURL(toolsEntry).href);
}

const args = parseArgs(process.argv.slice(2));
const file = args._[0];
if (!file) {
  console.error('Usage: node transcribe-audio.js <audio-file> [--out file.txt] [--stdout-only] [--threads N]');
  process.exit(2);
}

const abs = resolve(file);
if (!existsSync(abs)) {
  console.error(`File not found: ${abs}`);
  process.exit(1);
}

const { transcribeAudio } = await loadTranscriber();

const opts = { onProgress: (e) => console.error(`[transcribe] ${e.stage}: ${e.message}`) };
if (args.threads) opts.numThreads = args.threads;

const text = await transcribeAudio(abs, opts);
if (!text || !text.trim()) {
  console.error('[transcribe] empty transcript');
  process.exit(1);
}

const trimmed = text.trim();
console.log(trimmed);

if (!args.stdoutOnly) {
  const out = args.out ? resolve(args.out) : abs.replace(/\.[^.]+$/, '') + '.txt';
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, trimmed + '\n', 'utf8');
  console.error(`[transcribe] saved → ${out}`);
}
