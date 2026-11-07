// Runs before `npm start` / `npm run dev`: stops with a clear message when Node.js is too old.
// The app needs Node 24 (current LTS): its data store is Node's built-in SQLite module
// (node:sqlite, flag-free from 22.13) and a dependency (html2canvas-pro) declares Node 24+, which
// npm enforces at install time (.npmrc engine-strict). Keep in step with package.json "engines".
// Written in plain CommonJS so it runs even on very old Node versions.
'use strict'

var MIN = [24, 0, 0]
var current = process.versions.node.split('.').map(Number)

function older(a, b) {
  for (var i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

if (older(current, MIN)) {
  console.error(
    '\niTicket needs Node.js ' + MIN.join('.') + ' or newer (you have ' + process.versions.node + ').\n' +
      'Install the current LTS release (Node.js 24) from https://nodejs.org, then run "npm install" and try again.\n',
  )
  process.exit(1)
}
