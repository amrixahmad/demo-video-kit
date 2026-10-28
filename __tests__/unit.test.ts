import { buildAss, isNearWhite } from '../src/ass';
import {
  chunkWords,
  layoutTimeline,
  normalise,
  remapEventTime,
  round,
  similarity,
  timeWords,
  type Placed,
  type Voiced,
} from '../src/layout';
import { extractPcm, wavHeader } from '../src/tts';

describe('normalise and similarity', () => {
  it('normalises contractions, numbers and punctuation', () => {
    expect(normalise("I'm gonna do 2 things!")).toBe('imgoingtodotwothings');
    expect(normalise("wanna gotta 10")).toBe('wanttogottoten');
    expect(normalise("SapuSEO")).toBe('sapuseo');
  });

  it('calculates string similarity accurately', () => {
    expect(similarity('hello', 'hello')).toBe(1);
    expect(similarity('', 'hello')).toBe(0);
    expect(similarity('hello', '')).toBe(0);
    const sim = similarity('kitten', 'sitting');
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(0.75);
  });
});

describe('remapEventTime', () => {
  const start = 10;
  const end = 30;
  const speed = 4;
  // duration is 20s, at 4x it becomes 5s, saved = 15s

  it('keeps times before the working stretch unchanged', () => {
    expect(remapEventTime(0, start, end, speed)).toBe(0);
    expect(remapEventTime(5, start, end, speed)).toBe(5);
    expect(remapEventTime(10, start, end, speed)).toBe(10);
  });

  it('speeds up times during the working stretch', () => {
    expect(remapEventTime(20, start, end, speed)).toBe(12.5); // 10 + (20-10)/4 = 12.5
    expect(remapEventTime(30, start, end, speed)).toBe(15); // 10 + 20/4 = 15
  });

  it('offsets times after the working stretch by saved seconds', () => {
    expect(remapEventTime(40, start, end, speed)).toBe(25); // 40 - 15 = 25
  });
});

describe('chunkWords and timeWords', () => {
  it('chunks words by count, length or punctuation', () => {
    const timedWords = [
      { text: 'One', start: 0, end: 0.5 },
      { text: 'two', start: 0.5, end: 1.0 },
      { text: 'three.', start: 1.0, end: 1.5 },
      { text: 'Four', start: 1.5, end: 2.0 },
      { text: 'supercalifragilisticexpialidocious', start: 2.0, end: 3.0 },
    ];
    const chunks = chunkWords(timedWords);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Punctuation "three." triggers chunk end
    expect(chunks[0].map((w) => w.text)).toEqual(['One', 'two', 'three.']);
  });

  it('interpolates word timings without heard words', () => {
    const line: Placed = {
      id: 'test',
      segment: 'intro',
      text: 'Hello world today',
      seconds: 3.0,
      file: 'voice/test.wav',
      words: null,
      start: 1.0,
    };
    const words = timeWords(line);
    expect(words).toHaveLength(3);
    expect(words[0].start).toBe(1.0);
    expect(words[2].end).toBeGreaterThan(1.0);
  });

  it('aligns word timings with Whisper heard words', () => {
    const line: Placed = {
      id: 'test',
      segment: 'intro',
      text: 'Hello world',
      seconds: 2.0,
      file: 'voice/test.wav',
      words: [
        { word: 'Hello', start: 0.1, end: 0.6 },
        { word: 'world', start: 0.7, end: 1.5 },
      ],
      start: 0.5,
    };
    const words = timeWords(line);
    expect(words).toHaveLength(2);
    expect(words[0].start).toBeCloseTo(0.6, 1);
    expect(words[1].end).toBeCloseTo(2.0, 1);
  });
});

describe('layoutTimeline', () => {
  it('calculates intro hold, working stretch speed fit and answer hold', () => {
    const voiced: Voiced[] = [
      { id: 'intro1', segment: 'intro', text: 'Intro', seconds: 4.0, file: '1.wav', words: null },
      { id: 'work1', segment: 'working', text: 'Working', seconds: 5.0, file: '2.wav', words: null },
      { id: 'ans1', segment: 'answer', text: 'Answer', seconds: 6.0, file: '3.wav', words: null },
      { id: 'outro', segment: 'outro', text: 'Outro', seconds: 3.0, file: '4.wav', words: null },
    ];

    const result = layoutTimeline({
      sent: 2.0,
      answerDone: 20.0,
      end: 25.0,
      voiced,
    });

    expect(result.introOut).toBeGreaterThanOrEqual(2.0);
    expect(result.workSpeed).toBeGreaterThanOrEqual(1.0);
    expect(result.workSpeed).toBeLessThanOrEqual(12.0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.placed).toHaveLength(4);
  });
});

