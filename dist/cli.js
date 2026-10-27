#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli.ts
var import_dotenv = require("dotenv");

// src/config.ts
var import_fs = require("fs");
var import_jiti = __toESM(require("jiti"));
var import_path = require("path");
function resolveGeminiApiKey(cwd = process.cwd()) {
  const envPath = (0, import_path.join)(cwd, ".env");
  let envFileKey;
  if ((0, import_fs.existsSync)(envPath)) {
    const lines = (0, import_fs.readFileSync)(envPath, "utf8").split(/\r?\n/);
    const line = lines.find((l) => l.startsWith("GEMINI_API_KEY="));
    if (line) {
      envFileKey = line.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    }
  }
  const key = envFileKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set in .env or the environment.");
  }
  return key;
}
function loadConfig(cwd = process.cwd()) {
  const possibleNames = [
    "demo-video.config.ts",
    "demo-video.config.js",
    "demo-video.config.mjs",
    "demo-video.config.cjs"
  ];
  let configPath = null;
  for (const name of possibleNames) {
    const full = (0, import_path.resolve)(cwd, name);
    if ((0, import_fs.existsSync)(full)) {
      configPath = full;
      break;
    }
  }
  if (!configPath) {
    throw new Error(
      `Could not find demo-video.config.ts (or .js) in ${cwd}. Please create one.`
    );
  }
  let rawExport;
  if (configPath.endsWith(".ts")) {
    try {
      require("sucrase/register/ts");
      rawExport = require(configPath);
    } catch {
      const jiti = (0, import_jiti.default)(cwd, { interopDefault: true });
      rawExport = jiti(configPath);
    }
  } else {
    try {
      rawExport = require(configPath);
    } catch {
      const jiti = (0, import_jiti.default)(cwd, { interopDefault: true });
      rawExport = jiti(configPath);
    }
  }
  const userConfig = rawExport?.default || rawExport;
  if (!userConfig || !userConfig.recorder || !userConfig.script) {
    throw new Error(
      `Invalid config in ${configPath}. Both "recorder" and "script" adapters must be defined.`
    );
  }
  const outDir = userConfig.app?.outDir || (0, import_path.join)(".demo-video", "out");
  const authDir = userConfig.app?.authDir || (0, import_path.join)(".demo-video", ".auth");
  const resolved = {
    ...userConfig,
    app: {
      baseUrl: process.env.DEMO_BASE_URL || userConfig.app?.baseUrl || "http://localhost:3000",
      outDir: (0, import_path.resolve)(cwd, outDir),
      authDir: (0, import_path.resolve)(cwd, authDir),
      hideDevCss: userConfig.app?.hideDevCss || ""
    },
    auth: userConfig.auth ? {
      loginPath: userConfig.auth.loginPath || "/login",
      isSignedIn: userConfig.auth.isSignedIn,
      refresh: userConfig.auth.refresh
    } : void 0,
    style: {
      brandAss: userConfig.style?.brandAss || "&H00FFFFFF",
      // Neutral white
      captionBoxAss: userConfig.style?.captionBoxAss || "&H00111111",
      hookFont: userConfig.style?.hookFont || "Arial",
      hookFontSize: userConfig.style?.hookFontSize || 76,
      captionFont: userConfig.style?.captionFont || "Arial",
      captionFontSize: userConfig.style?.captionFontSize || 70,
      viewportWidth: userConfig.style?.viewportWidth || 540,
      viewportHeight: userConfig.style?.viewportHeight || 960,
      videoWidth: userConfig.style?.videoWidth || 1080,
      videoHeight: userConfig.style?.videoHeight || 1920
    },
    voice: {
      model: userConfig.voice?.model || "gemini-3.8-flash-tts",
      voice: userConfig.voice?.voice || "Puck",
      // Neutral voice
      style: userConfig.voice?.style || "Clear, articulate, and engaging, speaking at a natural, brisk pace.",
      apiKey: userConfig.voice?.apiKey || (() => resolveGeminiApiKey(cwd))
    }
  };
  return resolved;
}

