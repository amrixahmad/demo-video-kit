import { chunkWords, timeWords, type Placed } from './layout';
import type { StyleConfig } from './types';

export const assTime = (t: number): string => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

export const assText = (text: string): string => text.replace(/[{}\\]/g, '').trim();

/**
 * Builds an Advanced SubStation Alpha (.ass) subtitle file.
 * Lesson #7: libass draws BorderStyle 3 as a box behind each run of text, so changing
 * \3c mid-line recolours the box behind the spoken word. That is how the caption highlight works.
 */
export const buildAss = (
  lines: Placed[],
  hookText: string,
  introEnd: number,
  style: Required<StyleConfig>
): string => {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${style.videoWidth}`,
    `PlayResY: ${style.videoHeight}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    [
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic,',
      'Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR,',
      'MarginV, Encoding',
    ].join(' '),
    `Style: Hook,${style.hookFont},${style.hookFontSize},&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,24,0,8,140,140,330,1`,
    `Style: Caption,${style.captionFont},${style.captionFontSize},&H00FFFFFF,&H00FFFFFF,${style.captionBoxAss},${style.captionBoxAss},-1,0,0,0,100,100,0,0,3,18,0,2,80,80,520,1`,
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
          .map((w, j) =>
            j === i
              ? `{\\3c${style.brandAss}&}${assText(w.text)}{\\3c${style.captionBoxAss}&}`
              : assText(w.text)
          )
          .join(' ');
        events.push(dialogue(word.start, word.end, 'Caption', text));
      });
    }
  }

  return `${header.concat(events).join('\n')}\n`;
};
