import { generateText, Output } from 'ai';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { ResolvedConfig } from './config';
import type { Script, ScriptLine } from './types';
import { findNewestRecording } from './utils';

export { findNewestRecording };

export async function runScript(
  config: ResolvedConfig,
  folderArg?: string
): Promise<string> {
  const folder = folderArg ? resolve(folderArg) : findNewestRecording(config.app.outDir, 'answer.txt');
  const answerPath = join(folder, 'answer.txt');
  if (!existsSync(answerPath)) {
    throw new Error(`No answer.txt found in ${folder}.`);
  }

  const timelinePath = join(folder, 'timeline.json');
  if (!existsSync(timelinePath)) {
    throw new Error(`No timeline.json found in ${folder}.`);
  }

  const { site } = JSON.parse(readFileSync(timelinePath, 'utf8'));
  const answer = readFileSync(answerPath, 'utf8');

  console.log(`Generating script for ${site}...`);
  const prompt = config.script.prompt(site, answer);

  const result: any = await (generateText as any)({
    model: config.script.model,
    prompt,
    output: Output.object({ schema: config.script.schema as any }),
    maxOutputTokens: 2500,
    providerOptions: config.script.providerOptions,
  });
  const output = result.output;

  const slots = output as any;
  const rawLines = config.script.lines(slots, site);
  const lines: ScriptLine[] = rawLines.map((l) => ({
    id: l.id,
    segment: l.segment,
    text: typeof l.text === 'function' ? (l.text as any)(slots) : l.text,
  }));

  const onScreen =
    typeof config.script.sticker === 'function'
      ? config.script.sticker(slots, site)
      : config.script.sticker;

  const postCaption = config.script.postCaption(slots);
  const hashtags = config.script.hashtags(slots);
  const extraSlots = config.script.saveSlots ? config.script.saveSlots(slots) : {};

  const script: Script = {
    site,
    onScreen,
    lines,
    postCaption,
    hashtags,
    ...extraSlots,
  };

  const scriptPath = join(folder, 'script.json');
  writeFileSync(scriptPath, JSON.stringify(script, null, 2));

  console.log('\n--- Script Lines ---');
  lines.forEach((line) => console.log(`${line.id.padEnd(18)} [${line.segment.padEnd(7)}] ${line.text}`));

  console.log(`\nCaption: ${script.postCaption}`);
  console.log(`Hashtags: ${script.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}`);
  console.log(`\nWrote ${scriptPath}. Edit lines if desired, then run: demo-video produce`);

  return scriptPath;
}
