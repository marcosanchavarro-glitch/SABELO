const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = new Map();
app.use(express.static(path.join(__dirname, 'public')));

function loadTrivia() {
  const source = fs.readFileSync(path.join(__dirname, 'public', 'client.js'), 'utf8');
  const match = source.match(/const dbTrivia = (\{[\s\S]*?\r?\n\});\r?\n\r?\n\/\/ Navegación/);
  if (!match) throw new Error('No se pudo cargar la base de preguntas.');
  return Function(`"use strict"; return (${match[1]});`)();
}
const trivia = loadTrivia();

function publicState(room) {
  return { code: room.code, hostId: room.hostId, categoryKey: room.categoryKey, matchStatus: room.matchStatus,
    usedQuestions: [...room.usedQuestions], activeQuestion: room.activeQuestion && { categoryKey: room.activeQuestion.categoryKey, subKey: room.activeQuestion.subKey, qIndex: room.activeQuestion.qIndex, endsAt: room.activeQuestion.endsAt },
    players: room.players.map(({ id, name, score }) => ({ id, name, score })), spectators: room.spectators.map(({ name }) => name),
    turnPlayerId: room.players.length ? room.players[room.turnIndex % room.players.length].id : null };
}
function emitState(room) { io.to(room.code).emit('room:state', publicState(room)); }
function questionPayload(active) {
  const question = trivia[active.categoryKey].subcategories[active.subKey].questions[active.qIndex];
  return { ...active, question: { points: question.points, q: question.q, options: question.options } };
}
function questionCount(categoryKey) {
  return Object.values(trivia[categoryKey].subcategories).reduce((total, subcategory) => total + subcategory.questions.length, 0);
}
function podium(room) {
  return [...room.players].sort((a, b) => b.score - a.score).slice(0, 3).map(({ name, score }) => ({ name, score }));
}
function endQuestion(room, reason) {
  if (!room.activeQuestion) return;
  clearTimeout(room.timer);
  room.usedQuestions.add(`${room.activeQuestion.categoryKey}:${room.activeQuestion.subKey}:${room.activeQuestion.qIndex}`);
  room.activeQuestion = null;
  if (room.players.length) room.turnIndex = (room.turnIndex + 1) % room.players.length;
  if (room.usedQuestions.size >= questionCount(room.categoryKey)) room.matchStatus = 'finished';
  io.to(room.code).emit('question:closed', { reason }); emitState(room);
  if (room.matchStatus === 'finished') io.to(room.code).emit('game:finished', { podium: podium(room) });
}

