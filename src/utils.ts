import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const findNewestRecording = (
  outDir: string,
  requiredFile: string = 'timeline.json'
): string => {
  if (!existsSync(outDir)) {
    throw new Error(`Output directory does not exist: ${outDir}. Run "demo-video record" first.`);
  }

  const folders = readdirSync(outDir)
    .map((name) => join(outDir, name))
    .filter(
      (path) => statSync(path).isDirectory() && existsSync(join(path, requiredFile))
    )
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (!folders.length) {
    throw new Error(`No recording folder containing ${requiredFile} found in ${outDir}.`);
  }

  return folders[0];
};
