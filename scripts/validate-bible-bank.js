const trivia = require('../data/trivia-private');
const { validateBiblicalBank } = require('../lib/biblical-quality');
const report = validateBiblicalBank(trivia);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.rejected.length ? 1 : 0;
