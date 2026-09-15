/* ═════════════════════════════════════════════════════════
   CodeClash — Competitive IDE Client Controller
   Integrated with 3-Pane Workspace & Memory-Cards Test Rail
═════════════════════════════════════════════════════════ */

const socket = io();

/* ─── Starter Templates ──────────────────────────────── */
const STARTER = {
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Read input, solve, and print output
    }
}`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // Read input, solve, and print output
    return 0;
}`,
};

/* ─── Client State ───────────────────────────────────── */
const state = {
  code: null,
  nickname: null,
  isHost: false,
  room: null,
  timerInterval: null,
  totalTests: 0,
};

let cmEditor = null;

/* ─────────────────────────────────────────────────────
   View Routing
───────────────────────────────────────────────────── */
function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
  }

  if (id === 'view-match') {
    initCodeEditor();
    if (cmEditor) {
      setTimeout(() => cmEditor.refresh(), 50);
    }
  }
}

/* ─────────────────────────────────────────────────────
   CodeMirror Initialization & Helper
───────────────────────────────────────────────────── */
function initCodeEditor() {
  const textarea = document.getElementById('code-editor');
  if (window.CodeMirror && !cmEditor && textarea) {
    cmEditor = CodeMirror.fromTextArea(textarea, {
      lineNumbers: true,
      mode: 'text/x-java',
      theme: 'codeclash',
      tabSize: 4,
      indentUnit: 4,
      lineWrapping: false,
      autoCloseBrackets: true,
      matchBrackets: true,
    });
  }
}

function getEditorCode() {
  return cmEditor ? cmEditor.getValue() : document.getElementById('code-editor').value;
}

function setEditorCode(code, lang) {
  if (cmEditor) {
    cmEditor.setValue(code);
    cmEditor.setOption('mode', lang === 'cpp' ? 'text/x-c++src' : 'text/x-java');
    setTimeout(() => cmEditor.refresh(), 20);
  } else {
    document.getElementById('code-editor').value = code;
  }
}

/* ─────────────────────────────────────────────────────
   Toast Notification
───────────────────────────────────────────────────── */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.style.display = 'none'), 3000);
}

/* ─────────────────────────────────────────────────────
   Connection Pill
───────────────────────────────────────────────────── */
const connPill = document.getElementById('connection-pill');
const connText = document.getElementById('connection-text');

socket.on('connect', () => {
  connText.textContent = 'online';
  connPill.classList.add('online');
  connPill.classList.remove('offline');
});

socket.on('disconnect', () => {
  connText.textContent = 'offline';
  connPill.classList.remove('online');
  connPill.classList.add('offline');
});

/* ─────────────────────────────────────────────────────
   Home Navigation
───────────────────────────────────────────────────── */
document.getElementById('btn-goto-create').onclick = () => showView('view-create');
document.getElementById('btn-goto-join').onclick   = () => showView('view-join');
document.getElementById('btn-create-back').onclick = () => showView('view-home');
document.getElementById('btn-join-back').onclick   = () => showView('view-home');
document.getElementById('btn-play-again').onclick  = () => location.reload();

/* ─────────────────────────────────────────────────────
   Regex Testcase Parser: "input:output;"
   - ":" differentiates between input and output
   - ";" marks the end of each testcase / line
───────────────────────────────────────────────────── */
function parseTestcases(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const testcases = [];
  // Matches <input>:<output> bounded by ';' or end of string
  const regex = /([^;:]*?):([^;]+?)(?:;|\s*$)/g;
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const input = match[1].trim();
    const output = match[2].trim();
    if (output !== '') {
      testcases.push({ input, output });
    }
  }
  return testcases;
}

/* ─────────────────────────────────────────────────────
   Create Room — Quick Paste (Bulk) & Manual Rows Tabs
───────────────────────────────────────────────────── */
const tabBulk       = document.getElementById('tab-tc-bulk');
const tabManual     = document.getElementById('tab-tc-manual');
const paneBulk       = document.getElementById('tc-bulk-pane');
const paneManual     = document.getElementById('tc-manual-pane');
const bulkTextarea   = document.getElementById('testcases-bulk');

