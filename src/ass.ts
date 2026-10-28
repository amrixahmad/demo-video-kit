import { chunkWords, timeWords, type Placed } from './layout';
import type { ResolvedStyleConfig, StyleConfig } from './types';

export const assTime = (t: number): string => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

export const assText = (text: string): string => text.replace(/[{}\\]/g, '').trim();

/**
 * Checks if a color is white or near-white (channels close to 255).
 * Near-white colors cause caption highlights to be unreadable white-on-white.
 */
export function isNearWhite(color?: string): boolean {
  if (!color) return false;
  const clean = color.trim().toLowerCase();
  if (clean === 'white') return true;

  // Handle hex formats: &H[AA]BBGGRR[&], #[AA]RRGGBB, or RRGGBB / BBGGRR
  const hex = clean.replace(/^[&#h]+|&$/g, '');
  const isWebHex = color.trim().startsWith('#');

  let r = 0;
  let g = 0;
  let b = 0;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    if (isWebHex) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      // ASS format &HBBGGRR
      b = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      r = parseInt(hex.slice(4, 6), 16);
    }
  } else if (hex.length === 8) {
    if (isWebHex) {
      // #RRGGBBAA
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      // ASS format &HAABBGGRR
      b = parseInt(hex.slice(2, 4), 16);
      g = parseInt(hex.slice(4, 6), 16);
      r = parseInt(hex.slice(6, 8), 16);
    }
  } else {
    return false;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;

  return r >= 220 && g >= 220 && b >= 220;
}

/**
 * Builds an Advanced SubStation Alpha (.ass) subtitle file.
 * libass draws BorderStyle 3 as a box behind each run of text.
 * - When style.brandAss is set: recolours the box behind the spoken word (\3c<brandAss>&).
 * - When style.brandAss is not set (default): inverts the spoken word with a white box
 *   and dark text (\3c&HFFFFFF&\1c&H111111&), then restores both (\3c<captionBox>&\1c&HFFFFFF&).
 */
export const buildAss = (
  lines: Placed[],
  hookText: string,
  introEnd: number,
  style: ResolvedStyleConfig | StyleConfig
): string => {
  const videoWidth = style.videoWidth ?? 1080;
  const videoHeight = style.videoHeight ?? 1920;
  const hookFont = style.hookFont || 'Arial';
  const hookFontSize = style.hookFontSize ?? 76;
  const captionFont = style.captionFont || 'Arial';
  const captionFontSize = style.captionFontSize ?? 70;
  const captionBoxAss = style.captionBoxAss || '&H00111111';
  const hookBoxAss = style.hookBoxAss || '&H00FFFFFF';

  let useBrand = false;
  if (style.brandAss) {
    if (isNearWhite(style.brandAss)) {
      console.warn(
        `[demo-video] Warning: style.brandAss (${style.brandAss}) is too close to white caption text and will be unreadable. Falling back to inverted highlight.`
      );
    } else {
      useBrand = true;
    }
  }

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${videoWidth}`,
    `PlayResY: ${videoHeight}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    [
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic,',
      'Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR,',
      'MarginV, Encoding',
    ].join(' '),
    `Style: Hook,${hookFont},${hookFontSize},&H00111111,&H00111111,${hookBoxAss},${hookBoxAss},-1,0,0,0,100,100,0,0,3,24,0,8,140,140,330,1`,
    `Style: Caption,${captionFont},${captionFontSize},&H00FFFFFF,&H00FFFFFF,${captionBoxAss},${captionBoxAss},-1,0,0,0,100,100,0,0,3,18,0,2,80,80,520,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const dialogue = (start: number, end: number, dlgStyle: string, text: string) =>
    `Dialogue: 0,${assTime(start)},${assTime(end)},${dlgStyle},,0,0,0,,${text}`;

  const events = [dialogue(0, introEnd, 'Hook', `{\\frz2}${assText(hookText)}`)];

  for (const line of lines) {
    for (const chunk of chunkWords(timeWords(line))) {
      chunk.forEach((word, i) => {
        const text = chunk
          .map((w, j) => {
            if (j !== i) {
              return assText(w.text);
            }
            if (useBrand) {
              return `{\\3c${style.brandAss}&}${assText(w.text)}{\\3c${captionBoxAss}&}`;
            }
            return `{\\3c&HFFFFFF&\\1c&H111111&}${assText(w.text)}{\\3c${captionBoxAss}&\\1c&HFFFFFF&}`;
          })
          .join(' ');
        events.push(dialogue(word.start, word.end, 'Caption', text));
      });
    }
  }

  return `${header.concat(events).join('\n')}\n`;
};
