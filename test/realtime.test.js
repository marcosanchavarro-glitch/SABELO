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
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const a = await connect(url); const b = await connect(url); const spectator = await connect(url); clients.push(a, b, spectator);
  const aJoin = await ack(a, 'room:create', { name: 'A', mode: 'individual', responseMode: null }); const code = aJoin.state.code;
  const bJoin = await ack(b, 'room:join', { code, name: 'B', role: 'jugador' });
  const spectatorJoin = await ack(spectator, 'room:join', { code, name: 'S', role: 'espectador' });
  assert.equal(spectatorJoin.state.players.length, 2);
  await ack(a, 'category:select', { categoryKey: 'demo' });

  const opened = once(spectator, 'question:opened');
  await ack(a, 'question:select', { subKey: 'general', qIndex: 0 });
  const question = await opened;
  assert.equal(JSON.stringify(question).includes('correct'), false);

  const resultEvent = once(spectator, 'answer:result');
  const passedEvent = once(spectator, 'question:passed');
  const response = await ack(a, 'answer:submit', { answer: 1, questionId: question.id });
  const result = await resultEvent; const passed = await passedEvent;
  assert.equal(response.ok, true); assert.deepEqual(Object.keys(result).sort(), ['playerId', 'playerName', 'status']);
  assert.equal(result.status, 'incorrect'); assert.equal(Object.hasOwn(result, 'correct'), false);
  assert.equal(JSON.stringify(passed).includes('correct'), false);
  const reboundEndsAt = rooms.get(code).activeQuestion.endsAt;

  b.disconnect();
  const b2 = await connect(url); clients.push(b2);
  const recovered = await ack(b2, 'room:rejoin', { code, participantId: bJoin.participantId, reconnectToken: bJoin.reconnectToken });
  assert.equal(recovered.state.turnPlayerId, bJoin.participantId);
  assert.equal(recovered.state.activeQuestion.qIndex, 0);
  assert.equal(recovered.state.activeQuestion.endsAt, reboundEndsAt);
  assert.notEqual(recovered.reconnectToken, bJoin.reconnectToken);
  assert.equal(recovered.state.players.length, 2);
  assert.equal(aJoin.state.catalog.demo.subcategories.general.questions[0].correct, undefined);

  const replay = await connect(url); clients.push(replay);
  assert.equal((await ack(replay, 'room:rejoin', { code, participantId: bJoin.participantId, reconnectToken: bJoin.reconnectToken })).error, 'No se pudo recuperar tu sesión.');

  const finalResultEvent = once(spectator, 'answer:result');
  const closedEvent = once(spectator, 'question:closed');
  await ack(b2, 'answer:submit', { answer: 1, questionId: passed.id });
  const finalResult = await finalResultEvent; const closed = await closedEvent;
  assert.equal(finalResult.status, 'incorrect'); assert.equal(Object.hasOwn(finalResult, 'correct'), false);
  assert.equal(Object.hasOwn(closed, 'correct'), false);
});

test('el creador es anfitrión y los demás roles no pueden seleccionar categorías', async t => {
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const host = await connect(url); const player = await connect(url); const spectator = await connect(url); clients.push(host, player, spectator);
  assert.equal((await ack(host, 'room:create', { name: 'Sin modalidad' })).error, 'Modalidad de sala inválida.');
  assert.equal((await ack(host, 'room:create', { name: '-', mode: 'individual', responseMode: null })).error, 'Ingresá un alias válido.');
  const created = await ack(host, 'room:create', { name: 'Anfitrión', mode: 'individual', responseMode: null }); const code = created.state.code;
  await ack(player, 'room:join', { code, name: 'Jugador', role: 'jugador' });
  await ack(spectator, 'room:join', { code, name: 'Espectador', role: 'espectador' });
  assert.equal(created.isHost, true);
  assert.equal(created.state.mode, 'individual');
  assert.equal((await ack(player, 'category:select', { categoryKey: 'demo' })).error, 'Solo el anfitrión puede elegir una categoría disponible.');
  assert.equal((await ack(spectator, 'category:select', { categoryKey: 'demo' })).error, 'Solo el anfitrión puede elegir una categoría disponible.');
  assert.equal((await ack(host, 'category:select', { categoryKey: 'demo' })).ok, true);
  const latePlayer = await connect(url); clients.push(latePlayer);
  assert.equal((await ack(latePlayer, 'room:join', { code, name: 'Tarde', role: 'jugador' })).error, 'La partida ya comenzó; los jugadores deben ingresar antes de la Ronda 0.');
});

