const rooms = new Map(); // code -> room

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom({ hostSocketId, hostNickname, problem, durationMinutes, languages }) {
  const code = generateCode();
  const room = {
    code,
    hostSocketId,
    status: 'lobby', // lobby | running | finished
    problem,
    durationMinutes,
    languages, // array subset of ['java','cpp']
    startTime: null,
    endTime: null,
    timer: null,
    participants: new Map(), // socketId -> { nickname, passedCount, total, finished, finishTime, best }
    winnerSocketId: null,
  };
  room.participants.set(hostSocketId, {
    nickname: hostNickname,
    passedCount: 0,
    total: problem.testcases.length,
    finished: false,
    finishTime: null,
  });
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get((code || '').toUpperCase());
}

function joinRoom(code, socketId, nickname) {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found.' };
  if (room.status !== 'lobby') return { error: 'Match already started.' };
  if (room.participants.size >= 8) return { error: 'Room is full.' };
  const taken = Array.from(room.participants.values()).some(
    (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
  );
  if (taken) return { error: 'Nickname already taken in this room.' };
  room.participants.set(socketId, {
    nickname,
    passedCount: 0,
    total: room.problem.testcases.length,
    finished: false,
    finishTime: null,
  });
  return { room };
}

function leaveRoom(socketId) {
  for (const room of rooms.values()) {
    if (room.participants.has(socketId)) {
      room.participants.delete(socketId);
      if (room.hostSocketId === socketId) {
        // promote another participant to host, or delete room if empty
        const next = room.participants.keys().next();
        if (!next.done) {
          room.hostSocketId = next.value;
        } else {
          if (room.timer) clearTimeout(room.timer);
          rooms.delete(room.code);
        }
      }
      return room;
    }
  }
  return null;
}

function publicParticipants(room) {
  return Array.from(room.participants.entries()).map(([id, p]) => ({
    id,
    nickname: p.nickname,
    passedCount: p.passedCount,
    total: p.total,
    finished: p.finished,
    isHost: id === room.hostSocketId,
  }));
}

function leaderboard(room) {
  return publicParticipants(room).sort((a, b) => {
    if (b.passedCount !== a.passedCount) return b.passedCount - a.passedCount;
    const pa = room.participants.get(a.id);
    const pb = room.participants.get(b.id);
    const ta = pa.finishTime || Infinity;
    const tb = pb.finishTime || Infinity;
    return ta - tb;
  });
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  publicParticipants,
  leaderboard,
};