function updateBulkPreview() {
  const previewWrap = document.getElementById('tc-bulk-preview');
  const badge       = document.getElementById('tc-preview-badge');
  const list        = document.getElementById('tc-preview-list');
  if (!bulkTextarea || !previewWrap) return;

  const raw    = bulkTextarea.value;
  const parsed = parseTestcases(raw);

  if (parsed.length === 0) {
    previewWrap.style.display = 'none';
    return;
  }

  previewWrap.style.display = 'block';
  badge.innerHTML = `✓ ${parsed.length} test case${parsed.length === 1 ? '' : 's'} parsed (input:output;)`;

  list.innerHTML = '';
  parsed.forEach((tc, idx) => {
    const item = document.createElement('div');
    item.className = 'tc-preview-item';
    const isSample = idx === 0;
    const inDisplay = tc.input ? (tc.input.length > 20 ? tc.input.slice(0, 20) + '…' : tc.input) : '(empty)';
    const outDisplay = tc.output.length > 20 ? tc.output.slice(0, 20) + '…' : tc.output;

    item.innerHTML = `
      ${isSample ? '<span class="tc-badge-sample">Sample</span>' : ''}
      <span>Test ${idx + 1}:</span>
      <b>${escapeHtml(inDisplay)}</b>
      <span style="color:var(--text-low);">→</span>
      <b style="color:var(--mint);">${escapeHtml(outDisplay)}</b>
    `;
    list.appendChild(item);
  });
}

if (bulkTextarea) {
  bulkTextarea.addEventListener('input', updateBulkPreview);
}

if (tabBulk && tabManual) {
  tabBulk.onclick = () => {
    tabBulk.classList.add('active');
    tabManual.classList.remove('active');
    paneBulk.style.display   = 'block';
    paneManual.style.display = 'none';

    // If bulk is empty, sync from manual rows
    if (!bulkTextarea.value.trim()) {
      const rows = Array.from(document.querySelectorAll('#testcase-list .testcase-row'));
      const serialized = rows
        .map(r => {
          const [inp, out] = r.querySelectorAll('textarea');
          return out.value.trim() ? `${inp.value.trim()}:${out.value.trim()};` : '';
        })
        .filter(Boolean)
        .join('\n');
      if (serialized) {
        bulkTextarea.value = serialized;
        updateBulkPreview();
      }
    }
  };

  tabManual.onclick = () => {
    tabManual.classList.add('active');
    tabBulk.classList.remove('active');
    paneManual.style.display = 'block';
    paneBulk.style.display   = 'none';

    // If bulk has text, populate into manual rows
    const parsed = parseTestcases(bulkTextarea.value);
    if (parsed.length > 0) {
      document.getElementById('testcase-list').innerHTML = '';
      parsed.forEach(tc => addTestcaseRow(tc.input, tc.output));
    }
  };
}

let tcCount = 0;
function addTestcaseRow(input = '', output = '') {
  tcCount++;
  const wrap = document.createElement('div');
  wrap.className = 'testcase-row';
  wrap.dataset.id = tcCount;
  wrap.innerHTML = `
    <textarea class="textarea" placeholder="Input">${escapeHtml(input)}</textarea>
    <textarea class="textarea" placeholder="Expected output">${escapeHtml(output)}</textarea>
    <button class="btn btn-outline btn-sm" type="button" title="Remove" style="height:38px;">✕</button>
  `;
  wrap.querySelector('button').onclick = () => wrap.remove();
  document.getElementById('testcase-list').appendChild(wrap);
}

addTestcaseRow();
addTestcaseRow();
document.getElementById('btn-add-testcase').onclick = () => addTestcaseRow();

/* ─────────────────────────────────────────────────────
   Create Room — Submit
───────────────────────────────────────────────────── */
document.getElementById('btn-create-submit').onclick = () => {
  const nickname    = document.getElementById('create-nickname').value.trim();
  const title       = document.getElementById('problem-title').value.trim();
  const description = document.getElementById('problem-description').value.trim();
  const duration    = parseInt(document.getElementById('duration-select').value, 10);
  const langs       = [];
  if (document.getElementById('lang-java').checked) langs.push('java');
  if (document.getElementById('lang-cpp').checked)  langs.push('cpp');

  let testcases = [];
  const bulkVal = bulkTextarea ? bulkTextarea.value.trim() : '';

  // If bulk tab is active or bulk has text, extract via regex system
  if (tabBulk && tabBulk.classList.contains('active') && bulkVal) {
    testcases = parseTestcases(bulkVal);
  } else {
    // Otherwise gather from manual rows
    const rows = Array.from(document.querySelectorAll('#testcase-list .testcase-row'));
    testcases = rows
      .map((r) => {
        const [inp, out] = r.querySelectorAll('textarea');
        return { input: inp.value.trim(), output: out.value.trim() };
      })
      .filter((tc) => tc.output !== '');

    // Fallback to bulk if manual rows were empty
    if (testcases.length === 0 && bulkVal) {
      testcases = parseTestcases(bulkVal);
    }
  }

  const errEl = document.getElementById('create-error');
  errEl.textContent = '';

  if (!nickname) return (errEl.textContent = 'Enter a nickname.');
  if (!title)    return (errEl.textContent = 'Give the problem a title.');
  if (testcases.length < 1) {
    return (errEl.textContent = 'Add at least one test case in "input:output;" format (e.g. 1 2:3;).');
  }
  if (langs.length < 1) return (errEl.textContent = 'Select at least one allowed language.');

  socket.emit(
    'create-room',
    { nickname, problem: { title, description, testcases }, durationMinutes: duration, languages: langs },
    (res) => {
      if (res.error) return (errEl.textContent = res.error);
      state.nickname = nickname;
      state.isHost   = true;
      state.room     = { code: res.code, languages: langs, durationMinutes: duration, problem: { title } };
      enterLobby(res.code, res.participants);
    }
  );
};

