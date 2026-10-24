const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const path = require('node:path');
const game = require('./lib/game-room');
const team = require('./lib/team-duel');
const privateTrivia = require('./data/trivia-private');
const tutorialQuestions = require('./data/tutorial-private');

function createTriviaServer({ trivia = privateTrivia, tutorial = tutorialQuestions } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const rooms = new Map();
  app.use(express.static(path.join(__dirname, 'public')));

  const state = room => ({ ...game.publicState(room, trivia), teamDuel: team.publicDuel(room) });
  const emitState = room => io.to(room.code).emit('room:state', state(room));
  const bindSocket = (socket, room, participant) => {
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participant.id;
    socket.data.role = participant.role;
  };
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
    socket.on('room:create', ({ code, name }, callback = () => {}) => {
      code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 20);
      if (!code || !name) return callback({ error: 'Ingresá un código y un alias válidos.' });
      if (rooms.has(code)) return callback({ error: 'Ese código de sala ya existe.' });
      const room = game.createRoom({ code, hostSocketId: socket.id, hostName: name });
      rooms.set(code, room); bindSocket(socket, room, room.players[0]);
      callback({ ok: true, isHost: true, participantId: room.players[0].id, reconnectToken: room.players[0].token, state: state(room) });
      emitState(room);
    });

    socket.on('room:join', ({ code, name, role }, callback = () => {}) => {
      code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 20);
      const room = rooms.get(code);
      if (!room) return callback({ error: 'La sala no existe. Pedile el código al anfitrión.' });
      if (!name || !['jugador', 'espectador'].includes(role)) return callback({ error: 'Datos de ingreso inválidos.' });
      if (role === 'jugador' && (room.tutorial || room.teamDuel?.tutorial)) return callback({ error: 'El tutorial ya empezó; los jugadores deben ingresar antes de la Ronda 0.' });
      const participant = game.createParticipant(socket.id, name, role);
      (role === 'jugador' ? room.players : room.spectators).push(participant);
      bindSocket(socket, room, participant);
      callback({ ok: true, isHost: room.hostId === participant.id, participantId: participant.id, reconnectToken: participant.token, state: state(room) });
      emitState(room);
      if (room.activeQuestion) socket.emit('question:opened', game.publicQuestion(room.activeQuestion, trivia));
      if (['playing', 'tutorial'].includes(room.teamDuel?.status)) socket.emit('team:turn', { duel: team.publicDuel(room), question: team.publicQuestion(room, trivia) });
    });

    socket.on('room:rejoin', ({ code, participantId, reconnectToken }, callback = () => {}) => {
      const room = rooms.get(String(code || '').trim().toUpperCase());
      const participant = room && [...room.players, ...room.spectators].find(item => item.id === participantId && item.token === reconnectToken);
      if (!room || !participant) return callback({ error: 'No se pudo recuperar tu sesión.' });
      participant.socketId = socket.id; participant.connected = true; bindSocket(socket, room, participant);
      callback({ ok: true, isHost: room.hostId === participant.id, participantId: participant.id, reconnectToken: participant.token, state: state(room) });
      emitState(room);
      if (room.activeQuestion) socket.emit('question:opened', game.publicQuestion(room.activeQuestion, trivia));
      if (['playing', 'tutorial'].includes(room.teamDuel?.status)) socket.emit('team:turn', { duel: team.publicDuel(room), question: team.publicQuestion(room, trivia) });
    });

    socket.on('category:select', ({ categoryKey }, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId || !game.selectCategory(room, categoryKey, trivia)) return callback({ error: 'Solo el anfitrión puede elegir una categoría disponible.' });
      const active = game.startTutorial(room, tutorial);
      emitState(room); if (active) { socket.to(room.code).emit('question:opened', game.publicQuestion(active, trivia)); socket.emit('question:opened', game.publicQuestion(active, trivia)); armTimer(room); }
      callback({ ok: true });
    });

    socket.on('match:reset', (_, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId) return callback({ error: 'Solo el anfitrión puede finalizar la partida.' });
      clearTimeout(room.timer); room.teamDuel = null; game.resetMatch(room); emitState(room); callback({ ok: true });
    });

    socket.on('team:begin', ({ responseMode, isTest, captains }, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId || room.categoryKey || room.activeQuestion || room.teamDuel?.status === 'playing') return callback({ error: 'No se puede iniciar el duelo ahora.' });
      const result = team.createDuel(room, trivia, { responseMode, isTest, captains });
      if (result.error) return callback({ error: result.error });
      if (!isTest) team.startTutorial(room, tutorial);
      emitState(room); emitTeamTurn(room); armTeamTimer(room); callback({ ok: true });
    });

    socket.on('team:answer', ({ answer, questionId }, callback = () => {}) => {
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

    socket.on('tutorial:advance', (_, callback = () => {}) => {
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

    socket.on('tutorial:begin-official', (_, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId) return callback({ error: 'Solo el anfitrión puede iniciar la competencia.' });
      clearTimeout(room.timer);
      if (game.beginOfficialMatch(room)) { emitState(room); return callback({ ok: true }); }
      const active = team.beginOfficialDuel(room, trivia);
      if (!active) return callback({ error: 'Completá la Ronda 0 antes de iniciar la competencia.' });
      emitState(room); emitTeamTurn(room); armTeamTimer(room); callback({ ok: true });
    });

    socket.on('question:select', ({ subKey, qIndex }, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      const activeQuestion = room && game.selectQuestion(room, actor.id, subKey, Number(qIndex), trivia);
      if (!activeQuestion) return callback({ error: 'No podés seleccionar esta pregunta ahora.' });
      armTimer(room); io.to(room.code).emit('question:opened', game.publicQuestion(activeQuestion, trivia)); emitState(room); callback({ ok: true });
    });

    socket.on('answer:submit', ({ answer, questionId }, callback = () => {}) => {
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
      const { room, actor } = getRoomAndActor(socket);
      if (!room || !actor) return;
      actor.connected = false;
      // Conserva jugador, puntos y posición para una reconexión autenticada.
      emitState(room);
    });
  });

  return { app, httpServer, io, rooms, trivia };
}

if (require.main === module) {
  const { httpServer } = createTriviaServer();
  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => console.log(`SABELO disponible en http://localhost:${port}`));
}

module.exports = { createTriviaServer };
