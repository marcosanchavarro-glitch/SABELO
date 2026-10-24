const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('la vista de equipos permite renderizar la Ronda 0', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  assert.match(client, /\['playing', 'tutorial'\]\.includes\(duel\.status\)/);
  assert.match(client, /\['playing', 'tutorial'\]\.includes\(roomState\?\.teamDuel\?\.status\)/);
});

test('el cliente deriva el anfitrión del estado del servidor y protege los eventos de otra sala', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  assert.match(client, /function syncIdentityFromState/);
  assert.match(client, /roomState\.hostId === participantId/);
  assert.match(client, /state\.code/);
  assert.match(client, /return restoreSession\(\);/);
});

test('el cliente comunica conexión, evita operaciones sin socket y vuelve al inicio si falta la sala', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(client, /const ACTION_TIMEOUT_MS = 8000/);
  assert.match(client, /if \(!socket\.connected\)/);
  assert.match(client, /socket\.on\('disconnect'/);
  assert.match(client, /socket\.on\('connect_error'/);
  assert.match(client, /ROOM_NOT_FOUND/);
  assert.match(client, /No pudimos confirmar la sesión todavía/);
  assert.match(client, /changeScreen\('screen-identity'\)/);
  assert.match(html, /id="connection-status"/);
  assert.match(html, /id="action-status"/);
});

test('el cliente contiene la creación por modalidad, elección voluntaria de bando y finales separados', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(client, /roomCreateConfig/);
  assert.match(client, /team:choose/);
  assert.match(client, /team:assign/);
  assert.match(client, /screen-team-final/);
  assert.match(client, /screen-podium/);
  assert.match(html, /Elegí tu bando/);
  assert.match(html, /Unirme a Chicos/);
  assert.match(html, /Unirme a Chicas/);
});
