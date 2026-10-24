const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../lib/game-room');
const duel = require('../lib/team-duel');
const { validateBiblicalBank } = require('../lib/biblical-quality');
const fullTrivia = require('../data/trivia-private');

const trivia = { biblia: { title: 'Biblia', subcategories: { prueba: { title: 'Prueba', questions: Array.from({ length: 25 }, (_, index) => ({ id: `q-${index}`, difficulty: 'fácil', reference: 'Génesis 1:1', points: 100, q: `Pregunta ${index}`, options: ['Correcta', 'Incorrecta'], correct: 0 })) } } } };

function room(count = 4) {
  const value = game.createRoom({ code: 'TEAM', hostSocketId: 'a', hostName: 'A' });
  for (let index = 1; index < count; index += 1) value.players.push(game.createParticipant(String.fromCharCode(97 + index), String.fromCharCode(65 + index), 'jugador'));
  return value;
}

test('duelo individual alterna equipos y rota integrantes', () => {
  const value = room(); const started = duel.createDuel(value, trivia, { responseMode: 'individual', isTest: true });
  assert.equal(started.duel.activeTurn.teamKey, 'blue'); assert.equal(started.duel.activeTurn.responderId, value.players[0].id);
  duel.answer(value, value.players[0].id, 0, trivia, 1);
  assert.equal(value.teamDuel.activeTurn.teamKey, 'red'); assert.equal(value.teamDuel.activeTurn.responderId, value.players[1].id);
  duel.answer(value, value.players[1].id, 1, trivia, 2);
  assert.equal(value.teamDuel.activeTurn.teamKey, 'blue'); assert.equal(value.teamDuel.activeTurn.responderId, value.players[2].id);
  assert.equal(value.teamDuel.teams.blue.score, 100);
});

test('un fallo azul rebota una vez a rojo y el segundo fallo cierra sin puntos', () => {
  const value = room(); duel.createDuel(value, trivia, { responseMode: 'individual', isTest: true });
  const blue = value.teamDuel.activeTurn.responderId;
  const first = duel.answer(value, blue, 1, trivia, 1);
  assert.equal(first.rebound, true); assert.equal(value.teamDuel.activeTurn.teamKey, 'red');
  const red = value.teamDuel.activeTurn.responderId;
  const second = duel.answer(value, red, 1, trivia, 2);
  assert.equal(second.exhausted, true); assert.equal(value.teamDuel.teams.blue.score + value.teamDuel.teams.red.score, 0);
  assert.equal(value.teamDuel.turnNumber, 1); assert.equal(value.teamDuel.activeTurn.teamKey, 'red');
});

test('un acierto durante el rebote suma al equipo que recibió la pregunta', () => {
  const value = room(); duel.createDuel(value, trivia, { responseMode: 'captain-fixed', isTest: false });
  duel.answer(value, value.teamDuel.activeTurn.responderId, 1, trivia, 1);
  const outcome = duel.answer(value, value.teamDuel.activeTurn.responderId, 0, trivia, 2);
  assert.equal(outcome.result, 'correct'); assert.equal(value.teamDuel.teams.red.score, 100);
});

test('capitán fijo es el único autorizado y capitán rotativo cambia por equipo', () => {
  const fixed = room(); duel.createDuel(fixed, trivia, { responseMode: 'captain-fixed', isTest: false, captains: { blue: fixed.players[2].id, red: fixed.players[3].id } });
  assert.equal(duel.answer(fixed, fixed.players[0].id, 0, trivia).ok, false);
  assert.equal(duel.answer(fixed, fixed.players[2].id, 1, trivia).ok, true);
  assert.equal(fixed.teamDuel.activeTurn.responderId, fixed.players[3].id);
  const rotating = room(); duel.createDuel(rotating, trivia, { responseMode: 'captain-rotating', isTest: false });
  duel.answer(rotating, rotating.players[0].id, 0, trivia, 1); duel.answer(rotating, rotating.players[1].id, 0, trivia, 2);
  assert.equal(rotating.teamDuel.activeTurn.responderId, rotating.players[2].id);
});