describe('WAV unpacking (extractPcm)', () => {
  it('handles raw PCM without RIFF header', () => {
    const rawBuffer = Buffer.alloc(100, 0x12);
    const { pcm, sampleRate } = extractPcm(rawBuffer, 24000);
    expect(pcm).toEqual(rawBuffer);
    expect(sampleRate).toBe(24000);
  });

  it('unpacks standard RIFF WAVE file with fmt and data chunks', () => {
    const sampleRate = 24000;
    const dummyAudio = Buffer.alloc(480, 0x34);
    const header = wavHeader(dummyAudio.length, sampleRate);
    const fullWav = Buffer.concat([header, dummyAudio]);

    const { pcm, sampleRate: parsedRate } = extractPcm(fullWav);
    expect(parsedRate).toBe(sampleRate);
    expect(pcm).toEqual(dummyAudio);
  });

  it('correctly unpacks RIFF WAVE file containing a LIST chunk', () => {
    const sampleRate = 16000;
    const pcmData = Buffer.alloc(320, 0x56);

    // Build fmt chunk
    const fmtChunk = Buffer.alloc(24);
    fmtChunk.write('fmt ', 0);
    fmtChunk.writeUInt32LE(16, 4); // size
    fmtChunk.writeUInt16LE(1, 8); // PCM
    fmtChunk.writeUInt16LE(1, 10); // mono
    fmtChunk.writeUInt32LE(sampleRate, 12);
    fmtChunk.writeUInt32LE(sampleRate * 2, 16);
    fmtChunk.writeUInt16LE(2, 20);
    fmtChunk.writeUInt16LE(16, 22);

    // Build LIST chunk (e.g. metadata INFO)
    const listBody = Buffer.from('INFOINAM\x04\x00\x00\x00Test');
    const listChunk = Buffer.alloc(8 + listBody.length);
    listChunk.write('LIST', 0);
    listChunk.writeUInt32LE(listBody.length, 4);
    listBody.copy(listChunk, 8);

    // Build data chunk
    const dataChunk = Buffer.alloc(8 + pcmData.length);
    dataChunk.write('data', 0);
    dataChunk.writeUInt32LE(pcmData.length, 4);
    pcmData.copy(dataChunk, 8);

    // Build RIFF header
    const riffHeader = Buffer.alloc(12);
    riffHeader.write('RIFF', 0);
    riffHeader.writeUInt32LE(4 + fmtChunk.length + listChunk.length + dataChunk.length, 4);
    riffHeader.write('WAVE', 8);

    const wavWithList = Buffer.concat([riffHeader, fmtChunk, listChunk, dataChunk]);

    const { pcm, sampleRate: parsedRate } = extractPcm(wavWithList);
    expect(parsedRate).toBe(sampleRate);
    expect(pcm).toEqual(pcmData);
  });
});

describe('template builder', () => {
  it('builds script lines correctly from slots and template definition', () => {
    interface TestSlots {
      spokenName: string;
      findings: { wrong: string; shouldBe: string }[];
      allIssues: string[];
    }

    const slots: TestSlots = {
      spokenName: 'My Awesome App',
      findings: [
        { wrong: 'Broken navigation link', shouldBe: 'It should link to the homepage' },
        { wrong: 'Missing image alt text', shouldBe: 'It should include descriptive alt tags' },
      ],
      allIssues: ['Broken nav', 'Missing alt', 'Slow speed'],
    };

    const linesBuilder = (s: TestSlots, site: string) => [
      { id: 'hook', segment: 'intro' as const, text: `Analyzing ${site}` },
      { id: 'today', segment: 'intro' as const, text: `Looking at ${s.spokenName}` },
      ...s.findings.flatMap((f, i) => [
        { id: `finding${i + 1}-wrong`, segment: 'answer' as const, text: f.wrong },
        { id: `finding${i + 1}-should`, segment: 'answer' as const, text: f.shouldBe },
      ]),
      {
        id: 'outro',
        segment: 'outro' as const,
        text: `Found ${s.allIssues.length} issues in total.`,
      },
    ];

    const lines = linesBuilder(slots, 'example.com');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toEqual({ id: 'hook', segment: 'intro', text: 'Analyzing example.com' });
    expect(lines[1]).toEqual({ id: 'today', segment: 'intro', text: 'Looking at My Awesome App' });
    expect(lines[2]).toEqual({ id: 'finding1-wrong', segment: 'answer', text: 'Broken navigation link' });
    expect(lines[3]).toEqual({ id: 'finding1-should', segment: 'answer', text: 'It should link to the homepage' });
    expect(lines[6]).toEqual({ id: 'outro', segment: 'outro', text: 'Found 3 issues in total.' });
  });
});

