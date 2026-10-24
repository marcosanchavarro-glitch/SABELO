const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const path = require('node:path');
const game = require('./lib/game-room');
const privateTrivia = require('./data/trivia-private');

function createTriviaServer({ trivia = privateTrivia } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const rooms = new Map();
  app.use(express.static(path.join(__dirname, 'public')));

  const emitState = room => io.to(room.code).emit('room:state', game.publicState(room, trivia));
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
    const result = game.timeout(room, trivia);
    io.to(room.code).emit('question:closed', { reason });
    emitState(room);
    if (result?.finishedGame) io.to(room.code).emit('game:finished', { podium: game.podium(room) });
  };
  const armTimer = room => {
    clearTimeout(room.timer);
    const endsAt = room.activeQuestion.endsAt;
    room.timer = setTimeout(() => {
      if (room.activeQuestion?.endsAt === endsAt) closeQuestion(room, 'Tiempo agotado');
    }, Math.max(0, endsAt - Date.now()));
  };

  io.on('connection', socket => {
    socket.on('room:create', ({ code, name }, callback = () => {}) => {
      code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 20);
      if (!code || !name) return callback({ error: 'Ingresá un código y un alias válidos.' });
      if (rooms.has(code)) return callback({ error: 'Ese código de sala ya existe.' });
      const room = game.createRoom({ code, hostSocketId: socket.id, hostName: name });
      rooms.set(code, room); bindSocket(socket, room, room.players[0]);
      callback({ ok: true, isHost: true, participantId: room.players[0].id, reconnectToken: room.players[0].token, state: game.publicState(room, trivia) });
      emitState(room);
    });

    socket.on('room:join', ({ code, name, role }, callback = () => {}) => {
      code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 20);
      const room = rooms.get(code);
      if (!room) return callback({ error: 'La sala no existe. Pedile el código al anfitrión.' });
      if (!name || !['jugador', 'espectador'].includes(role)) return callback({ error: 'Datos de ingreso inválidos.' });
      const participant = game.createParticipant(socket.id, name, role);
      (role === 'jugador' ? room.players : room.spectators).push(participant);
      bindSocket(socket, room, participant);
      callback({ ok: true, isHost: room.hostId === participant.id, participantId: participant.id, reconnectToken: participant.token, state: game.publicState(room, trivia) });
      emitState(room);
    });

    socket.on('room:rejoin', ({ code, participantId, reconnectToken }, callback = () => {}) => {
      const room = rooms.get(String(code || '').trim().toUpperCase());
      const participant = room && [...room.players, ...room.spectators].find(item => item.id === participantId && item.token === reconnectToken);
      if (!room || !participant) return callback({ error: 'No se pudo recuperar tu sesión.' });
      participant.socketId = socket.id; participant.connected = true; bindSocket(socket, room, participant);
      callback({ ok: true, isHost: room.hostId === participant.id, participantId: participant.id, reconnectToken: participant.token, state: game.publicState(room, trivia) });
      emitState(room);
      if (room.activeQuestion) socket.emit('question:opened', game.publicQuestion(room.activeQuestion, trivia));
    });

    socket.on('category:select', ({ categoryKey }, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId || !game.selectCategory(room, categoryKey, trivia)) return callback({ error: 'Solo el anfitrión puede elegir una categoría disponible.' });
      emitState(room); callback({ ok: true });
    });

    socket.on('match:reset', (_, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.id !== room.hostId) return callback({ error: 'Solo el anfitrión puede finalizar la partida.' });
      clearTimeout(room.timer); game.resetMatch(room); emitState(room); callback({ ok: true });
    });

    socket.on('question:select', ({ subKey, qIndex }, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      const activeQuestion = room && game.selectQuestion(room, actor.id, subKey, Number(qIndex), trivia);
      if (!activeQuestion) return callback({ error: 'No podés seleccionar esta pregunta ahora.' });
      armTimer(room); io.to(room.code).emit('question:opened', game.publicQuestion(activeQuestion, trivia)); emitState(room); callback({ ok: true });
    });

    socket.on('answer:submit', ({ answer }, callback = () => {}) => {
      const { room, actor } = getRoomAndActor(socket);
      if (!room || actor.role !== 'jugador') return callback({ error: 'No podés responder esta pregunta.' });
      const outcome = game.answer(room, actor.id, Number(answer), trivia);
      if (!outcome.ok) return callback({ error: outcome.error });
      // Deliberadamente no se emiten la opción elegida ni el índice correcto.
      io.to(room.code).emit('answer:result', { playerId: actor.id, playerName: actor.name, correct: outcome.correct });
      if (outcome.finished) {
        clearTimeout(room.timer); io.to(room.code).emit('question:closed', { reason: outcome.correct ? 'Respuesta registrada' : 'Nadie respondió correctamente' });
        emitState(room);
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
