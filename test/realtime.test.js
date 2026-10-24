const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createTriviaServer } = require('../server');
const trivia = {
  demo: { title: 'Demo', subcategories: { general: { title: 'General', questions: [
    { points: 100, q: 'Q1', options: ['A', 'B'], correct: 0 },
    { points: 200, q: 'Q2', options: ['A', 'B'], correct: 1 }
  ] } } }
};

function connect(url) {
  return new Promise((resolve, reject) => {
    const client = createClient(url, { transports: ['websocket'], forceNew: true });
    client.once('connect', () => resolve(client)); client.once('connect_error', reject);
  });
}
function ack(socket, event, payload) { return new Promise(resolve => socket.emit(event, payload, resolve)); }
function once(socket, event) { return new Promise(resolve => socket.once(event, resolve)); }

test('Socket.IO mantiene privacidad, rota el turno y recupera una reconexión', async t => {
  const { httpServer, io, rooms } = createTriviaServer({ trivia });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const a = await connect(url); const b = await connect(url); const spectator = await connect(url); clients.push(a, b, spectator);
  const aJoin = await ack(a, 'room:create', { code: 'REAL', name: 'A' });
  const bJoin = await ack(b, 'room:join', { code: 'REAL', name: 'B', role: 'jugador' });
  const spectatorJoin = await ack(spectator, 'room:join', { code: 'REAL', name: 'S', role: 'espectador' });
  assert.equal(spectatorJoin.state.players.length, 2);
  await ack(a, 'category:select', { categoryKey: 'demo' });

  const opened = once(spectator, 'question:opened');
  await ack(a, 'question:select', { subKey: 'general', qIndex: 0 });
  const question = await opened;
  assert.equal(JSON.stringify(question).includes('correct'), false);

  const resultEvent = once(spectator, 'answer:result');
  const passedEvent = once(spectator, 'question:passed');
  const response = await ack(a, 'answer:submit', { answer: 1 });
  const result = await resultEvent; const passed = await passedEvent;
  assert.equal(response.ok, true); assert.deepEqual(Object.keys(result).sort(), ['correct', 'playerId', 'playerName']);
  assert.equal(result.correct, false); assert.equal(JSON.stringify(passed).includes('correct'), false);

  b.disconnect();
  const b2 = await connect(url); clients.push(b2);
  const recovered = await ack(b2, 'room:rejoin', { code: 'REAL', participantId: bJoin.participantId, reconnectToken: bJoin.reconnectToken });
  assert.equal(recovered.state.turnPlayerId, bJoin.participantId);
  assert.equal(recovered.state.activeQuestion.qIndex, 0);
  assert.equal(aJoin.state.catalog.demo.subcategories.general.questions[0].correct, undefined);
});
