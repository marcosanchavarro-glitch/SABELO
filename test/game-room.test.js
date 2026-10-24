const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../lib/game-room');

const trivia = {
  demo: { title: 'Demo', subcategories: { general: { title: 'General', questions: [
    { points: 100, q: 'Q1', options: ['A', 'B'], correct: 0 },
    { points: 200, q: 'Q2', options: ['A', 'B'], correct: 1 }
  ] } } }
};

function roomWithPlayers(count = 4) {
  const room = game.createRoom({ code: 'TEST', hostSocketId: 'socket-a', hostName: 'A' });
  for (let index = 1; index < count; index += 1) room.players.push(game.createParticipant(`socket-${index}`, String.fromCharCode(65 + index), 'jugador'));
  game.selectCategory(room, 'demo', trivia);
  return room;
}

test('una respuesta correcta avanza al siguiente jugador', () => {
  const room = roomWithPlayers(2); const a = room.players[0]; const b = room.players[1];
  game.selectQuestion(room, a.id, 'general', 0, trivia, 0);
  const result = game.answer(room, a.id, 0, trivia, 1);
  assert.equal(result.correct, true); assert.equal(a.score, 100); assert.equal(game.currentPlayer(room).id, b.id);
});

test('dos respuestas incorrectas rotan A → B → C y una correcta continúa a D', () => {
  const room = roomWithPlayers(); const [a, b, c, d] = room.players;
  game.selectQuestion(room, a.id, 'general', 0, trivia, 0);
  assert.equal(game.answer(room, a.id, 1, trivia, 1).passed, true);
  assert.equal(game.currentPlayer(room).id, b.id);
  assert.equal(game.answer(room, b.id, 1, trivia, 2).passed, true);
  assert.equal(game.currentPlayer(room).id, c.id);
  assert.equal(game.answer(room, c.id, 0, trivia, 3).correct, true);
  assert.equal(game.currentPlayer(room).id, d.id);
});

test('el último jugador vuelve al primero y una respuesta duplicada no avanza dos veces', () => {
  const room = roomWithPlayers(2); const [a, b] = room.players;
  game.selectQuestion(room, a.id, 'general', 0, trivia, 0);
  game.answer(room, a.id, 1, trivia, 1);
  const duplicate = game.answer(room, a.id, 1, trivia, 2);
  assert.equal(duplicate.ok, false); assert.equal(game.currentPlayer(room).id, b.id);
  game.answer(room, b.id, 1, trivia, 3);
  assert.equal(game.currentPlayer(room).id, a.id);
});

test('dos solicitudes simultáneas del mismo jugador solo aceptan una transición', async () => {
  const room = roomWithPlayers(2); const [a, b] = room.players;
  game.selectQuestion(room, a.id, 'general', 0, trivia, 0);
  const [first, second] = await Promise.all([Promise.resolve(game.answer(room, a.id, 1, trivia, 1)), Promise.resolve(game.answer(room, a.id, 1, trivia, 1))]);
  assert.equal(first.ok, true); assert.equal(second.ok, false); assert.equal(game.currentPlayer(room).id, b.id);
});

test('el estado público y la pregunta enviada no incluyen soluciones', () => {
  const room = roomWithPlayers(2); const [a] = room.players;
  const state = game.publicState(room, trivia);
  game.selectQuestion(room, a.id, 'general', 0, trivia, 0);
  const question = game.publicQuestion(room.activeQuestion, trivia);
  assert.equal(JSON.stringify(state).includes('correct'), false);
  assert.equal(JSON.stringify(question).includes('correct'), false);
  assert.equal(question.question.options.length, 2);
});

test('al finalizar no se generan turnos adicionales', () => {
  const room = roomWithPlayers(1); const [a] = room.players;
  game.selectQuestion(room, a.id, 'general', 0, trivia, 0); game.answer(room, a.id, 0, trivia, 1);
  game.selectQuestion(room, a.id, 'general', 1, trivia, 2); const result = game.answer(room, a.id, 1, trivia, 3);
  assert.equal(result.finished.finishedGame, true); assert.equal(room.matchStatus, 'finished');
  assert.equal(game.selectQuestion(room, a.id, 'general', 0, trivia, 4), null);
});

module.exports = { trivia };
