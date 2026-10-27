#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { loadConfig } from './config';
import { runDoctor } from './doctor';
import { runEdit } from './edit';
import { runLogin } from './login';
import { runProduce } from './produce';
import { runRecord } from './record';
import { runScript } from './script';

// Lesson #6: .env must win over the shell
loadEnv({ override: true });

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
demo-video CLI

Usage:
  demo-video doctor                     Check prerequisites and environment
  demo-video login                      Log in and save session
  demo-video record <target> [flags]    Record a target on camera
                                        Flags: --keep (skip cleanup), --headed
  demo-video script [folder]            Generate script.json using AI model
  demo-video produce [folder]           Produce final video with voice & captions
  demo-video edit [folder] [flags]      Speed up working stretch only (--speed 6)
`);
    return;
  }

  const config = loadConfig(process.cwd());

  switch (command) {
    case 'doctor': {
      const ok = await runDoctor(config);
      if (!ok) process.exit(1);
      break;
    }

    case 'login': {
      await runLogin(config);
      break;
    }

    case 'record': {
      const rest = args.slice(1);
      const target = rest.find((arg) => !arg.startsWith('--'));
      if (!target) {
        console.error('Error: missing <target> argument. Usage: demo-video record <target>');
        process.exit(1);
      }
      const keep = rest.includes('--keep');
      const headed = rest.includes('--headed');
      await runRecord(config, target, { keep, headed });
      break;
    }

    case 'script': {
      const rest = args.slice(1);
      const folder = rest.find((arg) => !arg.startsWith('--'));
      await runScript(config, folder);
      break;
    }

    case 'produce': {
      const rest = args.slice(1);
      const folder = rest.find((arg) => !arg.startsWith('--'));
      await runProduce(config, folder);
      break;
    }

    case 'edit': {
      const rest = args.slice(1);
      const speedIndex = rest.indexOf('--speed');
      const speed = speedIndex >= 0 ? Number(rest[speedIndex + 1]) : 6;
      const folder = rest.find((arg, i) => !arg.startsWith('--') && rest[i - 1] !== '--speed');
      runEdit(config, folder, speed);
      break;
    }

    default: {
      console.error(`Unknown command: "${command}". Run "demo-video --help" for options.`);
      process.exit(1);
    }
  }
}

main().catch((err: any) => {
  console.error(`\nError: ${err.message || err}`);
  process.exit(1);
});