test('tiempo agotado no suma puntos y veinte turnos finalizan sin repetir preguntas', () => {
  const value = room(2); duel.createDuel(value, trivia, { responseMode: 'individual', isTest: true });
  duel.timeout(value, trivia, 1);
  assert.equal(value.teamDuel.teams.blue.score + value.teamDuel.teams.red.score, 0);
  while (value.teamDuel.status === 'playing') duel.answer(value, value.teamDuel.activeTurn.responderId, 0, trivia, Date.now());
  assert.equal(value.teamDuel.turnNumber, 20); assert.equal(value.teamDuel.usedQuestionKeys.size, 20); assert.equal(value.teamDuel.status, 'finished');
});

test('el resultado final identifica victoria y empate sin alterar puntajes compartidos', () => {
  const winner = room(2); duel.createDuel(winner, trivia, { responseMode: 'individual', isTest: true });
  while (winner.teamDuel.status === 'playing') {
    const active = winner.teamDuel.activeTurn;
    if (active.teamKey === 'blue') duel.answer(winner, active.responderId, 0, trivia, Date.now());
    else {
      duel.answer(winner, active.responderId, 1, trivia, Date.now());
      if (winner.teamDuel.status === 'playing') duel.answer(winner, winner.teamDuel.activeTurn.responderId, 0, trivia, Date.now());
    }
  }
  assert.equal(winner.teamDuel.result.winner, 'blue'); assert.equal(winner.teamDuel.result.tie, false);

  const tied = room(2); duel.createDuel(tied, trivia, { responseMode: 'individual', isTest: true });
  while (tied.teamDuel.status === 'playing') duel.answer(tied, tied.teamDuel.activeTurn.responderId, 0, trivia, Date.now());
  assert.equal(tied.teamDuel.teams.blue.score, tied.teamDuel.teams.red.score);
  assert.equal(tied.teamDuel.result.tie, true); assert.equal(tied.teamDuel.result.winner, null);
});

test('el banco bíblico alcanza 60 preguntas y las nuevas pasan la validación estructural', () => {
  const report = validateBiblicalBank(fullTrivia);
  assert.equal(report.total, 60); assert.equal(report.rejected.length, 0); assert.equal(report.approved.length, 30);
  assert.deepEqual(report.distribution.difficulty, { fácil: 12, intermedio: 12, difícil: 6 });
});

test('la Ronda 0 de equipos conserva la configuración y reinicia el marcador oficial', () => {
  const value = room(); duel.createDuel(value, trivia, { responseMode: 'captain-fixed', isTest: false, captains: { blue: value.players[0].id, red: value.players[1].id } });
  const tutorial = [{ points: 0, q: 'Práctica', options: ['A', 'B'], correct: 0 }, { points: 0, q: 'Práctica 2', options: ['A', 'B'], correct: 1 }];
  duel.startTutorial(value, tutorial, 0);
  assert.equal(value.teamDuel.status, 'tutorial'); assert.equal(duel.answer(value, value.players[0].id, 0, trivia, 1).tutorial, true);
  assert.equal(value.teamDuel.teams.blue.score, 0);
  duel.advanceTutorial(value, 2);
  const rebound = duel.answer(value, value.players[1].id, 0, trivia, 3);
  assert.equal(rebound.rebound, true); assert.equal(value.teamDuel.activeTurn.teamKey, 'blue');
  const complete = duel.timeout(value, trivia, 4);
  assert.equal(complete.tutorialComplete, true);
  const active = duel.beginOfficialDuel(value, trivia);
  assert.equal(value.teamDuel.status, 'playing'); assert.equal(active.tutorial, undefined);
  assert.equal(value.teamDuel.teams.blue.score + value.teamDuel.teams.red.score, 0);
});

test('Ronda 0 habilita al representante correcto en equipos individuales y con capitán rotativo', () => {
  const tutorial = [{ points: 0, q: 'Práctica', options: ['A', 'B'], correct: 0 }];
  for (const responseMode of ['individual', 'captain-rotating']) {
    const value = room(); duel.createDuel(value, trivia, { responseMode, isTest: false }); duel.startTutorial(value, tutorial, 0);
    assert.equal(value.teamDuel.activeTurn.responderId, value.players[0].id);
    const rebound = duel.answer(value, value.players[0].id, 1, trivia, 1);
    assert.equal(rebound.rebound, true); assert.equal(value.teamDuel.activeTurn.responderId, value.players[1].id);
    assert.equal(duel.answer(value, value.players[0].id, 0, trivia, 2).ok, false);
  }
});
