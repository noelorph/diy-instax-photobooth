// Test image only: one-shot error before session persistence, after backend metadata creation.
const fs = require('node:fs');
exports.creationPersistence = async function () {
  try { fs.unlinkSync('/qualification-control/fail-next-create'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fs.writeFileSync('/qualification-control/create-persistence-reached', 'after backend creation; before session persistence\n');
  throw new Error('QualificationInjectedPersistenceError');
};