// src/doctor.ts
var import_test = require("@playwright/test");
var import_child_process = require("child_process");
var import_fs2 = require("fs");
var import_path2 = require("path");
async function runDoctor(config, cwd = process.cwd()) {
  const results = [];
  console.log("Running demo-video doctor checks...\n");
  try {
    const ff = (0, import_child_process.spawnSync)("ffmpeg", ["-version"], { encoding: "utf8" });
    if (ff.status === 0) {
      const hasLibass = ff.stdout.includes("--enable-libass");
      if (hasLibass) {
        results.push({ name: "ffmpeg", passed: true, message: "ffmpeg is installed with libass support." });
      } else {
        results.push({
          name: "ffmpeg",
          passed: true,
          warning: true,
          message: "ffmpeg is installed, but --enable-libass was not detected in build configuration.",
          help: "Install an ffmpeg build that includes libass (e.g. from https://www.gyan.dev/ffmpeg/builds/)."
        });
      }
    } else {
      results.push({
        name: "ffmpeg",
        passed: false,
        message: "ffmpeg returned a non-zero exit code.",
        help: 'Verify your ffmpeg installation or install via "winget install Gyan.FFmpeg".'
      });
    }
  } catch (err) {
    results.push({
      name: "ffmpeg",
      passed: false,
      message: `ffmpeg is not on PATH: ${err.message}`,
      help: 'Install ffmpeg and add it to your system PATH (e.g. "winget install Gyan.FFmpeg").'
    });
  }
  try {
    const py = (0, import_child_process.spawnSync)("python", ["-c", "import faster_whisper"], { encoding: "utf8" });
    if (py.status === 0) {
      results.push({ name: "faster-whisper", passed: true, message: "Python with faster-whisper is available." });
    } else {
      results.push({
        name: "faster-whisper",
        passed: false,
        message: "Python cannot import faster_whisper.",
        help: 'Run "pip install faster-whisper" in your Python environment.'
      });
    }
  } catch (err) {
    results.push({
      name: "faster-whisper",
      passed: false,
      message: `Python is not available: ${err.message}`,
      help: 'Install Python 3.10+ and run "pip install faster-whisper".'
    });
  }
  try {
    const browser = await import_test.chromium.launch({ headless: true });
    await browser.close();
    results.push({ name: "Playwright Chromium", passed: true, message: "Chromium browser launched successfully." });
  } catch (err) {
    results.push({
      name: "Playwright Chromium",
      passed: false,
      message: `Failed to launch Playwright browser: ${err.message}`,
      help: 'Run "npx playwright install chromium" to install browser binaries.'
    });
  }
  const envPath = (0, import_path2.join)(cwd, ".env");
  let envFileKey;
  if ((0, import_fs2.existsSync)(envPath)) {
    const lines = (0, import_fs2.readFileSync)(envPath, "utf8").split(/\r?\n/);
    const line = lines.find((l) => l.startsWith("GEMINI_API_KEY="));
    if (line) {
      envFileKey = line.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    }
  }
  const shellKey = process.env.GEMINI_API_KEY;
  if (envFileKey && shellKey && envFileKey !== shellKey) {
    console.warn(
      "  [WARNING] Shell GEMINI_API_KEY differs from .env. The kit will use the key from .env (Lesson #6)."
    );
  }
  const effectiveKey = envFileKey || shellKey;
  if (!effectiveKey) {
    results.push({
      name: "Gemini API Key",
      passed: false,
      message: "GEMINI_API_KEY is not set in .env or the environment.",
      help: "Add GEMINI_API_KEY=... to your .env file."
    });
  } else {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${effectiveKey}`
      );
      if (res.ok) {
        results.push({ name: "Gemini API Key", passed: true, message: "Gemini API key is valid and responsive." });
      } else {
        const body = await res.json().catch(() => ({}));
        results.push({
          name: "Gemini API Key",
          passed: false,
          message: `Gemini API key test failed with status ${res.status}: ${JSON.stringify(body?.error?.message || body)}`,
          help: "Check that your GEMINI_API_KEY is valid and has Gemini API enabled in Google Cloud Console."
        });
      }
    } catch (err) {
      results.push({
        name: "Gemini API Key",
        passed: false,
        message: `Network error contacting Gemini API: ${err.message}`,
        help: "Ensure network connection to generativelanguage.googleapis.com is allowed."
      });
    }
  }
  try {
    const res = await fetch(config.app.baseUrl, { redirect: "manual" });
    if (res.status < 500) {
      results.push({
        name: "App at baseUrl",
        passed: true,
        message: `App is reachable at ${config.app.baseUrl} (HTTP ${res.status}).`
      });
    } else {
      results.push({
        name: "App at baseUrl",
        passed: false,
        message: `App at ${config.app.baseUrl} returned HTTP ${res.status}.`,
        help: "Check server logs for errors."
      });
    }
  } catch (err) {
    results.push({
      name: "App at baseUrl",
      passed: false,
      message: `App is not reachable at ${config.app.baseUrl}: ${err.message}`,
      help: `Start the local app (e.g. "npm run dev") before running recordings.`
    });
  }
  if (config.auth) {
    const authFile = (0, import_path2.join)(config.app.authDir, "state.json");
    if ((0, import_fs2.existsSync)(authFile)) {
      results.push({
        name: "Auth Session",
        passed: true,
        message: `Saved session found at ${authFile}.`
      });
    } else {
      results.push({
        name: "Auth Session",
        passed: false,
        message: `No saved session found at ${authFile}.`,
        help: 'Run "demo-video login" to authenticate and save the session.'
      });
    }
  }
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? r.warning ? "WARN" : "PASS" : "FAIL";
    const symbol = r.passed ? r.warning ? "!" : "\u2713" : "\u2717";
    console.log(`[${status}] ${symbol} ${r.name}: ${r.message}`);
    if (r.help) {
      console.log(`       Fix: ${r.help}`);
    }
    if (!r.passed) {
      allPassed = false;
    }
  }
  console.log(`
Doctor check ${allPassed ? "PASSED" : "FAILED"}.
`);
  return allPassed;
}

// src/edit.ts
var import_child_process2 = require("child_process");
var import_fs5 = require("fs");
var import_path5 = require("path");

// src/layout.ts
var LEAD = 0.2;
var END_TAIL = 1;
var GAP = 0.25;
var PAIR_GAP = 0.55;
var MAX_SPEED = 12;
var NUMBER_WORDS = "zero one two three four five six seven eight nine ten eleven twelve".split(" ");
var normalise = (text) => text.toLowerCase().replace(/\bgonna\b/g, "going to").replace(/\bwanna\b/g, "want to").replace(/\bgotta\b/g, "got to").replace(/\b\d{1,2}\b/g, (n) => NUMBER_WORDS[Number(n)] || n).replace(/[^a-z0-9]/g, "");
var similarity = (a, b) => {
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
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
var round = (t) => Math.round(t * 100) / 100;
var placeSegment = (lines, from) => {
  const placed = [];
  let t = from + LEAD;
  lines.forEach((line, i) => {
    if (i > 0) t += line.id.endsWith("-should") ? GAP : PAIR_GAP;
    placed.push({ ...line, start: t });
    t += line.seconds;
  });
  return { placed, end: t };
};
var timeWords = (line) => {
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
    end: line.start + (i + 1 < shown.length ? starts[i + 1] : Math.max(lastEnd, starts[i] + 0.2))
  }));
};
var chunkWords = (words) => {
  const chunks = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    const { length } = current.map((w) => w.text).join(" ");
    if (current.length >= 3 || length >= 16 || /[.,!?;:]$/.test(word.text)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
};
var layoutTimeline = (input) => {
  const { sent, answerDone, end, voiced } = input;
  const inSegment = (segment) => voiced.filter((line) => line.segment === segment);
  const intro = placeSegment(inSegment("intro"), 0);
  const introOut = Math.max(sent, intro.end + 0.3);
  const introHold = introOut - sent;
  const workLines = inSegment("working");
  const workRaw = answerDone - sent;
  const workNeed = workLines.reduce((sum, l) => sum + l.seconds, 0) + LEAD + 0.4;
  const workSpeed = clamp(workRaw / workNeed, 1, MAX_SPEED);
  const workOut = workRaw / workSpeed;
  const work = placeSegment(workLines, introOut - LEAD + 0.1);
  const answerStart = introOut + workOut;
  const answer = placeSegment([...inSegment("answer"), ...inSegment("outro")], answerStart);
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
    placed
  };
};
var remapEventTime = (t, start, end, speed) => {
  const saved = (end - start) * (1 - 1 / speed);
  if (t <= start) return t;
  if (t <= end) return start + (t - start) / speed;
  return t - saved;
};

// src/script.ts
var import_ai = require("ai");
var import_fs4 = require("fs");
var import_path4 = require("path");

// src/utils.ts
var import_fs3 = require("fs");
var import_path3 = require("path");
var findNewestRecording = (outDir, requiredFile = "timeline.json") => {
  if (!(0, import_fs3.existsSync)(outDir)) {
    throw new Error(`Output directory does not exist: ${outDir}. Run "demo-video record" first.`);
  }
  const folders = (0, import_fs3.readdirSync)(outDir).map((name) => (0, import_path3.join)(outDir, name)).filter(
    (path) => (0, import_fs3.statSync)(path).isDirectory() && (0, import_fs3.existsSync)((0, import_path3.join)(path, requiredFile))
  ).sort((a, b) => (0, import_fs3.statSync)(b).mtimeMs - (0, import_fs3.statSync)(a).mtimeMs);
  if (!folders.length) {
    throw new Error(`No recording folder containing ${requiredFile} found in ${outDir}.`);
  }
  return folders[0];
};

// src/script.ts
async function runScript(config, folderArg) {
  const folder = folderArg ? (0, import_path4.resolve)(folderArg) : findNewestRecording(config.app.outDir, "answer.txt");
  const answerPath = (0, import_path4.join)(folder, "answer.txt");
  if (!(0, import_fs4.existsSync)(answerPath)) {
    throw new Error(`No answer.txt found in ${folder}.`);
  }
  const timelinePath = (0, import_path4.join)(folder, "timeline.json");
  if (!(0, import_fs4.existsSync)(timelinePath)) {
    throw new Error(`No timeline.json found in ${folder}.`);
  }
  const { site } = JSON.parse((0, import_fs4.readFileSync)(timelinePath, "utf8"));
  const answer = (0, import_fs4.readFileSync)(answerPath, "utf8");
  console.log(`Generating script for ${site}...`);
  const prompt = config.script.prompt(site, answer);
  const result = await (0, import_ai.generateText)({
    model: config.script.model,
    prompt,
    output: import_ai.Output.object({ schema: config.script.schema }),
    maxOutputTokens: 2500,
    providerOptions: config.script.providerOptions
  });
  const output = result.output;
  const slots = output;
  const rawLines = config.script.lines(slots, site);
  const lines = rawLines.map((l) => ({
    id: l.id,
    segment: l.segment,
    text: typeof l.text === "function" ? l.text(slots) : l.text
  }));
  const onScreen = typeof config.script.sticker === "function" ? config.script.sticker(slots, site) : config.script.sticker;
  const postCaption = config.script.postCaption(slots);
  const hashtags = config.script.hashtags(slots);
  const extraSlots = config.script.saveSlots ? config.script.saveSlots(slots) : {};
  const script = {
    site,
    onScreen,
    lines,
    postCaption,
    hashtags,
    ...extraSlots
  };
  const scriptPath = (0, import_path4.join)(folder, "script.json");
  (0, import_fs4.writeFileSync)(scriptPath, JSON.stringify(script, null, 2));
  console.log("\n--- Script Lines ---");
  lines.forEach((line) => console.log(`${line.id.padEnd(18)} [${line.segment.padEnd(7)}] ${line.text}`));
  console.log(`
Caption: ${script.postCaption}`);
  console.log(`Hashtags: ${script.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`);
  console.log(`
Wrote ${scriptPath}. Edit lines if desired, then run: demo-video produce`);
  return scriptPath;
}

// src/edit.ts
var DEFAULT_SPEED = 6;
var eventTime = (events, type) => {
  const found = events.find((e) => e.type === type);
  if (!found) throw new Error(`The timeline has no "${type}" event.`);
  return found.t;
};
function runEdit(config, folderArg, speed = DEFAULT_SPEED) {
  if (!Number.isFinite(speed) || speed < 1) {
    throw new Error("--speed must be a number of at least 1.");
  }
  const folder = folderArg ? (0, import_path5.resolve)(folderArg) : findNewestRecording(config.app.outDir, "timeline.json");
  const timelinePath = (0, import_path5.join)(folder, "timeline.json");
  if (!(0, import_fs5.existsSync)(timelinePath)) {
    throw new Error(`No timeline.json found in ${folder}.`);
  }
  const rawPath = (0, import_path5.join)(folder, "raw.webm");
  if (!(0, import_fs5.existsSync)(rawPath)) {
    throw new Error(`No raw.webm found in ${folder}.`);
  }
  const timeline = JSON.parse((0, import_fs5.readFileSync)(timelinePath, "utf8"));
  if (timeline.failure) {
    throw new Error(`That recording failed (${timeline.failure}).`);
  }
  const start = eventTime(timeline.events, "sent");
  const end = eventTime(timeline.events, "answer_done");
  const filter = [
    `[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[intro]`,
    `[0:v]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed}[work]`,
    `[0:v]trim=start=${end},setpts=PTS-STARTPTS[answer]`,
    `[intro][work][answer]concat=n=3:v=1:a=0,fps=30,scale=${config.style.videoWidth}:${config.style.videoHeight}:flags=lanczos,unsharp=5:5:0.6[out]`
  ].join(";");
  const output = (0, import_path5.join)(folder, "edited.mp4");
  const result = (0, import_child_process2.spawnSync)(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      rawPath,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      output
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || "ffmpeg error"}`);
  }
  const saved = (end - start) * (1 - 1 / speed);
  const edited = {
    ...timeline,
    edit: { speed, workingStretch: { from: start, to: end }, secondsSaved: round(saved) },
    events: timeline.events.map((e) => ({
      ...e,
      t: round(remapEventTime(e.t, start, end, speed))
    }))
  };
  (0, import_fs5.writeFileSync)((0, import_path5.join)(folder, "timeline.edited.json"), JSON.stringify(edited, null, 2));
  console.log(
    `Working stretch ${round(start)}s to ${round(end)}s played at ${speed}x, ${round(saved)}s shorter.`
  );
  console.log(`Wrote ${output}`);
  return output;
}

