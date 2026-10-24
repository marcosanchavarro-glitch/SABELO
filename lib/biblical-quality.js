function normalize(text) { return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function meaningfulWords(text) { return new Set(normalize(text).split(' ').filter(word => word.length > 3 && !['cual', 'quien', 'como', 'donde', 'para', 'segun', 'estos', 'esta'].includes(word))); }
function similarity(left, right) { const shared = [...left].filter(word => right.has(word)).length; return shared / Math.max(left.size, right.size, 1); }

function validateBiblicalBank(trivia) {
  const questions = Object.entries(trivia.biblia.subcategories).flatMap(([subcategory, value]) => value.questions.map((question, index) => ({ ...question, subcategory, index })));
  const seenIds = new Set(); const seenQuestions = new Set(); const wordSets = []; const report = { total: questions.length, approved: [], rejected: [], pendingReview: [], semanticDuplicates: [], distribution: { difficulty: {}, subcategory: {} } };
  questions.forEach(question => {
    const errors = [];
    if (!question.q || !Array.isArray(question.options) || question.options.length < 2 || !Number.isInteger(question.correct) || !question.options[question.correct]) errors.push('Estructura de opción múltiple inválida.');
    if (new Set(question.options.map(normalize)).size !== question.options.length) errors.push('Opciones duplicadas.');
    const fingerprint = normalize(question.q);
    if (seenQuestions.has(fingerprint)) errors.push('Pregunta duplicada exacta.'); else seenQuestions.add(fingerprint);
    if (question.id) { if (seenIds.has(question.id)) errors.push('Identificador duplicado.'); else seenIds.add(question.id); }
    const words = meaningfulWords(question.q);
    wordSets.forEach(previous => { if (similarity(words, previous.words) >= 0.8) report.semanticDuplicates.push({ question: question.q, similarTo: previous.question }); });
    wordSets.push({ question: question.q, words });
    const metadataMissing = !question.id || !question.reference || !question.difficulty;
    if (errors.length) report.rejected.push({ question: question.q, errors });
    else if (metadataMissing) report.pendingReview.push({ question: question.q, reason: 'Pregunta heredada sin metadatos completos; conservar y revisar manualmente.' });
    else report.approved.push({ id: question.id, reference: question.reference, difficulty: question.difficulty });
    report.distribution.subcategory[question.subcategory] = (report.distribution.subcategory[question.subcategory] || 0) + 1;
    if (question.difficulty) report.distribution.difficulty[question.difficulty] = (report.distribution.difficulty[question.difficulty] || 0) + 1;
  });
  return report;
}

module.exports = { validateBiblicalBank, normalize };
