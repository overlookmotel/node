'use strict';

const pathJoin = require('node:path').join;

const nodeCore = require('./tools/eslint/eslint-plugin-node-core.js');

nodeCore.meta = {
  name: 'node-core',
};

nodeCore.RULES_DIR = pathJoin(__dirname, "tools/eslint-rules");

module.exports = nodeCore;