// src/login.ts
var import_test2 = require("@playwright/test");
var import_fs6 = require("fs");
var import_path6 = require("path");
var sleep = (ms) => new Promise((resolve5) => setTimeout(resolve5, ms));
async function runLogin(config) {
  const authFile = (0, import_path6.join)(config.app.authDir, "state.json");
  (0, import_fs6.mkdirSync)(config.app.authDir, { recursive: true });
  const loginPath = config.auth?.loginPath || "/login";
  console.log(`Launching browser for login at ${config.app.baseUrl}${loginPath}...`);
  const browser = await import_test2.chromium.launch({ headless: false });
  const context = await browser.newContext({
    baseURL: config.app.baseUrl,
    viewport: { width: 1e3, height: 800 }
  });
  const page = await context.newPage();
  await page.goto(loginPath);
  console.log("Sign in with your account in the browser window. Waiting up to 5 minutes...");
  const deadline = Date.now() + 5 * 6e4;
  let lastReport = 0;
  while (Date.now() < deadline) {
    let signedIn = false;
    if (config.auth?.isSignedIn) {
      signedIn = await config.auth.isSignedIn(context).catch(() => false);
    } else {
      const cookies = await context.cookies();
      signedIn = cookies.some(
        (c) => c.name === "__session" || c.name.startsWith("__client_uat") && c.value !== "0"
      );
    }
    if (signedIn) {
      console.log("Sign-in detected. Waiting for cookies to settle...");
      await sleep(2500);
      await context.storageState({ path: authFile });
      console.log(`Session saved to ${authFile}`);
      await browser.close();
      return;
    }
    if (Date.now() - lastReport > 15e3) {
      lastReport = Date.now();
      const cookies = await context.cookies();
      console.log(
        `  still waiting... page is ${page.url()} (cookies: ${cookies.map((c) => c.name).join(", ") || "none"})`
      );
    }
    await sleep(1e3);
  }
  await browser.close();
  throw new Error("Timed out waiting for sign-in.");
}

