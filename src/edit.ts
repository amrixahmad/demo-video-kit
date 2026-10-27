import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { ResolvedConfig } from './config';
import { remapEventTime, round } from './layout';
import { findNewestRecording } from './script';
import type { Timeline, TimelineEvent } from './types';

const DEFAULT_SPEED = 6;

const eventTime = (events: TimelineEvent[], type: string): number => {
  const found = events.find((e) => e.type === type);
  if (!found) throw new Error(`The timeline has no "${type}" event.`);
  return found.t;
};

export function runEdit(
  config: ResolvedConfig,
  folderArg?: string,
  speed: number = DEFAULT_SPEED
): string {
  if (!Number.isFinite(speed) || speed < 1) {
    throw new Error('--speed must be a number of at least 1.');
  }

  const folder = folderArg ? resolve(folderArg) : findNewestRecording(config.app.outDir, 'timeline.json');
  const timelinePath = join(folder, 'timeline.json');
  if (!existsSync(timelinePath)) {
    throw new Error(`No timeline.json found in ${folder}.`);
  }

  const rawPath = join(folder, 'raw.webm');
  if (!existsSync(rawPath)) {
    throw new Error(`No raw.webm found in ${folder}.`);
  }

  const timeline: Timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  if (timeline.failure) {
    throw new Error(`That recording failed (${timeline.failure}).`);
  }

  const start = eventTime(timeline.events, 'sent');
  const end = eventTime(timeline.events, 'answer_done');

  const filter = [
    `[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[intro]`,
    `[0:v]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed}[work]`,
    `[0:v]trim=start=${end},setpts=PTS-STARTPTS[answer]`,
    `[intro][work][answer]concat=n=3:v=1:a=0,fps=30,scale=${config.style.videoWidth}:${config.style.videoHeight}:flags=lanczos,unsharp=5:5:0.6[out]`,
  ].join(';');

  const output = join(folder, 'edited.mp4');
  const result = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      rawPath,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      output,
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || 'ffmpeg error'}`);
  }

  const saved = (end - start) * (1 - 1 / speed);
  const edited = {
    ...timeline,
    edit: { speed, workingStretch: { from: start, to: end }, secondsSaved: round(saved) },
    events: timeline.events.map((e) => ({
      ...e,
      t: round(remapEventTime(e.t, start, end, speed)),
    })),
  };

  writeFileSync(join(folder, 'timeline.edited.json'), JSON.stringify(edited, null, 2));

  console.log(
    `Working stretch ${round(start)}s to ${round(end)}s played at ${speed}x, ${round(saved)}s shorter.`
  );
  console.log(`Wrote ${output}`);

  return output;
}