/* ─────────────────────────────────────────────────────
   Join Room — Submit
───────────────────────────────────────────────────── */
document.getElementById('btn-join-submit').onclick = () => {
  const code     = document.getElementById('join-code').value.trim().toUpperCase();
  const nickname = document.getElementById('join-nickname').value.trim();
  const errEl    = document.getElementById('join-error');
  errEl.textContent = '';

  if (!code)     return (errEl.textContent = 'Enter a room code.');
  if (!nickname) return (errEl.textContent = 'Enter a nickname.');

  socket.emit('join-room', { code, nickname }, (res) => {
    if (res.error) return (errEl.textContent = res.error);
    state.nickname = nickname;
    state.isHost   = false;
    state.room     = { code: res.code };
    enterLobby(res.code, res.participants);
  });
};

/* ─────────────────────────────────────────────────────
   Lobby
───────────────────────────────────────────────────── */
function enterLobby(code, participants) {
  document.getElementById('lobby-code').textContent = code;
  renderParticipants(participants);
  document.getElementById('lobby-host-controls').style.display = state.isHost ? 'block' : 'none';
  document.getElementById('lobby-guest-note').style.display    = state.isHost ? 'none'  : 'block';
  showView('view-lobby');
}

function renderParticipants(list) {
  const dotColors = ['#4EC99A', '#E8B84B', '#8F82FF', '#E0614A'];
  const wrap = document.getElementById('lobby-participants');
  wrap.innerHTML = '';
  list.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'participant-item';
    row.innerHTML = `
      <span>
        <span class="avatar-dot" style="background:${dotColors[i % dotColors.length]}"></span>
        ${escapeHtml(p.nickname)}
      </span>
      ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
    `;
    wrap.appendChild(row);
  });
}

document.getElementById('btn-copy-code').onclick = () => {
  navigator.clipboard.writeText(document.getElementById('lobby-code').textContent);
  toast('Room code copied');
};

document.getElementById('btn-start-match').onclick = () => {
  const errEl = document.getElementById('lobby-error');
  errEl.textContent = '';
  socket.emit('start-match', { code: state.room.code }, (res) => {
    if (res && res.error) errEl.textContent = res.error;
  });
};

socket.on('participant-joined', ({ participants }) => {
  renderParticipants(participants);
});

