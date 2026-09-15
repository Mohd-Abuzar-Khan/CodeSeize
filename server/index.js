const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { judge } = require('./judge');
const {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  publicParticipants,
  leaderboard,
} = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Landing page at root; the app itself lives at /index.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

function startMatch(room) {
  room.status = 'running';
  room.startTime = Date.now();
  room.endTime = room.startTime + room.durationMinutes * 60 * 1000;

  const publicProblem = {
    title: room.problem.title,
    description: room.problem.description,
    sample: room.problem.testcases[0]
      ? { input: room.problem.testcases[0].input, output: room.problem.testcases[0].output }
      : null,
    totalTestcases: room.problem.testcases.length,
    languages: room.languages,
  };

  io.to(room.code).emit('match-started', {
    problem: publicProblem,
    durationMinutes: room.durationMinutes,
    endTime: room.endTime,
  });

  room.timer = setTimeout(() => finishByTimeout(room), room.durationMinutes * 60 * 1000);
}

function finishByTimeout(room) {
  if (room.status !== 'running') return;
  room.status = 'finished';
  const board = leaderboard(room);
  const winner = board[0] || null;
  const isDraw = board.length > 1 && board[1] && board[1].passedCount === (winner ? winner.passedCount : -1);
  io.to(room.code).emit('match-ended', {
    reason: 'timeout',
    leaderboard: board,
    winnerId: isDraw ? null : winner && winner.id,
    isDraw,
  });
}

function finishByClear(room, winnerSocketId) {
  if (room.status !== 'running') return;
  room.status = 'finished';
  room.winnerSocketId = winnerSocketId;
  if (room.timer) clearTimeout(room.timer);
  const board = leaderboard(room);
  io.to(room.code).emit('match-ended', {
    reason: 'cleared',
    leaderboard: board,
    winnerId: winnerSocketId,
    isDraw: false,
  });
}

function parseTestcases(rawText) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) return [];
  const testcases = [];
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

io.on('connection', (socket) => {
  socket.on('create-room', ({ nickname, problem, durationMinutes, languages }, cb) => {
    try {
      if (problem && typeof problem.testcases === 'string') {
        problem.testcases = parseTestcases(problem.testcases);
      }
      if (!nickname || !problem || !problem.title || !Array.isArray(problem.testcases) || problem.testcases.length === 0) {
        return cb({ error: 'Missing nickname, problem title, or test cases.' });
      }
      if (!Array.isArray(languages) || languages.length === 0) {
        languages = ['java', 'cpp'];
      }
      const room = createRoom({
        hostSocketId: socket.id,
        hostNickname: nickname.trim().slice(0, 20),
        problem,
        durationMinutes: Math.min(Math.max(durationMinutes || 20, 3), 180),
        languages,
      });
      socket.join(room.code);
      cb({ code: room.code, participants: publicParticipants(room) });
    } catch (e) {
      cb({ error: 'Failed to create room.' });
    }
  });

  socket.on('join-room', ({ code, nickname }, cb) => {
    if (!nickname || !nickname.trim()) return cb({ error: 'Nickname required.' });
    const result = joinRoom(code, socket.id, nickname.trim().slice(0, 20));
    if (result.error) return cb({ error: result.error });
    socket.join(result.room.code);
    cb({ code: result.room.code, participants: publicParticipants(result.room) });
    io.to(result.room.code).emit('participant-joined', {
      participants: publicParticipants(result.room),
    });
  });

  socket.on('start-match', ({ code }, cb) => {
    const room = getRoom(code);
    if (!room) return cb && cb({ error: 'Room not found.' });
    if (room.hostSocketId !== socket.id) return cb && cb({ error: 'Only the host can start the match.' });
    if (room.status !== 'lobby') return cb && cb({ error: 'Match already started.' });
    if (room.participants.size < 2) return cb && cb({ error: 'Need at least 2 players to start.' });
    startMatch(room);
    cb && cb({ ok: true });
  });

  socket.on('submit-code', async ({ code, language, source }, cb) => {
    const room = getRoom(code);
    if (!room) return cb && cb({ error: 'Room not found.' });
    if (room.status !== 'running') return cb && cb({ error: 'Match is not running.' });
    if (!room.languages.includes(language)) return cb && cb({ error: 'Language not allowed in this room.' });
    const participant = room.participants.get(socket.id);
    if (!participant) return cb && cb({ error: 'You are not in this room.' });
    if (participant.finished) return cb && cb({ error: 'You already cleared all test cases.' });

    let result;
    try {
      result = await judge(language, source, room.problem.testcases);
    } catch (e) {
      return cb && cb({ error: 'Judge failed: ' + e.message });
    }

    // Room may have ended while judging (timeout race) — still report result to submitter
    participant.passedCount = Math.max(participant.passedCount, result.passedCount);

    const allPassed = result.compiled && result.passedCount === result.total;
    if (allPassed) {
      participant.finished = true;
      participant.finishTime = Date.now();
    }

    cb && cb({
      compiled: result.compiled,
      compileLog: result.compileLog,
      passedCount: result.passedCount,
      total: result.total,
      results: result.results.map((r) => ({
        passed: r.passed,
        timedOut: r.timedOut,
        runtime: r.runtime,
        input: r.input,
        expected: r.expected,
        actual: r.actual,
        error: r.error,
        exitCode: r.exitCode,
      })),
    });

    io.to(room.code).emit('leaderboard-update', { leaderboard: leaderboard(room) });

    if (allPassed && room.status === 'running') {
      finishByClear(room, socket.id);
    }
  });

  socket.on('leave-room', () => {
    const room = leaveRoom(socket.id);
    if (room) {
      io.to(room.code).emit('participant-joined', { participants: publicParticipants(room) });
    }
  });

  socket.on('disconnect', () => {
    const room = leaveRoom(socket.id);
    if (room) {
      io.to(room.code).emit('participant-joined', { participants: publicParticipants(room) });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CodeClash server running on http://localhost:${PORT}`));
