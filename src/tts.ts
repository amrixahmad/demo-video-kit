import { writeFileSync } from 'fs';

export const DEFAULT_SAMPLE_RATE = 24000;

/**
 * Builds the director's notes prompt for Gemini TTS.
 * Lesson #2: A style prefix in front of the line was read aloud, and the TTS model rejects
 * system instructions. Keep the "director's notes, then transcript" prompt.
 */
export const ttsPrompt = (text: string, style: string) =>
  [
    "### DIRECTOR'S NOTES",
    `Style: ${style}`,
    'Speak the transcript exactly as written. Do not add, remove or change any words.',
    '',
    '### TRANSCRIPT',
    `"${text}"`,
  ].join('\n');

/**
 * Lesson #1: The TTS API returns a complete WAV file. Reading it as raw PCM put static at every join.
 * Extract PCM extracts the pure 16-bit mono audio, discarding RIFF headers and extra chunks like LIST.
 * If raw PCM without a RIFF header is received, it returns the buffer as is.
 */
export const extractPcm = (
  audio: Buffer,
  fallbackSampleRate: number = DEFAULT_SAMPLE_RATE
): { pcm: Buffer; sampleRate: number } => {
  if (
    audio.length < 12 ||
    audio.toString('ascii', 0, 4) !== 'RIFF' ||
    audio.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return { pcm: audio, sampleRate: fallbackSampleRate };
  }

  let sampleRate = fallbackSampleRate;
  let pcm: Buffer | null = null;
  let offset = 12;

  while (offset + 8 <= audio.length) {
    const id = audio.toString('ascii', offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ') {
      const channels = audio.readUInt16LE(body + 2);
      const bits = audio.readUInt16LE(body + 14);
      if (channels !== 1 || bits !== 16) {
        throw new Error(
          `TTS returned ${channels}-channel ${bits}-bit audio; expected mono 16-bit.`
        );
      }
      sampleRate = audio.readUInt32LE(body + 4);
    } else if (id === 'data') {
      pcm = audio.subarray(body, Math.min(audio.length, body + size));
    }
    // Skip chunk including padding byte if size is odd
    offset = body + size + (size % 2);
  }

  if (!pcm) {
    throw new Error('TTS returned a WAV file with no audio data.');
  }

  return { pcm, sampleRate };
};

export const wavHeader = (dataLength: number, sampleRate: number): Buffer => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
  header.writeUInt16LE(2, 32); // Block align (NumChannels * BitsPerSample/8)
  header.writeUInt16LE(16, 34); // Bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
};

export interface SpeakOptions {
  model: string;
  voice: string;
  style: string;
  apiKey: string;
}

export const speak = async (
  text: string,
  outPath: string,
  options: SpeakOptions
): Promise<{ seconds: number }> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: ttsPrompt(text, options.style) }] },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: options.voice },
            },
          },
        },
      }),
    }
  );

  const body = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(
      `TTS failed (${response.status}): ${JSON.stringify(body?.error ?? body).slice(0, 400)}`
    );
  }

  const data: string | undefined = body?.candidates?.[0]?.content?.parts?.find(
    (part: { inlineData?: unknown }) => part.inlineData
  )?.inlineData?.data;

  if (!data) {
    throw new Error('TTS returned no audio.');
  }

  const { pcm, sampleRate } = extractPcm(Buffer.from(data, 'base64'));
  writeFileSync(outPath, Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]));
  return { seconds: pcm.length / (sampleRate * 2) };
};
