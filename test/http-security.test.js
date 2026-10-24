const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTriviaServer } = require('../server');

test('HTTP no revela tecnología y entrega cabeceras defensivas', async t => {
  const { httpServer, io } = createTriviaServer({ trivia: {}, tutorial: [] });
  await new Promise(resolve => httpServer.listen(0, resolve));
  t.after(() => { io.close(); httpServer.close(); });
  const response = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${httpServer.address().port}/`, resolve).on('error', reject));
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.match(response.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  response.resume();
});