test('una sala de equipos conserva bandos elegidos y exige ambos equipos antes de comenzar', async t => {
  const tutorial = [{ points: 0, q: 'Práctica', options: ['A', 'B'], correct: 0 }];
  const { httpServer, io, rooms } = createTriviaServer({ trivia: { ...trivia, biblia: trivia.demo }, tutorial });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const host = await connect(url); const player = await connect(url); clients.push(host, player);
  const created = await ack(host, 'room:create', { name: 'Host', mode: 'teams', responseMode: 'individual' });
  const code = created.state.code;
  assert.equal(created.state.mode, 'teams'); assert.equal(created.state.responseMode, 'individual');
  assert.deepEqual(created.state.teamLabels, { blue: 'Chicos', red: 'Chicas' });
  assert.equal(created.isHost, true);
  assert.equal((await ack(host, 'team:choose', { teamKey: 'green' })).error, 'Equipo inválido.');
  await ack(host, 'team:choose', { teamKey: 'blue' });
  assert.equal((await ack(host, 'team:begin', { responseMode: 'individual', isTest: false, captains: {} })).error, 'Se requieren al menos dos jugadores para el duelo.');
  const joined = await ack(player, 'room:join', { code, name: 'Ana', role: 'jugador' });
  assert.equal(joined.state.players.find(item => item.id === joined.participantId).teamKey, null);
  assert.equal((await ack(player, 'room:join', { code, name: 'Ana', role: 'jugador' })).error, 'Ya estás conectado a esta sala.');
  const teamUpdate = once(host, 'room:state');
  await ack(player, 'team:choose', { teamKey: 'red' });
  assert.equal((await teamUpdate).players.find(item => item.id === joined.participantId).teamKey, 'red');
  assert.equal((await ack(player, 'team:choose', { teamKey: 'blue' })).error, 'Ya elegiste tu equipo. El anfitrión puede corregirlo antes de comenzar.');
  await ack(host, 'team:assign', { participantId: joined.participantId, teamKey: 'blue' });
  assert.equal(rooms.get(code).players.find(item => item.id === joined.participantId).teamKey, 'blue');
  await ack(host, 'team:assign', { participantId: joined.participantId, teamKey: 'red' });
  player.disconnect();
  const playerReloaded = await connect(url); clients.push(playerReloaded);
  const rejoined = await ack(playerReloaded, 'room:rejoin', { code, participantId: joined.participantId, reconnectToken: joined.reconnectToken });
  assert.equal(rejoined.state.players.find(item => item.id === joined.participantId).teamKey, 'red');
  const state = rooms.get(code);
  assert.equal(state.players.find(item => item.id === created.participantId).teamKey, 'blue');
  assert.equal(state.players.find(item => item.id === joined.participantId).teamKey, 'red');
  const started = await ack(host, 'team:begin', { responseMode: 'individual', isTest: false, captains: {} });
  assert.equal(started.ok, true); assert.equal(state.teamDuel.teams.blue.name, 'Chicos'); assert.equal(state.teamDuel.teams.red.name, 'Chicas');
  assert.equal((await ack(playerReloaded, 'team:choose', { teamKey: 'blue' })).error, 'No podés elegir un equipo ahora.');
});

test('un token vencido no recupera ni duplica una sesión', async t => {
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const original = await connect(url); clients.push(original);
  const created = await ack(original, 'room:create', { name: 'A', mode: 'individual', responseMode: null }); const code = created.state.code;
  rooms.get(code).players[0].tokenExpiresAt = Date.now() - 1;
  const refreshed = await connect(url); clients.push(refreshed);
  const rejected = await ack(refreshed, 'room:rejoin', { code, participantId: created.participantId, reconnectToken: created.reconnectToken });
  assert.equal(rejected.error, 'No se pudo recuperar tu sesión.');
  assert.equal(rejected.code, 'SESSION_INVALID');
  assert.equal(rooms.get(code).players.length, 1);
});

test('una sesión informa explícitamente cuando la sala desapareció tras reiniciar el proceso', async t => {
  const first = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => first.httpServer.listen(0, resolve));
  const firstUrl = `http://127.0.0.1:${first.httpServer.address().port}`;
  const original = await connect(firstUrl);
  const created = await ack(original, 'room:create', { name: 'Persistencia', mode: 'individual', responseMode: null });
  original.disconnect();
  first.rooms.forEach(room => clearTimeout(room.timer)); first.io.close(); first.httpServer.close();

  const second = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => second.httpServer.listen(0, resolve));
  const secondUrl = `http://127.0.0.1:${second.httpServer.address().port}`;
  const reloaded = await connect(secondUrl);
  t.after(() => { reloaded.disconnect(); second.rooms.forEach(room => clearTimeout(room.timer)); second.io.close(); second.httpServer.close(); });

  const result = await ack(reloaded, 'room:rejoin', {
    code: created.state.code,
    participantId: created.participantId,
    reconnectToken: created.reconnectToken
  });
  assert.equal(result.code, 'ROOM_NOT_FOUND');
  assert.equal(result.error, 'La sala ya no existe en el servidor.');
});