// src/produce.ts
var import_child_process3 = require("child_process");
var import_crypto = require("crypto");
var import_fs8 = require("fs");
var import_path7 = require("path");

// src/ass.ts
var assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 36e4);
  const m = Math.floor(cs % 36e4 / 6e3);
  const s = Math.floor(cs % 6e3 / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
var assText = (text) => text.replace(/[{}\\]/g, "").trim();
var buildAss = (lines, hookText, introEnd, style) => {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${style.videoWidth}`,
    `PlayResY: ${style.videoHeight}`,
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    [
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic,",
      "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR,",
      "MarginV, Encoding"
    ].join(" "),
    `Style: Hook,${style.hookFont},${style.hookFontSize},&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,24,0,8,140,140,330,1`,
    `Style: Caption,${style.captionFont},${style.captionFontSize},&H00FFFFFF,&H00FFFFFF,${style.captionBoxAss},${style.captionBoxAss},-1,0,0,0,100,100,0,0,3,18,0,2,80,80,520,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ];
  const dialogue = (start, end, dlgStyle, text) => `Dialogue: 0,${assTime(start)},${assTime(end)},${dlgStyle},,0,0,0,,${text}`;
  const events = [dialogue(0, introEnd, "Hook", `{\\frz2}${assText(hookText)}`)];
  for (const line of lines) {
    for (const chunk of chunkWords(timeWords(line))) {
      chunk.forEach((word, i) => {
        const text = chunk.map(
          (w, j) => j === i ? `{\\3c${style.brandAss}&}${assText(w.text)}{\\3c${style.captionBoxAss}&}` : assText(w.text)
        ).join(" ");
        events.push(dialogue(word.start, word.end, "Caption", text));
      });
    }
  }
  return `${header.concat(events).join("\n")}
`;
};

