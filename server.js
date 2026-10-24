const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const game = require('./lib/game-room');
const team = require('./lib/team-duel');
const privateTrivia = require('./data/trivia-private');
const tutorialQuestions = require('./data/tutorial-private');

const DEFAULT_LIMITS = Object.freeze({
  maxRooms: 100,
  maxPlayers: 12,
  maxSpectators: 50,
  maxConnections: 150,
  maxEventsPerWindow: 30,
  eventWindowMs: 10_000,
  maxRoomCreatesPerWindow: 3,
  roomCreateWindowMs: 60_000,
  roomIdleMs: 10 * 60_000,
  maxMessageBytes: 8_192
});
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function hasOnly(payload, keys) { return Object.keys(payload).every(key => keys.includes(key)); }
function text(value, maxLength) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null; }
function roomCode(value) { const code = text(value, 20)?.toUpperCase(); return code && /^[A-Z0-9-]{6,20}$/.test(code) ? code : null; }
function identifier(value) { return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value) ? value : null; }
function generateRoomCode() {
  const bytes = randomBytes(8);
  return `SABELO-${[...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')}`;
}

function createTriviaServer({ trivia = privateTrivia, tutorial = tutorialQuestions, limits: suppliedLimits = {}, allowedOrigins } = {}) {
  const limits = { ...DEFAULT_LIMITS, ...suppliedLimits };
  const app = express();
  const httpServer = createServer(app);
  const configuredOrigins = allowedOrigins || (process.env.ALLOWED_ORIGINS || 'https://sabelo.onrender.com,http://localhost:3000').split(',').map(origin => origin.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    maxHttpBufferSize: limits.maxMessageBytes,
    cors: { origin: (origin, callback) => callback(null, !origin || configuredOrigins.includes(origin)), methods: ['GET', 'POST'] }
  });
  const rooms = new Map();
  const connectedSockets = new Set();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.set({
      'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    if (request.secure) response.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  });
  app.use(express.static(path.join(__dirname, 'public')));

  const cleanExpiredRooms = (now = Date.now()) => {
    for (const [code, room] of rooms) {
      if (room.emptySince && now - room.emptySince >= limits.roomIdleMs) {
        clearTimeout(room.timer); rooms.delete(code);
      }
    }
  };
  const cleanupTimer = setInterval(cleanExpiredRooms, Math.min(limits.roomIdleMs, 60_000));
  cleanupTimer.unref();
  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin && !configuredOrigins.includes(origin)) return next(new Error('Origen no permitido.'));
    if (connectedSockets.size >= limits.maxConnections) return next(new Error('Servidor ocupado. Intentá nuevamente más tarde.'));
    next();
  });

  const state = room => ({ ...game.publicState(room, trivia), teamDuel: team.publicDuel(room) });
  const emitState = room => io.to(room.code).emit('room:state', state(room));
  const bindSocket = (socket, room, participant) => {
    // Un mismo socket solo puede representar una identidad/sala a la vez. Esto
    // evita que una restauración previa siga recibiendo eventos tras crear o
    // unirse a otra sala desde la misma pestaña.
    if (socket.data.roomCode && socket.data.roomCode !== room.code) socket.leave(socket.data.roomCode);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participant.id;
    socket.data.role = participant.role;
    room.emptySince = null;
  };
  const revokeCurrentIdentity = (socket, nextRoomCode) => {
    const previousRoom = rooms.get(socket.data.roomCode);
    if (!previousRoom || previousRoom.code === nextRoomCode) return;
    const previous = [...previousRoom.players, ...previousRoom.spectators]
      .find(item => item.id === socket.data.participantId && item.socketId === socket.id);
    // Solo la identidad que todavía pertenece a este socket se invalida. Una
    // pestaña reemplazada no puede revocar la sesión vigente de otra pestaña.
    if (previous) {
      previous.token = null;
      previous.tokenExpiresAt = 0;
      previous.socketId = null;
      previous.connected = false;
      if (![...previousRoom.players, ...previousRoom.spectators].some(item => item.connected)) previousRoom.emptySince = Date.now();
      emitState(previousRoom);
    }
    socket.leave(previousRoom.code);
    socket.data.roomCode = null;
    socket.data.participantId = null;
    socket.data.role = null;
  };
  const eventAllowed = (socket, now = Date.now()) => {
    const recent = (socket.data.events || []).filter(item => now - item < limits.eventWindowMs);
    if (recent.length >= limits.maxEventsPerWindow) return false;
    recent.push(now); socket.data.events = recent; return true;
  };
  const createAllowed = (socket, now = Date.now()) => {
    const recent = (socket.data.roomCreates || []).filter(item => now - item < limits.roomCreateWindowMs);
    if (recent.length >= limits.maxRoomCreatesPerWindow) return false;
    recent.push(now); socket.data.roomCreates = recent; return true;
  };
  const receive = (socket, event, handler) => socket.on(event, (...args) => {
    const payload = args[0]; const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : () => {};
    if (!eventAllowed(socket)) return callback({ error: 'Demasiadas acciones seguidas. Intentá nuevamente en unos segundos.' });
    if (!isPlainObject(payload)) return callback({ error: 'Datos de la solicitud inválidos.' });
    try { handler(payload, callback); } catch { callback({ error: 'No se pudo procesar la acción.' }); }
  });
  const getRoomAndActor = socket => {
    const room = rooms.get(socket.data.roomCode);
    const actor = room && [...room.players, ...room.spectators].find(item => item.id === socket.data.participantId);
    if (!room || !actor || actor.socketId !== socket.id || !actor.connected) return {};
    return { room, actor };
  };
  const closeQuestion = (room, reason) => {
    if (!room.activeQuestion) return;
    clearTimeout(room.timer);
    const player = game.currentPlayer(room);
    const result = game.timeout(room, trivia);
    if (!result) return;
    // El resultado público nunca incluye la opción elegida ni la solución.
    io.to(room.code).emit('answer:result', { playerId: player.id, playerName: player.name, status: 'timeout' });
    emitState(room);
    if (result.rebound) {
      io.to(room.code).emit('question:passed', game.publicQuestion(result.activeQuestion, trivia));
      armTimer(room);
      return;
    }
    io.to(room.code).emit('question:closed', { reason });
    if (result.finished?.tutorial) io.to(room.code).emit('tutorial:step-complete', { mode: 'individual', complete: Boolean(result.finished.tutorialComplete) });
    if (result.finished?.finishedGame) io.to(room.code).emit('game:finished', { podium: game.podium(room) });
  };
  const armTimer = room => {
    clearTimeout(room.timer);
    const endsAt = room.activeQuestion.endsAt;
    room.timer = setTimeout(() => {
      if (room.activeQuestion?.endsAt === endsAt) closeQuestion(room, 'Tiempo agotado');
    }, Math.max(0, endsAt - Date.now()));
  };
  const emitTeamTurn = room => io.to(room.code).emit('team:turn', { duel: team.publicDuel(room), question: team.publicQuestion(room, trivia) });
  const armTeamTimer = room => {
    clearTimeout(room.timer); const endsAt = room.teamDuel.activeTurn.endsAt;
    room.timer = setTimeout(() => {
      if (room.teamDuel?.activeTurn?.endsAt !== endsAt) return;
      const responderId = room.teamDuel.activeTurn.responderId;
      const outcome = team.timeout(room, trivia);
      if (!outcome) return;
      io.to(room.code).emit('team:result', { responderId, status: 'timeout', rebound: Boolean(outcome.rebound) });
      emitState(room);
      if (outcome.tutorial) io.to(room.code).emit('tutorial:step-complete', { mode: 'team', complete: Boolean(outcome.tutorialComplete) });
      else if (outcome.finished) io.to(room.code).emit('team:finished', team.publicDuel(room)); else { emitTeamTurn(room); armTeamTimer(room); }
    }, Math.max(0, endsAt - Date.now()));
  };

  io.on('connection', socket => {
    connectedSockets.add(socket.id);

    receive(socket, 'room:create', (payload, callback) => {
      if (!hasOnly(payload, ['name'])) return callback({ error: 'Datos de ingreso inválidos.' });
      const name = text(payload.name, 20);
      if (!name) return callback({ error: 'Ingresá un alias válido.' });
      if (!createAllowed(socket)) return callback({ error: 'Alcanzaste el límite temporal de creación de salas.' });
      cleanExpiredRooms();
      if (rooms.size >= limits.maxRooms) return callback({ error: 'No se pueden crear más salas en este momento.' });
      let code = generateRoomCode(); let attempts = 0;
      while (rooms.has(code) && attempts++ < 10) code = generateRoomCode();
      if (rooms.has(code)) return callback({ error: 'No se pudo generar una sala. Intentá nuevamente.' });
      const room = game.createRoom({ code, hostSocketId: socket.id, hostName: name });
      // Todas las validaciones ya pasaron: recién ahora se revoca la identidad
      // anterior para no perderla si la nueva creación falla.
      revokeCurrentIdentity(socket, code); rooms.set(code, room); bindSocket(socket, room, room.players[0]);
      callback({ ok: true, isHost: true, participantId: room.players[0].id, reconnectToken: room.players[0].token, state: state(room) });
      emitState(room);
    });

    receive(socket, 'room:join', (payload, callback) => {
      if (!hasOnly(payload, ['code', 'name', 'role'])) return callback({ error: 'Datos de ingreso inválidos.' });
      const code = roomCode(payload.code); const name = text(payload.name, 20); const role = payload.role;
      const room = rooms.get(code);
      if (!room) return callback({ error: 'La sala no existe. Pedile el código al anfitrión.' });
      if (socket.data.roomCode === code && socket.data.participantId) return callback({ error: 'Ya estás conectado a esta sala.' });
      if (!name || !['jugador', 'espectador'].includes(role)) return callback({ error: 'Datos de ingreso inválidos.' });
      if (role === 'jugador' && (room.tutorial || room.teamDuel?.tutorial || room.categoryKey || room.teamDuel?.status === 'playing')) return callback({ error: 'La partida ya comenzó; los jugadores deben ingresar antes de la Ronda 0.' });
      if (role === 'jugador' && room.players.length >= limits.maxPlayers) return callback({ error: 'La sala alcanzó el máximo de jugadores.' });
      if (role === 'espectador' && room.spectators.length >= limits.maxSpectators) return callback({ error: 'La sala alcanzó el máximo de espectadores.' });
      const participant = game.createParticipant(socket.id, name, role);
      // La unión quedó autorizada y hay cupo: el cambio de identidad es seguro.
      revokeCurrentIdentity(socket, room.code); (role === 'jugador' ? room.players : room.spectators).push(participant);
      bindSocket(socket, room, participant);
      callback({ ok: true, isHost: room.hostId === participant.id, participantId: participant.id, reconnectToken: participant.token, state: state(room) });
      emitState(room);
      if (room.activeQuestion) socket.emit('question:opened', game.publicQuestion(room.activeQuestion, trivia));
      if (['playing', 'tutorial'].includes(room.teamDuel?.status)) socket.emit('team:turn', { duel: team.publicDuel(room), question: team.publicQuestion(room, trivia) });
    });

    receive(socket, 'room:rejoin', (payload, callback) => {
      if (!hasOnly(payload, ['code', 'participantId', 'reconnectToken'])) return callback({ error: 'No se pudo recuperar tu sesión.' });
      const code = roomCode(payload.code); const participantId = identifier(payload.participantId); const reconnectToken = identifier(payload.reconnectToken);
      const room = rooms.get(code);
      const participant = room && [...room.players, ...room.spectators].find(item => (
        item.id === participantId
        && item.token === reconnectToken
        && Number.isFinite(item.tokenExpiresAt)
        && item.tokenExpiresAt > Date.now()
      ));
      if (!room || !participant) return callback({ error: 'No se pudo recuperar tu sesión.' });
      // Un token de reconexión se usa una sola vez. El socket vigente es la única
      // conexión que puede actuar como este participante.
      game.rotateReconnectToken(participant);
      participant.socketId = socket.id; participant.connected = true; bindSocket(socket, room, participant);
      callback({ ok: true, isHost: room.hostId === participant.id, participantId: participant.id, reconnectToken: participant.token, state: state(room) });
      emitState(room);
      if (room.activeQuestion) socket.emit('question:opened', game.publicQuestion(room.activeQuestion, trivia));
      if (['playing', 'tutorial'].includes(room.teamDuel?.status)) socket.emit('team:turn', { duel: team.publicDuel(room), question: team.publicQuestion(room, trivia) });
    });

    receive(socket, 'room:leave', (payload, callback) => {
      if (!hasOnly(payload, [])) return callback({ error: 'Datos de la solicitud inválidos.' });
      const { room, actor } = getRoomAndActor(socket);
      if (!room || !actor) return callback({ error: 'No hay una sesión activa para cerrar.' });
      const collection = actor.role === 'espectador' ? room.spectators : room.players;
      collection.splice(collection.findIndex(item => item.id === actor.id), 1);
      actor.token = null; actor.tokenExpiresAt = 0; actor.connected = false;
      socket.leave(room.code); socket.data.roomCode = null; socket.data.participantId = null; socket.data.role = null;
      if (actor.id === room.hostId) {
        if (!room.players.length) {
          clearTimeout(room.timer); rooms.delete(room.code); io.to(room.code).emit('room:closed');
        } else room.hostId = room.players[0].id;
      }
      if (rooms.has(room.code)) emitState(room);
      callback({ ok: true });
    });

    receive(socket, 'category:select', (payload, callback) => {
      if (!hasOnly(payload, ['categoryKey']) || !text(payload.categoryKey, 40)) return callback({ error: 'Categoría inválida.' });
      const categoryKey = payload.categoryKey;
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId || !game.selectCategory(room, categoryKey, trivia)) return callback({ error: 'Solo el anfitrión puede elegir una categoría disponible.' });
      const active = game.startTutorial(room, tutorial);
      emitState(room); if (active) { socket.to(room.code).emit('question:opened', game.publicQuestion(active, trivia)); socket.emit('question:opened', game.publicQuestion(active, trivia)); armTimer(room); }
      callback({ ok: true });
    });

    receive(socket, 'match:reset', (payload, callback) => {
      if (!hasOnly(payload, [])) return callback({ error: 'Datos de la solicitud inválidos.' });
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId) return callback({ error: 'Solo el anfitrión puede finalizar la partida.' });
      clearTimeout(room.timer); room.teamDuel = null; game.resetMatch(room); emitState(room); callback({ ok: true });
    });

    receive(socket, 'team:begin', (payload, callback) => {
      if (!hasOnly(payload, ['responseMode', 'isTest', 'captains']) || !['individual', 'captain-fixed', 'captain-rotating'].includes(payload.responseMode) || typeof payload.isTest !== 'boolean' || !isPlainObject(payload.captains || {})) return callback({ error: 'Configuración de duelo inválida.' });
      const { responseMode, isTest, captains = {} } = payload;
      if (!Object.keys(captains).every(key => ['blue', 'red'].includes(key)) || !Object.values(captains).every(value => value === undefined || identifier(value))) return callback({ error: 'Capitanes inválidos.' });
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId || room.categoryKey || room.activeQuestion || room.teamDuel?.status === 'playing') return callback({ error: 'No se puede iniciar el duelo ahora.' });
      const result = team.createDuel(room, trivia, { responseMode, isTest, captains });
      if (result.error) return callback({ error: result.error });
      if (!isTest) team.startTutorial(room, tutorial);
      emitState(room); emitTeamTurn(room); armTeamTimer(room); callback({ ok: true });
    });

    receive(socket, 'team:answer', (payload, callback) => {
      if (!hasOnly(payload, ['answer', 'questionId']) || !Number.isInteger(payload.answer) || !identifier(payload.questionId)) return callback({ error: 'Respuesta inválida.' });
      const { answer, questionId } = payload;
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.role !== 'jugador') return callback({ error: 'No podés responder este turno.' });
      if (!questionId || room.teamDuel?.activeTurn?.id !== questionId) return callback({ error: 'Esta pregunta ya no está vigente.' });
      const outcome = team.answer(room, actor.id, Number(answer), trivia);
      if (!outcome.ok) return callback({ error: outcome.error });
      clearTimeout(room.timer);
      io.to(room.code).emit('team:result', { responderId: actor.id, status: outcome.result, rebound: Boolean(outcome.rebound) });
      emitState(room);
      if (outcome.tutorial) { io.to(room.code).emit('tutorial:step-complete', { mode: 'team', complete: Boolean(outcome.tutorialComplete) }); }
      else if (outcome.finished) io.to(room.code).emit('team:finished', team.publicDuel(room)); else { emitTeamTurn(room); armTeamTimer(room); }
      callback({ ok: true });
    });

    receive(socket, 'tutorial:advance', (payload, callback) => {
      if (!hasOnly(payload, [])) return callback({ error: 'Datos de la solicitud inválidos.' });
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId) return callback({ error: 'Solo el anfitrión puede avanzar el tutorial.' });
      let active = null; let mode = 'individual';
      if (room.activeQuestion?.tutorial) active = game.advanceTutorial(room);
      else if (room.tutorial?.status === 'awaiting-host') active = game.advanceTutorial(room);
      else if (room.teamDuel?.tutorial?.status === 'awaiting-host') { active = team.advanceTutorial(room); mode = 'team'; }
      if (!active) return callback({ error: 'No hay una práctica pendiente para avanzar.' });
      emitState(room);
      if (mode === 'team') { emitTeamTurn(room); armTeamTimer(room); } else { io.to(room.code).emit('question:opened', game.publicQuestion(active, trivia)); armTimer(room); }
      callback({ ok: true });
    });

    receive(socket, 'tutorial:begin-official', (payload, callback) => {
      if (!hasOnly(payload, [])) return callback({ error: 'Datos de la solicitud inválidos.' });
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId) return callback({ error: 'Solo el anfitrión puede iniciar la competencia.' });
      clearTimeout(room.timer);
      if (game.beginOfficialMatch(room)) { emitState(room); return callback({ ok: true }); }
      const active = team.beginOfficialDuel(room, trivia);
      if (!active) return callback({ error: 'Completá la Ronda 0 antes de iniciar la competencia.' });
      emitState(room); emitTeamTurn(room); armTeamTimer(room); callback({ ok: true });
    });

    receive(socket, 'question:select', (payload, callback) => {
      if (!hasOnly(payload, ['subKey', 'qIndex']) || !text(payload.subKey, 40) || !Number.isInteger(payload.qIndex) || payload.qIndex < 0 || payload.qIndex > 500) return callback({ error: 'Pregunta inválida.' });
      const { subKey, qIndex } = payload;
      const { room, actor } = getRoomAndActor(socket);
      const activeQuestion = room && game.selectQuestion(room, actor.id, subKey, Number(qIndex), trivia);
      if (!activeQuestion) return callback({ error: 'No podés seleccionar esta pregunta ahora.' });
      armTimer(room); io.to(room.code).emit('question:opened', game.publicQuestion(activeQuestion, trivia)); emitState(room); callback({ ok: true });
    });

    receive(socket, 'answer:submit', (payload, callback) => {
      if (!hasOnly(payload, ['answer', 'questionId']) || !Number.isInteger(payload.answer) || !identifier(payload.questionId)) return callback({ error: 'Respuesta inválida.' });
      const { answer, questionId } = payload;
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.role !== 'jugador') return callback({ error: 'No podés responder esta pregunta.' });
      if (!questionId || room.activeQuestion?.id !== questionId) return callback({ error: 'Esta pregunta ya no está vigente.' });
      const outcome = game.answer(room, actor.id, Number(answer), trivia);
      if (!outcome.ok) return callback({ error: outcome.error });
      // Deliberadamente no se emiten la opción elegida ni el índice correcto.
      io.to(room.code).emit('answer:result', { playerId: actor.id, playerName: actor.name, status: outcome.result });
      if (outcome.finished) {
        clearTimeout(room.timer); io.to(room.code).emit('question:closed', { reason: outcome.result === 'correct' ? 'Respuesta registrada' : 'Nadie respondió correctamente' });
        emitState(room);
        if (outcome.finished.tutorial) io.to(room.code).emit('tutorial:step-complete', { mode: 'individual', complete: Boolean(outcome.finished.tutorialComplete) });
        if (outcome.finished.finishedGame) io.to(room.code).emit('game:finished', { podium: game.podium(room) });
      } else {
        armTimer(room); emitState(room); io.to(room.code).emit('question:passed', game.publicQuestion(outcome.activeQuestion, trivia));
      }
      callback({ ok: true });
    });

    socket.on('disconnect', () => {
      connectedSockets.delete(socket.id);
      const { room, actor } = getRoomAndActor(socket);
      if (!room || !actor) return;
      actor.connected = false;
      // Conserva jugador, puntos y posición para una reconexión autenticada.
      if (![...room.players, ...room.spectators].some(item => item.connected)) room.emptySince = Date.now();
      emitState(room);
    });
  });

  return { app, httpServer, io, rooms, trivia, cleanExpiredRooms, limits };
}

if (require.main === module) {
  const { httpServer } = createTriviaServer();
  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => console.log(`SABELO disponible en http://localhost:${port}`));
}

module.exports = { createTriviaServer };