test('una selección de categoría distingue una sala ausente de un error de permisos', async t => {
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const client = await connect(url);
  t.after(() => { client.disconnect(); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });
  const created = await ack(client, 'room:create', { name: 'Anfitrión', mode: 'individual', responseMode: null });
  rooms.delete(created.state.code);
  const result = await ack(client, 'category:select', { categoryKey: 'demo' });
  assert.equal(result.code, 'ROOM_NOT_FOUND');
  assert.equal(result.error, 'La sala ya no existe en el servidor.');
});

test('cambiar de sala revoca en servidor el token anterior y conserva el nuevo', async t => {
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const original = await connect(url); clients.push(original);
  const roomA = await ack(original, 'room:create', { name: 'A', mode: 'individual', responseMode: null });
  original.disconnect();
  const recovered = await connect(url); clients.push(recovered);
  const recoveredA = await ack(recovered, 'room:rejoin', { code: roomA.state.code, participantId: roomA.participantId, reconnectToken: roomA.reconnectToken });
  const roomB = await ack(recovered, 'room:create', { name: 'B', mode: 'individual', responseMode: null });
  assert.equal(roomB.ok, true);
  const attacker = await connect(url); clients.push(attacker);
  assert.equal((await ack(attacker, 'room:rejoin', { code: roomA.state.code, participantId: roomA.participantId, reconnectToken: recoveredA.reconnectToken })).error, 'No se pudo recuperar tu sesión.');
  recovered.disconnect();
  const recoveredB = await connect(url); clients.push(recoveredB);
  assert.equal((await ack(recoveredB, 'room:rejoin', { code: roomB.state.code, participantId: roomB.participantId, reconnectToken: roomB.reconnectToken })).ok, true);

  const targetHost = await connect(url); const joiningSource = await connect(url); clients.push(targetHost, joiningSource);
  const target = await ack(targetHost, 'room:create', { name: 'Destino', mode: 'individual', responseMode: null });
  const source = await ack(joiningSource, 'room:create', { name: 'Origen', mode: 'individual', responseMode: null });
  const joined = await ack(joiningSource, 'room:join', { code: target.state.code, name: 'Cambio', role: 'jugador' });
  assert.equal(joined.ok, true);
  const oldReplay = await connect(url); clients.push(oldReplay);
  assert.equal((await ack(oldReplay, 'room:rejoin', { code: source.state.code, participantId: source.participantId, reconnectToken: source.reconnectToken })).error, 'No se pudo recuperar tu sesión.');
});

test('recargar al anfitrión durante Ronda 0 conserva sesión, tutorial y temporizador', async t => {
  const tutorial = [{ points: 0, q: 'Práctica', options: ['A', 'B'], correct: 0 }];
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const host = await connect(url); const player = await connect(url); clients.push(host, player);
  const created = await ack(host, 'room:create', { name: 'A', mode: 'individual', responseMode: null }); const code = created.state.code;
  const joined = await ack(player, 'room:join', { code, name: 'B', role: 'jugador' });
  await ack(host, 'category:select', { categoryKey: 'demo' });
  const before = rooms.get(code).activeQuestion.endsAt;
  host.disconnect();
  const hostReloaded = await connect(url); clients.push(hostReloaded);
  const recovered = await ack(hostReloaded, 'room:rejoin', { code, participantId: created.participantId, reconnectToken: created.reconnectToken });
  assert.equal(recovered.isHost, true);
  assert.equal(recovered.state.tutorial.status, 'playing');
  assert.equal(recovered.state.activeQuestion.endsAt, before);
  assert.equal(recovered.state.players.length, 2);
  assert.equal((await ack(hostReloaded, 'category:select', { categoryKey: 'demo' })).error, 'Solo el anfitrión puede elegir una categoría disponible.');

  player.disconnect();
  const playerReloaded = await connect(url); clients.push(playerReloaded);
  const playerRecovered = await ack(playerReloaded, 'room:rejoin', { code, participantId: joined.participantId, reconnectToken: joined.reconnectToken });
  assert.equal(playerRecovered.isHost, false);
  assert.equal(playerRecovered.state.activeQuestion.endsAt, before);
  assert.equal(playerRecovered.state.players.length, 2);
  assert.equal(JSON.stringify(playerRecovered).includes('correct'), false);
});