// src/tts.ts
var import_fs7 = require("fs");
var DEFAULT_SAMPLE_RATE = 24e3;
var ttsPrompt = (text, style) => [
  "### DIRECTOR'S NOTES",
  `Style: ${style}`,
  "Speak the transcript exactly as written. Do not add, remove or change any words.",
  "",
  "### TRANSCRIPT",
  `"${text}"`
].join("\n");
var extractPcm = (audio, fallbackSampleRate = DEFAULT_SAMPLE_RATE) => {
  if (audio.length < 12 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
    return { pcm: audio, sampleRate: fallbackSampleRate };
  }
  let sampleRate = fallbackSampleRate;
  let pcm = null;
  let offset = 12;
  while (offset + 8 <= audio.length) {
    const id = audio.toString("ascii", offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      const channels = audio.readUInt16LE(body + 2);
      const bits = audio.readUInt16LE(body + 14);
      if (channels !== 1 || bits !== 16) {
        throw new Error(
          `TTS returned ${channels}-channel ${bits}-bit audio; expected mono 16-bit.`
        );
      }
      sampleRate = audio.readUInt32LE(body + 4);
    } else if (id === "data") {
      pcm = audio.subarray(body, Math.min(audio.length, body + size));
    }
    offset = body + size + size % 2;
  }
  if (!pcm) {
    throw new Error("TTS returned a WAV file with no audio data.");
  }
  return { pcm, sampleRate };
};
var wavHeader = (dataLength, sampleRate) => {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
};
var speak = async (text, outPath, options) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey
      },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: ttsPrompt(text, options.style) }] }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: options.voice }
            }
          }
        }
      })
    }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `TTS failed (${response.status}): ${JSON.stringify(body?.error ?? body).slice(0, 400)}`
    );
  }
  const data = body?.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData
  )?.inlineData?.data;
  if (!data) {
    throw new Error("TTS returned no audio.");
  }
  const { pcm, sampleRate } = extractPcm(Buffer.from(data, "base64"));
  (0, import_fs7.writeFileSync)(outPath, Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]));
  return { seconds: pcm.length / (sampleRate * 2) };
};

