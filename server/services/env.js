'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function existingEnvFiles() {
  const serverRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(serverRoot, '..');
  const cwd = process.cwd();

  return [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    path.join(serverRoot, '.env'),
    path.join(serverRoot, '.env.local'),
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env.vercel'),
  ].filter((file, index, files) => files.indexOf(file) === index && fs.existsSync(file));
}

function loadEnv() {
  if (loaded) return;
  for (const file of existingEnvFiles()) {
    dotenv.config({ path: file, override: false });
  }
  loaded = true;
}

module.exports = { loadEnv };
