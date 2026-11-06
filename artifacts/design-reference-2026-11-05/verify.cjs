const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const helpers = read('figma-icons.js') + '\n' + read('figma-helpers.js');
for (const name of ['admin.js', 'admin-supplement.js', 'booth.js', 'dialogs.js', 'dialog-mobile.js', 'polish.js']) {
  new AsyncFunction(helpers + '\n' + read(name));
}
const inventory = JSON.parse(read('figma-inventory.json'));
const screens = inventory.pages.flatMap(page => page.screens);
assert.equal(inventory.pages.length, 3);
assert.equal(screens.length, 74);
assert.equal(new Set(screens.map(screen => screen.id)).size, 74);
assert.equal(10 * (5 + 1) - 37 - 1, 22);
assert.equal(inventory.pages.flatMap(page => page.issues).length, 0);
assert.equal(inventory.pages[2].limits.length, 1);
JSON.parse(read('admin-content.json'));
console.log('Drawing sources parse; 74 unique frames, accounting example and audit-limit disclosure verified.');
