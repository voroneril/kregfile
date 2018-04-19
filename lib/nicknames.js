"use strict";

const {shuffle} = require("./util");

const pool = require.main.require("./names.json");
const defaults = new Set(pool.map(e => e.toUpperCase()));
let currentPool = [];

function random() {
  if (!currentPool.length) {
    currentPool = pool.slice();
    shuffle(currentPool);
  }
  return currentPool.pop();
}

function isDefault(nick) {
  return defaults.has(nick.toUpperCase());
}

function sanitize(nick) {
  nick = nick.toString().replace(/[^a-z\d]/gi, "");
  if (nick.length <= 3 || nick.length > 20) {
    return null;
  }
  return nick;
}

module.exports = {
  random,
  isDefault,
  sanitize
};