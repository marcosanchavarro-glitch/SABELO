const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('la vista de equipos permite renderizar la Ronda 0', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  assert.match(client, /\['playing', 'tutorial'\]\.includes\(duel\.status\)/);
  assert.match(client, /\['playing', 'tutorial'\]\.includes\(roomState\?\.teamDuel\?\.status\)/);
});
