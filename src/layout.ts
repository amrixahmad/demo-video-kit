import type { ScriptLine, Segment } from './types';

export const LEAD = 0.2; // silence before the first line of a segment
export const END_TAIL = 1.0; // the last frame stays up this long after the outro
export const GAP = 0.25; // between "what's wrong" and "what should happen"
export const PAIR_GAP = 0.55; // between findings, and between other lines
export const MAX_SPEED = 12;

export interface HeardWord {
  word: string;
  start: number;
  end: number;
}

export interface Voiced extends ScriptLine {
  seconds: number;
  file: string;
  words: HeardWord[] | null;
}

export interface Placed extends Voiced {
  start: number;
}

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export const NUMBER_WORDS = 'zero one two three four five six seven eight nine ten eleven twelve'.split(' ');

/**
 * Letters and digits only, small numbers as words, casual contractions expanded.
 * Lesson #3: Letters only, small numbers as words, "gonna" as "going to".
 */
export const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\bgonna\b/g, 'going to')
    .replace(/\bwanna\b/g, 'want to')
    .replace(/\bgotta\b/g, 'got to')
    .replace(/\b\d{1,2}\b/g, (n) => NUMBER_WORDS[Number(n)] || n)
    .replace(/[^a-z0-9]/g, '');

/**
 * Levenshtein-based similarity metric (0 to 1).
 */
export const similarity = (a: string, b: string): number => {
  if (!a.length || !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const round = (t: number): number => Math.round(t * 100) / 100;

/**
 * Places a segment's lines one after another from `from`; returns them and when the last one ends.
 */
export const placeSegment = (
  lines: Voiced[],
  from: number
): { placed: Placed[]; end: number } => {
  const placed: Placed[] = [];
  let t = from + LEAD;
  lines.forEach((line, i) => {
    if (i > 0) t += line.id.endsWith('-should') ? GAP : PAIR_GAP;
    placed.push({ ...line, start: t });
    t += line.seconds;
  });
  return { placed, end: t };
};

/**
 * Aligns script words with Whisper heard words (or letter-count distribution if no transcript).
 */
export const timeWords = (line: Placed): TimedWord[] => {
  const shown = line.text.split(/\s+/).filter(Boolean);
  const sizes = shown.map((w) => Math.max(1, normalise(w).length));
  const total = sizes.reduce((a, b) => a + b, 0);
  const heard = (line.words || []).filter((w) => normalise(w.word).length > 0);

  let at = 0;
  const starts = sizes.map((size) => {
    const fraction = at / total;
    at += size;
    if (!heard.length) return fraction * line.seconds;
    const heardSizes = heard.map((w) => normalise(w.word).length);
    const heardTotal = heardSizes.reduce((a, b) => a + b, 0);
    let target = fraction * heardTotal;
    for (let i = 0; i < heard.length; i += 1) {
      if (target <= heardSizes[i] || i === heard.length - 1) {
        const within = Math.min(1, target / heardSizes[i]);
        return heard[i].start + within * (heard[i].end - heard[i].start);
      }
      target -= heardSizes[i];
    }
    return 0;
  });

  const lastEnd = heard.length ? heard[heard.length - 1].end : line.seconds;
  return shown.map((text, i) => ({
    text,
    start: line.start + starts[i],
    end:
      line.start +
      (i + 1 < shown.length ? starts[i + 1] : Math.max(lastEnd, starts[i] + 0.2)),
  }));
};

/**
 * Groups a line's words into short chunks (max 3 words, ~16 letters, or punctuation break).
 */
export const chunkWords = (words: TimedWord[]): TimedWord[][] => {
  const chunks: TimedWord[][] = [];
  let current: TimedWord[] = [];
  for (const word of words) {
    current.push(word);
    const { length } = current.map((w) => w.text).join(' ');
    if (current.length >= 3 || length >= 16 || /[.,!?;:]$/.test(word.text)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
};

export interface TimelineLayoutInput {
  sent: number;
  answerDone: number;
  end: number;
  voiced: Voiced[];
}

export interface TimelineLayoutResult {
  total: number;
  introOut: number;
  introHold: number;
  workOut: number;
  workSpeed: number;
  answerStart: number;
  answerOut: number;
  answerSpeed: number;
  answerHold: number;
  placed: Placed[];
}

/**
 * Computes timeline layout and speed-fit parameters for produce.
 */
export const layoutTimeline = (input: TimelineLayoutInput): TimelineLayoutResult => {
  const { sent, answerDone, end, voiced } = input;
  const inSegment = (segment: Segment) => voiced.filter((line) => line.segment === segment);

  const intro = placeSegment(inSegment('intro'), 0);
  const introOut = Math.max(sent, intro.end + 0.3);
  const introHold = introOut - sent;

  const workLines = inSegment('working');
  const workRaw = answerDone - sent;
  const workNeed = workLines.reduce((sum, l) => sum + l.seconds, 0) + LEAD + 0.4;
  const workSpeed = clamp(workRaw / workNeed, 1, MAX_SPEED);
  const workOut = workRaw / workSpeed;
  const work = placeSegment(workLines, introOut - LEAD + 0.1);

  const answerStart = introOut + workOut;
  const answer = placeSegment([...inSegment('answer'), ...inSegment('outro')], answerStart);
  const answerNeed = answer.end - answerStart + END_TAIL;
  const answerRaw = end - answerDone;
  const answerSpeed = clamp(answerRaw / answerNeed, 0.5, 2);
  const answerHold = Math.max(0, answerNeed - answerRaw / answerSpeed);
  const answerOut = answerRaw / answerSpeed + answerHold;
  const total = answerStart + answerOut;

  const placed = [...intro.placed, ...work.placed, ...answer.placed];

  return {
    total,
    introOut,
    introHold,
    workOut,
    workSpeed,
    answerStart,
    answerOut,
    answerSpeed,
    answerHold,
    placed,
  };
};

/**
 * Remaps an event time for video speed-up in demo:edit.
 */
export const remapEventTime = (
  t: number,
  start: number,
  end: number,
  speed: number
): number => {
  const saved = (end - start) * (1 - 1 / speed);
  if (t <= start) return t;
  if (t <= end) return start + (t - start) / speed;
  return t - saved;
};
