const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const RUN_TIMEOUT_MS = 5000;      // per-test-case execution timeout
const COMPILE_TIMEOUT_MS = 15000; // compile timeout
const MAX_OUTPUT_BYTES = 200 * 1024; // guard against runaway stdout

function normalize(str) {
  return (str || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, '')) // trim trailing whitespace per line
    .join('\n')
    .trim();
}

function runProcess(cmd, args, { cwd, input, timeoutMs }) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let killedForTimeout = false;
    let killedForOutput = false;

    const timer = setTimeout(() => {
      killedForTimeout = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString();
      else {
        killedForOutput = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const runtime = Date.now() - startTime;
      resolve({ code: -1, stdout, stderr: String(err), timedOut: false, runtime });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const runtime = Date.now() - startTime;
      resolve({
        code,
        stdout,
        stderr: killedForOutput ? stderr + '\n[output truncated]' : stderr,
        timedOut: killedForTimeout,
        runtime,
      });
    });

    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function compile(language, workDir) {
  if (language === 'java') {
    const res = await runProcess('javac', ['Main.java'], { cwd: workDir, timeoutMs: COMPILE_TIMEOUT_MS });
    return { ok: res.code === 0, log: res.stderr || res.stdout };
  }
  if (language === 'cpp') {
    const res = await runProcess(
      'g++',
      ['-O2', '-std=c++17', '-o', 'main', 'main.cpp'],
      { cwd: workDir, timeoutMs: COMPILE_TIMEOUT_MS }
    );
    return { ok: res.code === 0, log: res.stderr || res.stdout };
  }
  throw new Error('Unsupported language: ' + language);
}

async function runOne(language, workDir, input) {
  if (language === 'java') {
    return runProcess('java', ['-Xss8m', '-Xmx256m', 'Main'], { cwd: workDir, input, timeoutMs: RUN_TIMEOUT_MS });
  }
  if (language === 'cpp') {
    return runProcess(path.join(workDir, 'main'), [], { cwd: workDir, input, timeoutMs: RUN_TIMEOUT_MS });
  }
  throw new Error('Unsupported language: ' + language);
}

/**
 * Judge a submission against an array of testcases: [{ input, output }]
 * Returns { compiled, compileLog, results: [{passed, actual, expected, error, timedOut}], passedCount, total }
 */
async function judge(language, sourceCode, testcases) {
  const workDir = path.join(os.tmpdir(), 'codeclash-' + randomUUID());
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const filename = language === 'java' ? 'Main.java' : 'main.cpp';
    fs.writeFileSync(path.join(workDir, filename), sourceCode, 'utf8');

    const compileResult = await compile(language, workDir);
    if (!compileResult.ok) {
      return {
        compiled: false,
        compileLog: compileResult.log,
        results: [],
        passedCount: 0,
        total: testcases.length,
      };
    }

    const results = [];
    for (const tc of testcases) {
      const run = await runOne(language, workDir, tc.input || '');
      const actual = normalize(run.stdout);
      const expected = normalize(tc.output);
      const passed = !run.timedOut && run.code === 0 && actual === expected;
      results.push({
        passed,
        input: tc.input || '',
        actual: run.stdout || '',
        expected: tc.output || '',
        error: run.stderr || '',
        runtime: run.runtime || 0,
        timedOut: run.timedOut,
        exitCode: run.code,
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    return { compiled: true, compileLog: '', results, passedCount, total: testcases.length };
  } finally {
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
}

module.exports = { judge };