/* ─────────────────────────────────────────────────────
   Match Start
───────────────────────────────────────────────────── */
socket.on('match-started', ({ problem, durationMinutes, endTime }) => {
  state.room.problem   = problem;
  state.room.languages = problem.languages;
  state.room.endTime   = endTime;
  state.totalTests     = problem.totalTestcases;

  /* Problem panel */
  document.getElementById('match-title').textContent       = problem.title;
  document.getElementById('match-description').textContent = problem.description || 'No description provided.';

  /* Difficulty pill */
  const diffTag = document.getElementById('match-difficulty');
  if (diffTag) {
    const count = problem.totalTestcases || 1;
    if (count <= 2) {
      diffTag.textContent = 'Easy';
      diffTag.className   = 'difficulty-tag easy';
    } else if (count <= 4) {
      diffTag.textContent = 'Medium';
      diffTag.className   = 'difficulty-tag medium';
    } else {
      diffTag.textContent = 'Hard';
      diffTag.className   = 'difficulty-tag hard';
    }
  }

  /* Sample I/O */
  if (problem.sample) {
    document.getElementById('match-sample').style.display = 'block';
    document.getElementById('sample-input').textContent   = problem.sample.input  || '(none)';
    document.getElementById('sample-output').textContent  = problem.sample.output || '(none)';
  } else {
    document.getElementById('match-sample').style.display = 'none';
  }

  /* Language selector */
  const langSel = document.getElementById('editor-language');
  langSel.innerHTML = '';
  problem.languages.forEach((l) => {
    const opt = document.createElement('option');
    opt.value       = l;
    opt.textContent = l === 'java' ? 'Java' : 'C++';
    langSel.appendChild(opt);
  });

  const defaultLang = problem.languages[0] || 'java';
  langSel.value = defaultLang;

  langSel.onchange = () => {
    setEditorCode(STARTER[langSel.value] || '', langSel.value);
  };

  /* Reset Right Rail */
  document.getElementById('score-header-card').style.display  = 'none';
  document.getElementById('compile-error-card').style.display = 'none';
  document.getElementById('tc-cards-list').innerHTML           = '';
  document.getElementById('match-leaderboard').innerHTML       = '';
  document.getElementById('submit-status').textContent         = '';
  document.getElementById('opp-score-display').textContent     = '—';

  showView('view-match');
  setEditorCode(STARTER[defaultLang] || '', defaultLang);
  startTimer(endTime);
});

/* ─────────────────────────────────────────────────────
   Timer
───────────────────────────────────────────────────── */
function startTimer(endTime) {
  clearInterval(state.timerInterval);
  const el = document.getElementById('match-timer');

  function tick() {
    const remaining = Math.max(0, endTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    el.classList.toggle('low', remaining < 30000);
    if (remaining <= 0) clearInterval(state.timerInterval);
  }
  tick();
  state.timerInterval = setInterval(tick, 250);
}

/* ─────────────────────────────────────────────────────
   Fallback Tab Handling for Raw Textarea
───────────────────────────────────────────────────── */
document.getElementById('code-editor').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const el    = e.target;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    el.value = el.value.slice(0, start) + '    ' + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + 4;
  }
});

/* ─────────────────────────────────────────────────────
   Submit Code
───────────────────────────────────────────────────── */
document.getElementById('btn-submit-code').onclick = () => {
  const language = document.getElementById('editor-language').value;
  const source   = getEditorCode();
  const btn      = document.getElementById('btn-submit-code');
  const statusEl = document.getElementById('submit-status');

  if (!source.trim()) return toast('Write some code first.');

  btn.disabled         = true;
  statusEl.textContent = 'compiling…';

  socket.emit('submit-code', { code: state.room.code, language, source }, (res) => {
    btn.disabled         = false;
    statusEl.textContent = '';
    if (res.error) return toast(res.error);
    renderResult(res);
  });
};