// src/produce.ts
var VOICE_ATTEMPTS = 3;
var MATCH_THRESHOLD = 0.85;
var findTranscriberScript = () => {
  const candidates = [
    (0, import_path7.join)(__dirname, "..", "assets", "transcribe.py"),
    (0, import_path7.join)(__dirname, "assets", "transcribe.py"),
    (0, import_path7.join)(__dirname, "transcribe.py"),
    (0, import_path7.join)(process.cwd(), "assets", "transcribe.py")
  ];
  for (const c of candidates) {
    if ((0, import_fs8.existsSync)(c)) return c;
  }
  return candidates[0];
};
var transcribe = (files, pythonScript = findTranscriberScript()) => {
  if (!(0, import_fs8.existsSync)(pythonScript)) return null;
  const result = (0, import_child_process3.spawnSync)("python", ["-I", pythonScript, ...files], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) return null;
  const heard = /* @__PURE__ */ new Map();
  for (const row of result.stdout.split(/\r?\n/).filter((r) => r.startsWith("{"))) {
    try {
      const { file, text, words } = JSON.parse(row);
      heard.set(file, { text, words: words || [] });
    } catch {
    }
  }
  return heard;
};
async function voiceLines(folder, lines, config) {
  const voiceCache = (0, import_path7.join)(config.app.outDir, ".voice-cache");
  (0, import_fs8.mkdirSync)(voiceCache, { recursive: true });
  (0, import_fs8.mkdirSync)((0, import_path7.join)(folder, "voice"), { recursive: true });
  const clipFor = (line) => {
    const key = (0, import_crypto.createHash)("sha1").update(
      [config.voice.model, config.voice.voice, ttsPrompt(line.text, config.voice.style)].join(
        "|"
      )
    ).digest("hex");
    return {
      wav: (0, import_path7.join)(voiceCache, `${key}.wav`),
      checked: (0, import_path7.join)(voiceCache, `${key}.words.json`)
    };
  };
  const apiKey = typeof config.voice.apiKey === "function" ? config.voice.apiKey() : config.voice.apiKey;
  let pending = lines.filter((line) => !(0, import_fs8.existsSync)(clipFor(line).checked));
  for (let attempt = 1; attempt <= VOICE_ATTEMPTS && pending.length; attempt += 1) {
    for (const line of pending) {
      if (attempt > 1 || !(0, import_fs8.existsSync)(clipFor(line).wav)) {
        console.log(`  voicing ${line.id}${attempt > 1 ? ` (try ${attempt})` : ""}...`);
        await speak(line.text, clipFor(line).wav, {
          model: config.voice.model,
          voice: config.voice.voice,
          style: config.voice.style,
          apiKey
        });
      }
    }
    const heard = transcribe(pending.map((line) => clipFor(line).wav));
    if (!heard) {
      console.warn(
        "  [WARNING] Speech check skipped (needs python with faster-whisper). Listen to clips before posting."
      );
      pending = [];
      break;
    }
    pending = pending.filter((line) => {
      const result = heard.get(clipFor(line).wav);
      const said = result ? result.text : "";
      const score = similarity(normalise(line.text), normalise(said));
      if (result && score >= MATCH_THRESHOLD) {
        (0, import_fs8.writeFileSync)(
          clipFor(line).checked,
          JSON.stringify({ heard: said, words: result.words })
        );
        return false;
      }
      console.warn(
        `  ${line.id} did not match script (${Math.round(score * 100)}%). Heard: "${said}"`
      );
      return true;
    });
  }
  if (pending.length) {
    throw new Error(
      `The voice kept changing these lines: ${pending.map((l) => l.id).join(", ")}. Reword them in script.json and run again.`
    );
  }
  const voiced = [];
  for (const line of lines) {
    const cached = clipFor(line).wav;
    const file = (0, import_path7.join)("voice", `${line.id}.wav`);
    (0, import_fs8.copyFileSync)(cached, (0, import_path7.join)(folder, file));
    const seconds = ((0, import_fs8.statSync)(cached).size - 44) / (0, import_fs8.readFileSync)(cached).readUInt32LE(28);
    const wordsPerSecond = line.text.split(/\s+/).length / seconds;
    if (wordsPerSecond < 1.8) {
      console.warn(
        `  warning: ${line.id} is slow (${wordsPerSecond.toFixed(1)} words/s). Listen to ${file}.`
      );
    }
    const { checked } = clipFor(line);
    const words = (0, import_fs8.existsSync)(checked) ? JSON.parse((0, import_fs8.readFileSync)(checked, "utf8")).words : null;
    voiced.push({ ...line, seconds, file, words });
  }
  return voiced;
}
var eventTime2 = (events, type) => {
  const found = events.find((e) => e.type === type);
  if (!found) throw new Error(`The timeline has no "${type}" event.`);
  return found.t;
};
async function runProduce(config, folderArg) {
  const folder = folderArg ? (0, import_path7.resolve)(folderArg) : findNewestRecording(config.app.outDir, "script.json");
  const scriptPath = (0, import_path7.join)(folder, "script.json");
  if (!(0, import_fs8.existsSync)(scriptPath)) {
    throw new Error(`No script.json found in ${folder}. Run "demo-video script" first.`);
  }
  const timelinePath = (0, import_path7.join)(folder, "timeline.json");
  if (!(0, import_fs8.existsSync)(timelinePath)) {
    throw new Error(`No timeline.json found in ${folder}.`);
  }
  const rawWebmPath = (0, import_path7.join)(folder, "raw.webm");
  if (!(0, import_fs8.existsSync)(rawWebmPath)) {
    throw new Error(`No raw.webm found in ${folder}.`);
  }
  const script = JSON.parse((0, import_fs8.readFileSync)(scriptPath, "utf8"));
  const timeline = JSON.parse((0, import_fs8.readFileSync)(timelinePath, "utf8"));
  if (timeline.failure) {
    throw new Error(`That recording failed (${timeline.failure}). Record again first.`);
  }
  console.log(`Producing demo video for ${folder}...`);
  const voiced = await voiceLines(folder, script.lines, config);
  const sent = eventTime2(timeline.events, "sent");
  const answerDone = eventTime2(timeline.events, "answer_done");
  const end = eventTime2(timeline.events, "end");
  const layout = layoutTimeline({
    sent,
    answerDone,
    end,
    voiced
  });
  const assContent = buildAss(layout.placed, script.onScreen, layout.introOut, config.style);
  (0, import_fs8.writeFileSync)((0, import_path7.join)(folder, "captions.ass"), assContent);
  const videoFilter = [
    `[0:v]trim=start=0:end=${sent},setpts=PTS-STARTPTS,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${round(layout.introHold)}[intro]`,
    `[0:v]trim=start=${sent}:end=${answerDone},setpts=(PTS-STARTPTS)/${round(layout.workSpeed)},fps=30,setsar=1[work]`,
    [
      `[0:v]trim=start=${answerDone}:end=${end},setpts=(PTS-STARTPTS)/${round(layout.answerSpeed)},fps=30,setsar=1,`,
      `tpad=stop_mode=clone:stop_duration=${round(layout.answerHold)}[answer]`
    ].join(""),
    [
      "[intro][work][answer]concat=n=3:v=1:a=0,",
      `scale=${config.style.videoWidth}:${config.style.videoHeight}:flags=lanczos,unsharp=5:5:0.6,ass=captions.ass[v]`
    ].join("")
  ];
  const audioFilter = layout.placed.map(
    (line, i) => `[${i + 1}:a]afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, line.seconds - 0.01).toFixed(3)}:d=0.01,adelay=${Math.round(line.start * 1e3)}:all=1[a${i}]`
  );
  audioFilter.push(
    `${layout.placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${layout.placed.length}:normalize=0:duration=longest,apad[a]`
  );
  const args = ["-v", "error", "-y", "-i", "raw.webm"].concat(...layout.placed.map((line) => ["-i", line.file])).concat([
    "-filter_complex",
    videoFilter.concat(audioFilter).join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    String(round(layout.total))
  ]).concat([
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "video.mp4"
  ]);
  const result = (0, import_child_process3.spawnSync)("ffmpeg", args, { cwd: folder, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || "ffmpeg error"}`);
  }
  const hashtags = script.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");
  (0, import_fs8.writeFileSync)((0, import_path7.join)(folder, "caption.txt"), `${script.postCaption}

${hashtags}
`);
  (0, import_fs8.writeFileSync)(
    (0, import_path7.join)(folder, "produce.json"),
    JSON.stringify(
      {
        total: round(layout.total),
        intro: { seconds: round(layout.introOut), heldFor: round(layout.introHold) },
        working: { seconds: round(layout.workOut), speed: round(layout.workSpeed) },
        answer: {
          seconds: round(layout.answerOut),
          speed: round(layout.answerSpeed),
          heldFor: round(layout.answerHold)
        },
        lines: layout.placed.map((l) => ({
          id: l.id,
          start: round(l.start),
          seconds: round(l.seconds),
          text: l.text
        }))
      },
      null,
      2
    )
  );
  console.log(
    `Intro ${round(layout.introOut)}s | working ${round(layout.workOut)}s at ${round(layout.workSpeed)}x | answer and outro ${round(layout.answerOut)}s at ${round(layout.answerSpeed)}x`
  );
  console.log(`Wrote ${(0, import_path7.join)(folder, "video.mp4")} (${round(layout.total)}s) and caption.txt`);
  return (0, import_path7.join)(folder, "video.mp4");
}

// src/record.ts
var import_test3 = require("@playwright/test");
var import_child_process4 = require("child_process");
var import_fs9 = require("fs");
var import_path8 = require("path");
var sleep2 = (ms) => new Promise((resolve5) => setTimeout(resolve5, ms));
var normaliseDomain = (raw) => raw.trim().replace(/^https?:\/\//i, "").replace(/^\/+|\/+$/g, "");
var timestamp = () => (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
var DEFAULT_HIDE_DEV_CSS = `
  nextjs-portal, button[aria-label*="React Query"], .tsqd-open-btn-container { display: none !important; }
`;
async function runRecord(config, rawTarget, options = {}) {
  if (!rawTarget) {
    throw new Error("Usage: demo-video record <target> [--keep] [--headed]");
  }
  const authFile = (0, import_path8.join)(config.app.authDir, "state.json");
  if (config.auth && !(0, import_fs9.existsSync)(authFile)) {
    throw new Error(`No saved session found in ${authFile}. Run "demo-video login" first.`);
  }
  try {
    const res = await fetch(config.app.baseUrl, { redirect: "manual" });
    if (res.status >= 500) throw new Error(`Status ${res.status}`);
  } catch (err) {
    throw new Error(
      `The app is not reachable at ${config.app.baseUrl}. Start it first. (${err.message})`
    );
  }
  const domainName = normaliseDomain(rawTarget);
  const slug = domainName.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
  const outDir = (0, import_path8.join)(config.app.outDir, `${slug}-${timestamp()}`);
  (0, import_fs9.mkdirSync)(outDir, { recursive: true });
  const viewport = {
    width: config.style.viewportWidth,
    height: config.style.viewportHeight
  };
  const videoSize = {
    width: config.style.videoWidth,
    height: config.style.videoHeight
  };
  const browser = await import_test3.chromium.launch({ headless: !options.headed });
  const setupContext = await browser.newContext({
    baseURL: config.app.baseUrl,
    storageState: config.auth && (0, import_fs9.existsSync)(authFile) ? authFile : void 0,
    viewport,
    colorScheme: "light"
  });
  if (config.auth?.refresh) {
    await config.auth.refresh(setupContext);
  }
  console.log(`Setting up target "${domainName}" off-camera...`);
  const setupResult = await config.recorder.setup(setupContext, domainName);
  const targetUrl = setupResult.url;
  const setupData = setupResult.data;
  if (config.auth?.refresh) {
    await config.auth.refresh(setupContext);
  }
  const recordContext = await browser.newContext({
    baseURL: config.app.baseUrl,
    storageState: await setupContext.storageState(),
    viewport,
    colorScheme: "light",
    recordVideo: { dir: outDir, size: viewport }
  });
  const hideCss = [DEFAULT_HIDE_DEV_CSS, config.app.hideDevCss || ""].join("\n");
  await recordContext.addInitScript((css) => {
    const apply = () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) apply();
    else document.addEventListener("DOMContentLoaded", apply);
  }, hideCss);
  const events = [];
  const startedAt = Date.now();
  const mark = (type, detail) => {
    const t = Math.round((Date.now() - startedAt) / 1e3 * 100) / 100;
    events.push({ t, type, detail });
    console.log(
      `  ${String(t).padStart(6)}s  ${type}${detail !== void 0 ? `  ${detail}` : ""}`
    );
  };
  let answer = "";
  let failure = "";
  const progress = { steps: 0, watching: false };
  const page = await recordContext.newPage();
  try {
    console.log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl);
    mark("page_ready");
    await sleep2(1500);
    progress.watching = true;
    const watcher = (async () => {
      while (progress.watching) {
        let count = progress.steps;
        if (config.recorder.stepCount) {
          count = await config.recorder.stepCount(page).catch(() => progress.steps);
        } else {
          count = await page.evaluate(() => (document.body.innerText.match(/✓/g) || []).length).catch(() => progress.steps);
        }
        if (count > progress.steps) {
          progress.steps = count;
          mark("step_done", count);
        }
        await sleep2(400);
      }
    })();
    answer = await config.recorder.run(page, mark);
    progress.watching = false;
    await watcher;
    if (config.recorder.scroll) {
      await config.recorder.scroll(page, mark);
    } else {
      mark("answer_scroll_start");
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button")].filter(
          (b) => (b.textContent || "").includes("View result")
        );
        if (buttons.length) {
          buttons[buttons.length - 1].scrollIntoView({
            block: "start",
            behavior: "instant"
          });
        }
      }).catch(() => {
      });
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      for (let i = 0; i < 30; i += 1) {
        await sleep2(1e3);
        const atBottom = await page.evaluate(() => {
          const scrollable = [...document.querySelectorAll("*")].filter(
            (el) => el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)
          ).sort((a, b) => b.clientHeight - a.clientHeight)[0];
          return !scrollable || scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 4;
        }).catch(() => true);
        if (atBottom) break;
        await page.mouse.wheel(0, 240);
      }
      mark("answer_scroll_end");
      await sleep2(1500);
      mark("end");
    }
  } catch (err) {
    failure = err.message || String(err);
    mark("failure", failure);
    console.error(`Recording error: ${failure}`);
  } finally {
    progress.watching = false;
  }
  const video = page.video();
  await recordContext.close();
  if (video) {
    const rawPath = (0, import_path8.join)(outDir, "raw.webm");
    (0, import_fs9.renameSync)(await video.path(), rawPath);
    const scaled = (0, import_child_process4.spawnSync)(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        rawPath,
        "-vf",
        `scale=${videoSize.width}:${videoSize.height}:flags=lanczos,unsharp=5:5:0.6`,
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        (0, import_path8.join)(outDir, "final.mp4")
      ],
      { encoding: "utf8" }
    );
    if (scaled.status !== 0) {
      console.warn(`ffmpeg could not produce final.mp4: ${scaled.stderr || "ffmpeg error"}`);
    }
  }
  const duration = events.length ? events[events.length - 1].t : 0;
  (0, import_fs9.writeFileSync)(
    (0, import_path8.join)(outDir, "timeline.json"),
    JSON.stringify(
      {
        site: domainName,
        slug,
        viewport,
        videoSize,
        duration,
        failure,
        events
      },
      null,
      2
    )
  );
  if (answer) {
    (0, import_fs9.writeFileSync)((0, import_path8.join)(outDir, "answer.txt"), answer);
  }
  if (!options.keep && config.recorder.cleanup) {
    console.log("Cleaning up target off-camera...");
    if (config.auth?.refresh) {
      await config.auth.refresh(setupContext).catch(() => {
      });
    }
    await config.recorder.cleanup(setupContext, setupData).catch((err) => console.warn(`Clean-up failed: ${err.message}`));
  }
  await setupContext.close();
  await browser.close();
  console.log(`
${failure ? "FAILED" : "Done"}: ${outDir}`);
  if (failure) {
    throw new Error(`Recording failed: ${failure}`);
  }
  return outDir;
}

// src/cli.ts
(0, import_dotenv.config)({ override: true });
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
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
    case "doctor": {
      const ok = await runDoctor(config);
      if (!ok) process.exitCode = 1;
      break;
    }
    case "login": {
      await runLogin(config);
      break;
    }
    case "record": {
      const rest = args.slice(1);
      const target = rest.find((arg) => !arg.startsWith("--"));
      if (!target) {
        console.error("Error: missing <target> argument. Usage: demo-video record <target>");
        process.exit(1);
      }
      const keep = rest.includes("--keep");
      const headed = rest.includes("--headed");
      await runRecord(config, target, { keep, headed });
      break;
    }
    case "script": {
      const rest = args.slice(1);
      const folder = rest.find((arg) => !arg.startsWith("--"));
      await runScript(config, folder);
      break;
    }
    case "produce": {
      const rest = args.slice(1);
      const folder = rest.find((arg) => !arg.startsWith("--"));
      await runProduce(config, folder);
      break;
    }
    case "edit": {
      const rest = args.slice(1);
      const speedIndex = rest.indexOf("--speed");
      const speed = speedIndex >= 0 ? Number(rest[speedIndex + 1]) : 6;
      const folder = rest.find((arg, i) => !arg.startsWith("--") && rest[i - 1] !== "--speed");
      runEdit(config, folder, speed);
      break;
    }
    default: {
      console.error(`Unknown command: "${command}". Run "demo-video --help" for options.`);
      process.exit(1);
    }
  }
}
main().catch((err) => {
  console.error(`
Error: ${err.message || err}`);
  process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map