test('Ronda 0 se sincroniza, rechaza eventos atrasados y deja lista la competencia', async t => {
  const tutorial = [
    { points: 0, q: 'Tutorial 1', options: ['A', 'B'], correct: 0 },
    { points: 0, q: 'Tutorial 2', options: ['A', 'B'], correct: 1 }
  ];
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });
  const a = await connect(url); const b = await connect(url); const spectator = await connect(url); clients.push(a, b, spectator);
  const created = await ack(a, 'room:create', { name: 'A', mode: 'individual', responseMode: null }); const code = created.state.code;
  await ack(b, 'room:join', { code, name: 'B', role: 'jugador' });
  await ack(spectator, 'room:join', { code, name: 'S', role: 'espectador' });
  const opened = once(spectator, 'question:opened'); await ack(a, 'category:select', { categoryKey: 'demo' });
  const first = await opened; assert.equal(first.tutorial, true); assert.equal(JSON.stringify(first).includes('correct'), false);
  const passedEvent = once(spectator, 'question:passed'); await ack(a, 'answer:submit', { answer: 1, questionId: first.id });
  const rebound = await passedEvent; assert.equal(rebound.id, first.id); // La misma pregunta mantiene su identidad durante el rebote.
  assert.equal((await ack(a, 'answer:submit', { answer: 0, questionId: first.id })).error, 'No es tu turno para responder.');
  await ack(b, 'answer:submit', { answer: 0, questionId: rebound.id });
  const nextOpened = once(spectator, 'question:opened'); await ack(a, 'tutorial:advance', {}); const second = await nextOpened;
  assert.notEqual(second.id, first.id); assert.equal((await ack(a, 'answer:submit', { answer: 0, questionId: first.id })).error, 'Esta pregunta ya no está vigente.');
  await ack(b, 'answer:submit', { answer: 1, questionId: second.id });
  const official = await ack(a, 'tutorial:begin-official', {});
  assert.equal(official.ok, true);
  const room = rooms.get(code); assert.equal(room.tutorial, null); assert.equal(room.players.every(player => player.score === 0), true);
});

test('Socket.IO rechaza payloads malformados y aplica límites sin detener el servidor', async t => {
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial: [], limits: { maxRooms: 1, maxPlayers: 1, maxEventsPerWindow: 30 } });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });
  const host = await connect(url); const other = await connect(url); clients.push(host, other);
  for (const event of ['room:create', 'room:join', 'room:rejoin', 'room:leave', 'room:close', 'category:select', 'team:begin', 'team:answer', 'tutorial:advance', 'tutorial:begin-official', 'question:select', 'answer:submit']) {
    const response = await ack(host, event, null);
    assert.equal(typeof response.error, 'string');
  }
  const created = await ack(host, 'room:create', { name: 'A', mode: 'individual', responseMode: null }); const code = created.state.code;
  assert.match(code, /^SABELO-[A-Z2-9]{8}$/);
  assert.equal((await ack(other, 'room:create', { name: 'B', mode: 'individual', responseMode: null })).error, 'No se pueden crear más salas en este momento.');
  assert.equal((await ack(other, 'room:join', { code, name: 'B', role: 'jugador' })).error, 'La sala alcanzó el máximo de jugadores.');
  assert.equal((await ack(host, 'category:select', { categoryKey: 'demo', isHost: true })).error, 'Categoría inválida.');
  assert.equal(rooms.size, 1);
});

test('solo el anfitrión puede terminar una sala de equipos y los participantes reciben el cierre', async t => {
  const { httpServer, io, rooms } = createTriviaServer({ trivia, tutorial: [] });
  await new Promise(resolve => httpServer.listen(0, resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`; const clients = [];
  t.after(() => { clients.forEach(client => client.disconnect()); rooms.forEach(room => clearTimeout(room.timer)); io.close(); httpServer.close(); });

  const host = await connect(url); const player = await connect(url); clients.push(host, player);
  const created = await ack(host, 'room:create', { name: 'Host', mode: 'teams', responseMode: 'individual' });
  await ack(player, 'room:join', { code: created.state.code, name: 'Jugadora', role: 'jugador' });
  assert.equal((await ack(player, 'room:close', {})).error, 'Solo el anfitrión puede terminar esta sala de equipos.');
  const closed = once(player, 'room:closed');
  assert.equal((await ack(host, 'room:close', {})).ok, true);
  await closed;
  assert.equal(rooms.has(created.state.code), false);
});

test('limpia salas abandonadas después del período de recuperación', () => {
  const { rooms, cleanExpiredRooms } = createTriviaServer({ trivia, tutorial: [], limits: { roomIdleMs: 10 } });
  const room = require('../lib/game-room').createRoom({ code: 'SABELO-ABCDEFGH', hostSocketId: 'socket', hostName: 'A' });
  room.emptySince = Date.now() - 11; rooms.set(room.code, room);
  cleanExpiredRooms();
  assert.equal(rooms.has(room.code), false);
});
