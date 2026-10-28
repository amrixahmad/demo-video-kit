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
        siteShot: 0,
      },
      style: {
        brandAss: '&H00E5464F',
        captionBoxAss: '&H00111111',
        hookBoxAss: '&H00FFFFFF',
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

  it('renders video with default inverted captions (no brandAss) and verifies frame readability', async () => {
    // Config without brandAss (default style)
    const config: ResolvedConfig = {
      app: {
        baseUrl: 'http://localhost:3000',
        outDir,
        authDir: join(testDir, '.auth'),
        hideDevCss: '',
        siteShot: 0,
      },
      style: {
        captionBoxAss: '&H00111111',
        hookBoxAss: '&H00FFFFFF',
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

    // Verify captions.ass contains inverted highlight
    const assContent = require('fs').readFileSync(join(recordFolder, 'captions.ass'), 'utf8');
    expect(assContent).toContain('{\\3c&HFFFFFF&\\1c&H111111&}');
    expect(assContent).toContain('{\\3c&H00111111&\\1c&HFFFFFF&}');

    // Extract a frame mid-caption (e.g. at 0.3s when intro line first word is highlighted)
    const framePath = join(recordFolder, 'frame_mid_caption.png');
    const rawFramePath = join(recordFolder, 'frame_mid_caption.raw');

    const extract = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        '0.3',
        '-i',
        videoPath,
        '-vframes',
        '1',
        framePath,
      ],
      { encoding: 'utf8' }
    );
    expect(extract.status).toBe(0);
    expect(existsSync(framePath)).toBe(true);

    // Extract raw RGB pixels to verify both white box and dark text are rendered
    const extractRaw = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        '0.3',
        '-i',
        videoPath,
        '-vframes',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        rawFramePath,
      ],
      { encoding: 'utf8' }
    );
    expect(extractRaw.status).toBe(0);
    expect(existsSync(rawFramePath)).toBe(true);

    const rawBuffer = require('fs').readFileSync(rawFramePath);
    let whitePixels = 0;
    let darkPixels = 0;

    for (let i = 0; i < rawBuffer.length; i += 3) {
      const r = rawBuffer[i];
      const g = rawBuffer[i + 1];
      const b = rawBuffer[i + 2];

      // White box pixels
      if (r > 220 && g > 220 && b > 220) {
        whitePixels++;
      }
      // Dark text pixels (within the white box and caption area)
      if (r < 50 && g < 50 && b < 50) {
        darkPixels++;
      }
    }

    // Both the white background box and dark text pixels must be rendered on the frame
    expect(whitePixels).toBeGreaterThan(100);
    expect(darkPixels).toBeGreaterThan(100);
  });

  it('opens on the captured site still without changing the length', async () => {
    const config: ResolvedConfig = {
      app: {
        baseUrl: 'http://localhost:3000',
        outDir,
        authDir: join(testDir, '.auth'),
        hideDevCss: '',
        siteShot: 0.5,
      },
      style: {
        brandAss: '&H00E5464F',
        captionBoxAss: '&H00111111',
        hookBoxAss: '&H00FFFFFF',
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

    // Baseline without site.png: no cold open, and that run is the length to match.
    const sitePng = join(recordFolder, 'site.png');
    rmSync(sitePng, { force: true });
    await runProduce(config, recordFolder);
    const withoutShot = JSON.parse(
      require('fs').readFileSync(join(recordFolder, 'produce.json'), 'utf8')
    ).total;

    const made = spawnSync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'color=c=yellow:s=1080x1920:d=1', '-frames:v', '1', sitePng],
      { encoding: 'utf8' }
    );
    expect(made.status).toBe(0);

    const videoPath = await runProduce(config, recordFolder);
    const produced = JSON.parse(
      require('fs').readFileSync(join(recordFolder, 'produce.json'), 'utf8')
    );

    expect(produced.siteShot.seconds).toBe(0.5);
    expect(produced.total).toBeCloseTo(withoutShot, 1);

    // The first frame is the still, not the app: sample the middle pixel, which the
    // top-aligned hook sticker does not cover.
    const rawPath = join(testDir, 'site-shot-frame.rgb');
    const grab = spawnSync(
      'ffmpeg',
      ['-y', '-ss', '0.1', '-i', videoPath, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawPath],
      { encoding: 'utf8' }
    );
    expect(grab.status).toBe(0);

    const raw = require('fs').readFileSync(rawPath);
    const middle = (960 * 1080 + 540) * 3;
    expect(raw[middle]).toBeGreaterThan(150); // red
    expect(raw[middle + 1]).toBeGreaterThan(150); // green
    expect(raw[middle + 2]).toBeLessThan(120); // blue
  });
});
