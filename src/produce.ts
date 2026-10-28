import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { buildAss } from './ass';
import type { ResolvedConfig } from './config';
import {
  layoutTimeline,
  normalise,
  round,
  similarity,
  type HeardWord,
  type Voiced,
} from './layout';
import { findNewestRecording } from './utils';
import { speak, ttsPrompt } from './tts';
import type { Script, ScriptLine } from './types';

const VOICE_ATTEMPTS = 3;
const MATCH_THRESHOLD = 0.85;

export const findTranscriberScript = (): string => {
  const candidates = [
    join(__dirname, '..', 'assets', 'transcribe.py'),
    join(__dirname, 'assets', 'transcribe.py'),
    join(__dirname, 'transcribe.py'),
    join(process.cwd(), 'assets', 'transcribe.py'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
};

export const transcribe = (
  files: string[],
  pythonScript: string = findTranscriberScript()
): Map<string, { text: string; words: HeardWord[] }> | null => {
  if (!existsSync(pythonScript)) return null;
  const result = spawnSync('python', ['-I', pythonScript, ...files], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) return null;

  const heard = new Map<string, { text: string; words: HeardWord[] }>();
  for (const row of result.stdout.split(/\r?\n/).filter((r) => r.startsWith('{'))) {
    try {
      const { file, text, words } = JSON.parse(row);
      heard.set(file, { text, words: words || [] });
    } catch {
      // ignore malformed line
    }
  }
  return heard;
};

export async function voiceLines(
  folder: string,
  lines: ScriptLine[],
  config: ResolvedConfig
): Promise<Voiced[]> {
  const voiceCache = join(config.app.outDir, '.voice-cache');
  mkdirSync(voiceCache, { recursive: true });
  mkdirSync(join(folder, 'voice'), { recursive: true });

  const clipFor = (line: ScriptLine) => {
    const key = createHash('sha1')
      .update(
        [config.voice.model, config.voice.voice, ttsPrompt(line.text, config.voice.style)].join(
          '|'
        )
      )
      .digest('hex');
    return {
      wav: join(voiceCache, `${key}.wav`),
      checked: join(voiceCache, `${key}.words.json`),
    };
  };

  const apiKey =
    typeof config.voice.apiKey === 'function'
      ? config.voice.apiKey()
      : config.voice.apiKey;

  let pending = lines.filter((line) => !existsSync(clipFor(line).checked));
  for (let attempt = 1; attempt <= VOICE_ATTEMPTS && pending.length; attempt += 1) {
    for (const line of pending) {
      if (attempt > 1 || !existsSync(clipFor(line).wav)) {
        console.log(`  voicing ${line.id}${attempt > 1 ? ` (try ${attempt})` : ''}...`);
        await speak(line.text, clipFor(line).wav, {
          model: config.voice.model,
          voice: config.voice.voice,
          style: config.voice.style,
          apiKey,
        });
      }
    }

    const heard = transcribe(pending.map((line) => clipFor(line).wav));
    if (!heard) {
      console.warn(
        '  [WARNING] Speech check skipped (needs python with faster-whisper). Listen to clips before posting.'
      );
      pending = [];
      break;
    }

    pending = pending.filter((line) => {
      const result = heard.get(clipFor(line).wav);
      const said = result ? result.text : '';
      const score = similarity(normalise(line.text), normalise(said));
      if (result && score >= MATCH_THRESHOLD) {
        writeFileSync(
          clipFor(line).checked,
          JSON.stringify({ heard: said, words: result.words })
        );
        return false;
      }
      console.warn(
        `  ${line.id} did not match script (${Math.round(score * 100)}%). Heard: "${said}"`
      );
      return true;
    });
  }

  if (pending.length) {
    throw new Error(
      `The voice kept changing these lines: ${pending.map((l) => l.id).join(', ')}. Reword them in script.json and run again.`
    );
  }

  const voiced: Voiced[] = [];
  for (const line of lines) {
    const cached = clipFor(line).wav;
    const file = join('voice', `${line.id}.wav`);
    copyFileSync(cached, join(folder, file));
    const seconds =
      (statSync(cached).size - 44) / readFileSync(cached).readUInt32LE(28);

    const wordsPerSecond = line.text.split(/\s+/).length / seconds;
    if (wordsPerSecond < 1.8) {
      console.warn(
        `  warning: ${line.id} is slow (${wordsPerSecond.toFixed(1)} words/s). Listen to ${file}.`
      );
    }

    const { checked } = clipFor(line);
    const words: HeardWord[] | null = existsSync(checked)
      ? JSON.parse(readFileSync(checked, 'utf8')).words
      : null;
    voiced.push({ ...line, seconds, file, words });
  }

  return voiced;
}

const eventTime = (events: { t: number; type: string }[], type: string): number => {
  const found = events.find((e) => e.type === type);
  if (!found) throw new Error(`The timeline has no "${type}" event.`);
  return found.t;
};

export async function runProduce(
  config: ResolvedConfig,
  folderArg?: string
): Promise<string> {
  const folder = folderArg ? resolve(folderArg) : findNewestRecording(config.app.outDir, 'script.json');
  const scriptPath = join(folder, 'script.json');
  if (!existsSync(scriptPath)) {
    throw new Error(`No script.json found in ${folder}. Run "demo-video script" first.`);
  }

  const timelinePath = join(folder, 'timeline.json');
  if (!existsSync(timelinePath)) {
    throw new Error(`No timeline.json found in ${folder}.`);
  }

  const rawWebmPath = join(folder, 'raw.webm');
  if (!existsSync(rawWebmPath)) {
    throw new Error(`No raw.webm found in ${folder}.`);
  }

  const script: Script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  if (timeline.failure) {
    throw new Error(`That recording failed (${timeline.failure}). Record again first.`);
  }

  console.log(`Producing demo video for ${folder}...`);
  const voiced = await voiceLines(folder, script.lines, config);

  const sent = eventTime(timeline.events, 'sent');
  const answerDone = eventTime(timeline.events, 'answer_done');
  const end = eventTime(timeline.events, 'end');

  const layout = layoutTimeline({
    sent,
    answerDone,
    end,
    voiced,
  });

  // Cold open: the requested still of the target site covers the first seconds of the app,
  // which are the idle page after load. Nothing shifts: voice, captions and length stay put.
  const shotSeconds =
    config.app.siteShot > 0 && existsSync(join(folder, 'site.png'))
      ? Math.min(config.app.siteShot, sent)
      : 0;

  // Build ASS subtitles
  const assContent = buildAss(layout.placed, script.onScreen, layout.introOut, config.style);
  writeFileSync(join(folder, 'captions.ass'), assContent);

  // Segments are scaled to the output size before concat so every link matches (and so a
  // still, whose size has nothing to do with the recording, can join them).
  const upscale = `scale=${config.style.videoWidth}:${config.style.videoHeight}:flags=lanczos,setsar=1`;

  const videoFilter = [
    `[0:v]trim=start=${shotSeconds}:end=${sent},setpts=PTS-STARTPTS,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${round(layout.introHold)},${upscale}[intro]`,
    `[0:v]trim=start=${sent}:end=${answerDone},setpts=(PTS-STARTPTS)/${round(layout.workSpeed)},fps=30,setsar=1,${upscale}[work]`,
    [
      `[0:v]trim=start=${answerDone}:end=${end},setpts=(PTS-STARTPTS)/${round(layout.answerSpeed)},fps=30,setsar=1,`,
      `tpad=stop_mode=clone:stop_duration=${round(layout.answerHold)},${upscale}[answer]`,
    ].join(''),
  ];

  // With a site still, the inputs are: raw.webm, one per voice line, then the still.
  if (shotSeconds) {
    const shotInput = 1 + layout.placed.length;
    videoFilter.unshift(
      `[${shotInput}:v]${upscale},fps=30,trim=duration=${shotSeconds},setpts=PTS-STARTPTS[shot]`
    );
    videoFilter.push(
      '[shot][intro][work][answer]concat=n=4:v=1:a=0,unsharp=5:5:0.6,ass=captions.ass[v]'
    );
  } else {
    videoFilter.push('[intro][work][answer]concat=n=3:v=1:a=0,unsharp=5:5:0.6,ass=captions.ass[v]');
  }

  // Audio filter with 10ms fades
  const audioFilter = layout.placed.map(
    (line, i) =>
      `[${i + 1}:a]afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, line.seconds - 0.01).toFixed(3)}:d=0.01,` +
      `adelay=${Math.round(line.start * 1000)}:all=1[a${i}]`
  );
  audioFilter.push(
    `${layout.placed.map((_, i) => `[a${i}]`).join('')}amix=inputs=${layout.placed.length}:normalize=0:duration=longest,apad[a]`
  );

  // Lesson #8: ffmpeg's ass filter runs with recording folder as working directory so path needs no escaping on Windows.
  const inputs = ['-v', 'error', '-y', '-i', 'raw.webm'].concat(
    ...layout.placed.map((line) => ['-i', line.file])
  );
  if (shotSeconds) {
    inputs.push('-loop', '1', '-t', String(shotSeconds), '-i', 'site.png');
  }
  const args = inputs
    .concat([
      '-filter_complex',
      videoFilter.concat(audioFilter).join(';'),
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-t',
      String(round(layout.total)),
    ])
    .concat([
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      'video.mp4',
    ]);

  const result = spawnSync('ffmpeg', args, { cwd: folder, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || 'ffmpeg error'}`);
  }

  const hashtags = script.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ');
  writeFileSync(join(folder, 'caption.txt'), `${script.postCaption}\n\n${hashtags}\n`);

  writeFileSync(
    join(folder, 'produce.json'),
    JSON.stringify(
      {
        total: round(layout.total),
        siteShot: { seconds: round(shotSeconds) },
        intro: { seconds: round(layout.introOut), heldFor: round(layout.introHold) },
        working: { seconds: round(layout.workOut), speed: round(layout.workSpeed) },
        answer: {
          seconds: round(layout.answerOut),
          speed: round(layout.answerSpeed),
          heldFor: round(layout.answerHold),
        },
        lines: layout.placed.map((l) => ({
          id: l.id,
          start: round(l.start),
          seconds: round(l.seconds),
          text: l.text,
        })),
      },
      null,
      2
    )
  );

  console.log(
    `Intro ${round(layout.introOut)}s | working ${round(layout.workOut)}s at ${round(layout.workSpeed)}x | answer and outro ${round(layout.answerOut)}s at ${round(layout.answerSpeed)}x`
  );
  if (shotSeconds) {
    console.log(`Site shot ${round(shotSeconds)}s at the start`);
  }
  console.log(`Wrote ${join(folder, 'video.mp4')} (${round(layout.total)}s) and caption.txt`);

  return join(folder, 'video.mp4');
}