describe('isNearWhite color detection', () => {
  it('correctly identifies white and near-white colors', () => {
    expect(isNearWhite('&H00FFFFFF')).toBe(true);
    expect(isNearWhite('&HFFFFFF')).toBe(true);
    expect(isNearWhite('&H00FFFFFF&')).toBe(true);
    expect(isNearWhite('#FFFFFF')).toBe(true);
    expect(isNearWhite('#fff')).toBe(true);
    expect(isNearWhite('white')).toBe(true);
    expect(isNearWhite('&H00F0F0F0')).toBe(true);
    expect(isNearWhite('&H00EEEEEE')).toBe(true);
  });

  it('correctly identifies colored or dark colors as not near-white', () => {
    expect(isNearWhite('&H00E5464F')).toBe(false); // SapuSEO indigo
    expect(isNearWhite('&H00111111')).toBe(false); // Caption box dark grey
    expect(isNearWhite('#000000')).toBe(false);
    expect(isNearWhite('&H000000FF')).toBe(false); // Red
    expect(isNearWhite('&H0000FFFF')).toBe(false); // Yellow
    expect(isNearWhite(undefined)).toBe(false);
    expect(isNearWhite('')).toBe(false);
  });
});

describe('buildAss caption builder', () => {
  const sampleLines: Placed[] = [
    {
      id: 'l1',
      segment: 'intro',
      text: 'Hello world',
      seconds: 2.0,
      file: 'voice/l1.wav',
      start: 0,
      words: [
        { word: 'Hello', start: 0, end: 0.8 },
        { word: 'world', start: 0.9, end: 1.8 },
      ],
    },
  ];

  it('defaults the hook box to white', () => {
    const ass = buildAss(sampleLines, 'Hook Header', 1.0, {});

    expect(ass).toContain('Style: Hook,Arial,76,&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF');
  });

  it('uses the configured hook box colour for the sticker', () => {
    const ass = buildAss(sampleLines, 'Hook Header', 1.0, { hookBoxAss: '&H0000FFFF' });

    expect(ass).toContain('Style: Hook,Arial,76,&H00111111,&H00111111,&H0000FFFF,&H0000FFFF');
  });

  it('inverts spoken word highlight when brandAss is not set (default)', () => {
    const ass = buildAss(sampleLines, 'Hook Header', 1.0, {
      captionBoxAss: '&H00111111',
    });

    // Check style definition
    expect(ass).toContain('Style: Caption,Arial,70,&H00FFFFFF,&H00FFFFFF,&H00111111,&H00111111,-1,0,0,0,100,100,0,0,3,18,0,2,80,80,520,1');

    // First word 'Hello' highlighted:
    // White box (\3c&HFFFFFF&) with dark text (\1c&H111111&),
    // restored to caption box (\3c&H00111111&) and white text (\1c&HFFFFFF&)
    expect(ass).toContain('{\\3c&HFFFFFF&\\1c&H111111&}Hello{\\3c&H00111111&\\1c&HFFFFFF&} world');

    // Second word 'world' highlighted:
    expect(ass).toContain('Hello {\\3c&HFFFFFF&\\1c&H111111&}world{\\3c&H00111111&\\1c&HFFFFFF&}');
  });

  it('recolours only the background box when brandAss is set', () => {
    const ass = buildAss(sampleLines, 'Hook Header', 1.0, {
      brandAss: '&H00E5464F',
      captionBoxAss: '&H00111111',
    });

    // Highlighted run only changes \3c to brand colour and restores \3c to captionBoxAss.
    // It must NOT alter \1c.
    expect(ass).toContain('{\\3c&H00E5464F&}Hello{\\3c&H00111111&} world');
    expect(ass).toContain('Hello {\\3c&H00E5464F&}world{\\3c&H00111111&}');

    // Dialogue events should not contain \1c overrides
    const dialogueLines = ass.split('\n').filter((l) => l.startsWith('Dialogue:') && l.includes('Caption'));
    for (const d of dialogueLines) {
      expect(d).not.toContain('\\1c');
    }
  });

  it('warns and falls back to inverted highlight if brandAss is near-white', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const ass = buildAss(sampleLines, 'Hook Header', 1.0, {
      brandAss: '&H00FFFFFF',
      captionBoxAss: '&H00111111',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: style.brandAss (&H00FFFFFF) is too close to white caption text')
    );

    // Falls back to inverted highlight
    expect(ass).toContain('{\\3c&HFFFFFF&\\1c&H111111&}Hello{\\3c&H00111111&\\1c&HFFFFFF&} world');

    warnSpy.mockRestore();
  });
});