/* ─────────────────────────────────────────────────────
   Render Submission Result
   - Aggregate score-header-card (stat-block style)
   - Expandable .tc-card stack (Memory-cards style)
   - In-place inline diff
───────────────────────────────────────────────────── */
function renderResult(res) {
  const compileCard = document.getElementById('compile-error-card');
  const compileLog  = document.getElementById('compile-error-log');
  const scoreCard   = document.getElementById('score-header-card');
  const scoreBig    = document.getElementById('score-big');
  const scoreDenom  = document.getElementById('score-denom');
  const scoreLabel  = document.getElementById('score-label');
  const tcList      = document.getElementById('tc-cards-list');

  /* ── Compile Error ── */
  if (!res.compiled) {
    compileCard.style.display = 'block';
    compileLog.textContent    = res.compileLog || 'Compilation failed.';
    scoreCard.style.display   = 'none';
    tcList.innerHTML          = '';
    return;
  }

  compileCard.style.display = 'none';

  /* ── Aggregate Score Stat Block ── */
  const allPassed = res.passedCount === res.total;
  scoreCard.style.display = 'block';
  scoreBig.textContent    = res.passedCount;
  scoreDenom.textContent  = `/${res.total}`;
  scoreLabel.textContent  = allPassed ? 'All passed' : 'Passed';
  scoreBig.style.color    = allPassed ? 'var(--mint)' : (res.passedCount > 0 ? 'var(--text-hi)' : 'var(--coral)');

  /* ── Per-Test Case Cards ── */
  tcList.innerHTML = '';

  const failedIndices = [];
  res.results.forEach((r, i) => {
    if (!r.passed) failedIndices.push(i);
  });

  if (failedIndices.length > 0) {
    scoreLabel.textContent = `Failed on Test ${failedIndices.map(idx => idx + 1).join(', ')}`;
    scoreLabel.style.color = 'var(--coral)';
  } else {
    scoreLabel.textContent = allPassed ? 'All passed' : 'Passed';
    scoreLabel.style.color = 'var(--text-low)';
  }

  res.results.forEach((r, i) => {
    const isFailed = !r.passed;
    const stateKey = r.timedOut ? 'timeout' : (r.passed ? 'pass' : 'fail');
    const pillIcon = r.passed ? '✓' : '✕';
    let pillText = 'PASSED';
    if (r.timedOut) {
      pillText = 'TIMEOUT';
    } else if (!r.passed) {
      pillText = (r.exitCode !== undefined && r.exitCode !== 0) ? 'RUNTIME ERROR' : 'FAILED';
    }

    const card = document.createElement('div');
    card.className = `tc-card ${r.passed ? 'pass' : 'fail'}`;
    card.dataset.index = i;

    /* Automatically expand failing test cases so the failure is immediately visible */
    if (isFailed) {
      card.classList.add('expanded');
    }

    /* Collapsed / Expanded Header */
    const header = document.createElement('div');
    header.className = 'tc-card-header';
    header.innerHTML = `
      <span class="tc-status-pill ${stateKey}">
        <span>${pillIcon}</span>
        ${pillText}
      </span>
      <span class="tc-name">Test ${i + 1} ${isFailed ? '<b style="color:var(--coral); font-weight:700; margin-left:4px;">(failing)</b>' : ''}</span>
      <span class="tc-runtime">${r.timedOut ? 'TLE' : (r.runtime !== undefined ? r.runtime + ' ms' : '')}</span>
      <span class="tc-chevron">▾</span>
    `;

    /* Expandable Body with full failure details */
    const body = document.createElement('div');
    body.className = 'tc-card-body';
    body.innerHTML = buildIOBody(r);

    card.appendChild(header);
    card.appendChild(body);

    /* In-place expand/collapse toggle */
    header.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    tcList.appendChild(card);
  });
}

function buildIOBody(r) {
  const sections = [];

  if (r.input !== undefined && r.input !== null && r.input !== '') {
    sections.push(`
      <div class="tc-io-block">
        <span class="label">Input</span>
        <pre>${escapeHtml(r.input)}</pre>
      </div>
    `);
  }

  if (r.expected !== undefined && r.expected !== null) {
    sections.push(`
      ${sections.length > 0 ? '<div class="tc-divider"></div>' : ''}
      <div class="tc-io-block">
        <span class="label">Expected Output</span>
        <pre>${escapeHtml(r.expected === '' ? '(empty)' : r.expected)}</pre>
      </div>
    `);
  }

  if (r.actual !== undefined && r.actual !== null) {
    sections.push(`
      ${sections.length > 0 ? '<div class="tc-divider"></div>' : ''}
      <div class="tc-io-block">
        <span class="label">Your Output ${!r.passed ? '(Inline Diff)' : ''}</span>
        <pre>${r.passed ? escapeHtml(r.actual === '' ? '(empty)' : r.actual) : buildInlineDiff(r.expected ?? '', r.actual)}</pre>
      </div>
    `);
  }

  if (r.error && r.error.trim()) {
    sections.push(`
      ${sections.length > 0 ? '<div class="tc-divider"></div>' : ''}
      <div class="tc-io-block">
        <span class="label" style="color:var(--coral);">Runtime Error / Stderr</span>
        <pre class="tc-error-pre">${escapeHtml(r.error)}</pre>
      </div>
    `);
  }

  if (r.timedOut) {
    sections.push(`
      ${sections.length > 0 ? '<div class="tc-divider"></div>' : ''}
      <p style="color:var(--amber); font-size:11.5px; margin:2px 0;">Execution exceeded the 5000ms time limit.</p>
    `);
  }

  if (sections.length === 0) {
    sections.push(r.passed
      ? `<p style="color:var(--mint); font-size:11.5px; margin:0;">Test case passed all assertions.</p>`
      : `<p style="color:var(--coral); font-size:11.5px; margin:0;">Test case failed.</p>`);
  }

  return sections.join('');
}

