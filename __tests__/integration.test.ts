import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { runProduce } from '../src/produce';
import { ttsPrompt, wavHeader } from '../src/tts';
import type { ResolvedConfig } from '../src/config';

describe('Integration test (offline render)', () => {
  const testDir = join(__dirname, 'tmp-integration');
  const outDir = join(testDir, 'out');
  const recordFolder = join(outDir, 'test-recording');
  const voiceCache = join(outDir, '.voice-cache');

  beforeAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(recordFolder, { recursive: true });
    mkdirSync(voiceCache, { recursive: true });

    // 1. Generate a short 6-second raw.webm using ffmpeg
    const ff = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=540x960:d=6',
        '-c:v',
        'libvpx',
        '-b:v',
        '500k',
        join(recordFolder, 'raw.webm'),
      ],
      { encoding: 'utf8' }
    );
    expect(ff.status).toBe(0);

    // 2. Write timeline.json
    writeFileSync(
      join(recordFolder, 'timeline.json'),
      JSON.stringify(
        {
          site: 'test.example.com',
          slug: 'test-example-com',
          viewport: { width: 540, height: 960 },
          videoSize: { width: 1080, height: 1920 },
          duration: 6.0,
          events: [
            { t: 0.1, type: 'page_ready' },
            { t: 1.0, type: 'sent' },
            { t: 3.5, type: 'answer_done' },
            { t: 6.0, type: 'end' },
          ],
        },
        null,
        2
      )
    );

    // 3. Write script.json
    const script = {
      site: 'test.example.com',
      onScreen: 'Test Sticker',
      lines: [
        { id: 'intro', segment: 'intro', text: 'Hello intro clip.' },
        { id: 'work', segment: 'working', text: 'Working on something.' },
        { id: 'ans', segment: 'answer', text: 'Here is the result.' },
        { id: 'outro', segment: 'outro', text: 'Goodbye outro clip.' },
      ],
      postCaption: 'Test Caption',
      hashtags: ['test', 'integration'],
    };
    writeFileSync(join(recordFolder, 'script.json'), JSON.stringify(script, null, 2));

    // 4. Populate .voice-cache with fixture WAVs and .words.json so no TTS/Whisper is needed
    const model = 'gemini-3.8-flash-tts';
    const voice = 'Ludo';
    const style = 'Test style';

    for (const line of script.lines) {
      const key = createHash('sha1')
        .update([model, voice, ttsPrompt(line.text, style)].join('|'))
        .digest('hex');

      // 1-second 24kHz mono sine wave / audio tone
      const sampleRate = 24000;
      const numSamples = sampleRate * 1; // 1 second
      const pcm = Buffer.alloc(numSamples * 2);
      for (let i = 0; i < numSamples; i++) {
        const val = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 10000;
        pcm.writeInt16LE(Math.round(val), i * 2);
      }
      const header = wavHeader(pcm.length, sampleRate);
      writeFileSync(join(voiceCache, `${key}.wav`), Buffer.concat([header, pcm]));
      writeFileSync(
        join(voiceCache, `${key}.words.json`),
        JSON.stringify({
          heard: line.text,
          words: line.text.split(' ').map((w, idx) => ({
            word: w,
            start: idx * 0.2,
            end: (idx + 1) * 0.2,
          })),
        })
      );
    }
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('renders video.mp4 matching layout duration without network calls', async () => {
    const config: ResolvedConfig = {
      app: {
        baseUrl: 'http://localhost:3000',
        outDir,
        authDir: join(testDir, '.auth'),
        hideDevCss: '',
      },
      style: {
        brandAss: '&H00E5464F',
        captionBoxAss: '&H00111111',
        hookFont: 'Arial',
        hookFontSize: 76,
        captionFont: 'Arial',
        captionFontSize: 70,
        viewportWidth: 540,
        viewportHeight: 960,
        videoWidth: 1080,
        videoHeight: 1920,
      },
      voice: {
        model: 'gemini-3.8-flash-tts',
        voice: 'Ludo',
        style: 'Test style',
        apiKey: 'fake-key',
      },
      recorder: {} as any,
      script: {} as any,
    };

    const videoPath = await runProduce(config, recordFolder);
    expect(existsSync(videoPath)).toBe(true);

    const produceJson = JSON.parse(
      require('fs').readFileSync(join(recordFolder, 'produce.json'), 'utf8')
    );
    expect(produceJson.total).toBeGreaterThan(0);
    expect(existsSync(join(recordFolder, 'captions.ass'))).toBe(true);
    expect(existsSync(join(recordFolder, 'caption.txt'))).toBe(true);

    // Inspect video duration via ffprobe
    const probe = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ],
      { encoding: 'utf8' }
    );
    expect(probe.status).toBe(0);
    const actualDuration = parseFloat(probe.stdout.trim());
    expect(Math.abs(actualDuration - produceJson.total)).toBeLessThanOrEqual(0.5);
  });
});
