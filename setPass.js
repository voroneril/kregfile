#!/usr/bin/env node
"use strict";

require("./lib/loglevel").patch();
const {User} = require("./lib/user");
const CONFIG = require("./lib/config");
const passlib = require("passlib");
const BROKER = require("./lib/broker");
const redis = BROKER.getMethods(
  "get", "set", "del", "exists",
  "zscore", "zrevrank", "zincrby", "zrevrange",
  "multi"
);

async function main() {
  const [,, acct, pass] = process.argv;
  if (!acct || !pass) {
    console.error("setRole.js <user> <pass>");
    process.exit(1);
    return;
  }
  const user = await User.get(acct);
  if (!user) {
    console.error("Invalid user");
    process.exit(1);
    return;
  }
  console.log("setting pass", pass.bold.red, "on", acct.bold);
  
  var password = await passlib.create(pass);
  await redis.set(`user:pw:${user.account}`, password);
    
  console.log("Pass set!".bold);
  process.exit(0);
}

main().catch(console.error);