function buildInlineDiff(expected, actual) {
  if (!actual || actual.trim() === '') {
    return `<span class="diff-del">${escapeHtml(expected)}</span>\n<span style="color:var(--coral); font-style:italic;">(no output produced)</span>`;
  }
  const expLines = (expected || '').split('\n');
  const actLines = (actual || '').split('\n');
  const maxLen   = Math.max(expLines.length, actLines.length);
  const out      = [];

  for (let i = 0; i < maxLen; i++) {
    const e = expLines[i];
    const a = actLines[i];

    if (e === undefined) {
      out.push(`<span class="diff-ins">${escapeHtml(a)}</span>`);
    } else if (a === undefined) {
      out.push(`<span class="diff-del">${escapeHtml(e)}</span>`);
    } else if (e === a) {
      out.push(escapeHtml(a));
    } else {
      out.push(`<span class="diff-del">${escapeHtml(e)}</span>\n<span class="diff-ins">${escapeHtml(a)}</span>`);
    }
  }

  return out.join('\n');
}

/* ─────────────────────────────────────────────────────
   Leaderboard (Right Rail Card)
───────────────────────────────────────────────────── */
socket.on('leaderboard-update', ({ leaderboard }) => {
  renderLeaderboard(leaderboard, null);
  updateOppScore(leaderboard);
});

function renderLeaderboard(list, winnerId) {
  const wrap = document.getElementById('match-leaderboard');
  wrap.innerHTML = '';

  list.forEach((p, i) => {
    const isMe     = p.nickname === state.nickname;
    const isWinner = winnerId && p.id === winnerId;
    const row      = document.createElement('div');

    row.className = 'lb-row' + (isWinner ? ' winner' : '') + (isMe ? ' me' : '');
    row.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      <div class="lb-info">
        <span class="lb-name">${escapeHtml(p.nickname)}</span>
        <span class="lb-score">${p.passedCount}/${p.total} passed</span>
      </div>
      ${isMe ? '<span class="lb-you-badge">YOU</span>' : ''}
    `;
    wrap.appendChild(row);
  });
}

function updateOppScore(list) {
  const opp = list.find((p) => p.nickname !== state.nickname);
  const el  = document.getElementById('opp-score-display');
  if (opp) {
    el.textContent = `${opp.passedCount}/${opp.total}`;
  }
}

/* ─────────────────────────────────────────────────────
   Match End
───────────────────────────────────────────────────── */
socket.on('match-ended', ({ reason, leaderboard, winnerId, isDraw }) => {
  clearInterval(state.timerInterval);

  renderLeaderboard(leaderboard, winnerId);

  const iWon  = winnerId === socket.id;
  const badge = document.getElementById('result-badge');
  const title = document.getElementById('result-title');
  const sub   = document.getElementById('result-sub');

  if (isDraw) {
    badge.className = 'result-badge draw';
    badge.innerHTML = medalSvg('var(--amber)');
    title.textContent = "It's a draw";
    sub.textContent   = 'Time expired with a tied leaderboard.';
  } else if (iWon) {
    badge.className = 'result-badge win';
    badge.innerHTML = medalSvg('var(--mint)');
    title.textContent = 'You won';
    sub.textContent   = reason === 'cleared'
      ? 'You cleared every test case first.'
      : 'Time expired — you led the board.';
  } else {
    badge.className = 'result-badge lose';
    badge.innerHTML = medalSvg('var(--coral)');
    title.textContent = 'You lost';
    const winner = leaderboard.find((p) => p.id === winnerId);
    sub.textContent = winner ? `${escapeHtml(winner.nickname)} took the round.` : 'Better luck next match.';
  }

  /* Final standings board */
  const board = document.getElementById('final-board');
  board.innerHTML = '<span class="label" style="margin-bottom:12px; display:block;">Final Standings</span>';

  leaderboard.forEach((p, i) => {
    const isWinner = p.id === winnerId;
    const isMe     = p.nickname === state.nickname;
    const row      = document.createElement('div');
    row.className  = 'lb-row' + (isWinner ? ' winner' : '') + (isMe ? ' me' : '');
    row.innerHTML  = `
      <span class="lb-rank">${i + 1}</span>
      <div class="lb-info">
        <span class="lb-name">${escapeHtml(p.nickname)}</span>
        <span class="lb-score">${p.passedCount}/${p.total} passed</span>
      </div>
      ${isMe ? '<span class="lb-you-badge">YOU</span>' : ''}
    `;
    board.appendChild(row);
  });

  showView('view-result');
});

/* ─────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────── */
function medalSvg(color) {
  return `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <circle cx="20" cy="20" r="18" stroke="${color}" stroke-width="2"/>
    <path d="M12 21l6 6 10-12" stroke="${color}" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}