io.on('connection', socket => {
  socket.on('room:create', ({ code, name }, callback) => {
    code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 20);
    if (!code || !name) return callback({ error: 'Ingresá un código y un alias válidos.' });
    if (rooms.has(code)) return callback({ error: 'Ese código de sala ya existe.' });
    const room = { code, hostId: socket.id, categoryKey: null, matchStatus: 'waiting', usedQuestions: new Set(), activeQuestion: null, timer: null, players: [{ id: socket.id, name, score: 0 }], spectators: [], turnIndex: 0 };
    rooms.set(code, room); socket.join(code); socket.data.roomCode = code; socket.data.role = 'jugador';
    callback({ ok: true, state: publicState(room), isHost: true }); emitState(room);
  });
  socket.on('room:join', ({ code, name, role }, callback) => {
    code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 20);
    const room = rooms.get(code);
    if (!room) return callback({ error: 'La sala no existe. Pedile el código al anfitrión.' });
    if (!name || !['jugador', 'espectador'].includes(role)) return callback({ error: 'Datos de ingreso inválidos.' });
    if (role === 'jugador') room.players.push({ id: socket.id, name, score: 0 }); else room.spectators.push({ id: socket.id, name });
    socket.join(code); socket.data.roomCode = code; socket.data.role = role;
    callback({ ok: true, state: publicState(room), isHost: room.hostId === socket.id }); emitState(room);
  });
  socket.on('category:select', ({ categoryKey }, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || !trivia[categoryKey]) return callback?.({ error: 'Solo el anfitrión puede elegir la categoría.' });
    if (room.categoryKey) return callback?.({ error: 'La categoría ya fue elegida para esta partida.' });
    room.categoryKey = categoryKey; room.matchStatus = 'playing'; room.usedQuestions.clear();
    room.players.forEach(player => { player.score = 0; }); emitState(room); callback?.({ ok: true });
  });
  socket.on('match:reset', (_, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return callback?.({ error: 'Solo el anfitrión puede salir de la partida.' });
    clearTimeout(room.timer); room.categoryKey = null; room.matchStatus = 'waiting'; room.activeQuestion = null;
    room.usedQuestions.clear(); room.turnIndex = 0; room.players.forEach(player => { player.score = 0; });
    emitState(room); callback?.({ ok: true });
  });
  socket.on('question:select', ({ subKey, qIndex }, callback) => {
    const room = rooms.get(socket.data.roomCode); const turnId = room?.players[room.turnIndex % room.players.length]?.id;
    const question = room && trivia[room.categoryKey]?.subcategories[subKey]?.questions[qIndex]; const key = `${room?.categoryKey}:${subKey}:${qIndex}`;
    if (!room || room.matchStatus !== 'playing' || room.activeQuestion || socket.id !== turnId || !question || room.usedQuestions.has(key)) return callback?.({ error: 'No podés seleccionar esta pregunta.' });
    room.activeQuestion = { categoryKey: room.categoryKey, subKey, qIndex, endsAt: Date.now() + 60000, attemptedPlayerIds: [] };
    room.timer = setTimeout(() => endQuestion(room, 'Tiempo agotado'), 60000);
    io.to(room.code).emit('question:opened', questionPayload(room.activeQuestion));
    emitState(room); callback?.({ ok: true });
  });
  socket.on('answer:submit', ({ answer }, callback) => {
    const room = rooms.get(socket.data.roomCode); const active = room?.activeQuestion; const turnId = room?.players[room.turnIndex % room.players.length]?.id;
    if (!room || !active || socket.id !== turnId) return callback?.({ error: 'No es tu turno para responder.' });
    const question = trivia[active.categoryKey].subcategories[active.subKey].questions[active.qIndex];
    if (!Number.isInteger(Number(answer)) || Number(answer) < 0 || Number(answer) >= question.options.length) return callback?.({ error: 'Respuesta inválida.' });
    const correct = Number(answer) === question.correct; const player = room.players.find(item => item.id === socket.id);
    if (correct) player.score += question.points;
    io.to(room.code).emit('answer:result', { answer: Number(answer), correctIndex: question.correct, correct, playerName: player.name });
    if (correct) { endQuestion(room, 'Respuesta correcta'); return callback?.({ ok: true }); }
    active.attemptedPlayerIds.push(socket.id);
    if (active.attemptedPlayerIds.length >= room.players.length) { endQuestion(room, 'Nadie respondió correctamente'); return callback?.({ ok: true }); }
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    active.endsAt = Date.now() + 60000; clearTimeout(room.timer);
    room.timer = setTimeout(() => endQuestion(room, 'Tiempo agotado'), 60000);
    emitState(room); io.to(room.code).emit('question:passed', questionPayload(active)); callback?.({ ok: true });
  });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode); if (!room) return;
    room.players = room.players.filter(item => item.id !== socket.id); room.spectators = room.spectators.filter(item => item.id !== socket.id);
    if (room.hostId === socket.id && room.players.length) room.hostId = room.players[0].id;
    if (!room.players.length && !room.spectators.length) { clearTimeout(room.timer); rooms.delete(room.code); return; }
    room.turnIndex %= Math.max(room.players.length, 1); emitState(room);
  });
});
const port = process.env.PORT || 3000;
httpServer.listen(port, () => console.log(`SABELO disponible en http://localhost:${port}`));
