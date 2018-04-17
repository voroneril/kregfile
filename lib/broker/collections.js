"use strict";

const EventEmitter = require("events");
const {promisify} = require("util");
const BROKER = require("./");
const {ObservableSet, ObservableMap} = require("../util");

const THIS_PID = process.pid.toString();
const PID = Symbol();
const KEY = Symbol();
const MAP = Symbol();
const LOADING = Symbol();
const REFRESH = Symbol();
const UNSERIALIZE = Symbol();
const EXPIRE = 60 * 3 / 4;

const hgetall = promisify(BROKER.PUB.hgetall.bind(BROKER.PUB));
const hdel = promisify(BROKER.PUB.hdel.bind(BROKER.PUB));
const smembers = promisify(BROKER.PUB.smembers.bind(BROKER.PUB));
const srem = promisify(BROKER.PUB.srem.bind(BROKER.PUB));
const tracking = promisify(BROKER.PUB.tracking.bind(BROKER.PUB));

function ensureKey(key) {
  switch (typeof key) {
  case "undefined":
    return {v: key};

  case "boolean":
    return {v: key};

  case "number":
    return {v: key};

  case "string":
    return {v: key};

  case "symbol": {
    const rv = Symbol.keyFor(key);
    if (!rv) {
      throw new Error("Invalid Symbol, must be Symbol.for()able");
    }
    return {s: rv};
  }

  default:
    if (key === null) {
      return {v: key};
    }
    throw new Error("Key is not a primitive type");
  }
}

function unserializeKey(key) {
  if (key.s) {
    return Symbol.for(key.sym);
  }
  return key.v;
}

const REFRESHER = new class Refresher extends Set {
  constructor() {
    super();
    setInterval(() => {
      this.forEach(v => v[REFRESH]());
    }, EXPIRE * 1000);
  }
}();

// XXX locks?

class DistributedMap extends ObservableMap {
  constructor(key, unserializeValue) {
    super();
    this[PID] = THIS_PID;
    this[KEY] = `map:${key}`;
    this[UNSERIALIZE] = unserializeValue;
    this.onsync = this.onsync.bind(this);
    BROKER.on(this[KEY], this.onsync);
    this[LOADING] = (async() => {
      const data = await hgetall(this[KEY]);
      super.clear();
      if (!data) {
        return;
      }
      for (const [sk, sv] of Object.entries(data)) {
        try {
          const k = unserializeKey(JSON.parse(sk));
          const v = unserializeValue ?
            unserializeValue(JSON.parse(sv)) :
            JSON.parse(sv);
          super.set(k, v);
        }
        catch (ex) {
          await hdel(this[KEY], sk);
        }
      }
    })();
  }

  get loaded() {
    return this[LOADING];
  }

  onsync(d) {
    if (d.pid === this[PID]) {
      return;
    }
    switch (d.t) {
    case "s":
      if (this[UNSERIALIZE]) {
        d.v = this[UNSERIALIZE](d.v);
      }
      super.set(unserializeKey(d.k), d.v);
      return;

    case "d":
      super.delete(unserializeKey(d.k));
      return;

    case "c":
      super.clear();
      return;

    default:
      console.error("invalid op", this[KEY], d);
      return;
    }
  }

  set(k, v) {
    const [sk, sv] = [JSON.stringify(ensureKey(k)), JSON.stringify(v)];
    BROKER.PUB.dmap(this[KEY], this[PID], "set", sk, sv);
    super.set(k, v);
    return this;
  }

  delete(k) {
    const sk = JSON.stringify(ensureKey(k));
    BROKER.PUB.dmap(this[KEY], this[PID], "delete", sk);
    return super.delete(k);
  }

  clear() {
    BROKER.PUB.dmap(this[KEY], this[PID], "clear");
    super.clear();
  }

  kill() {
    BROKER.removeListener(this[KEY], this.onsync);
    super.clear();
  }
}

class DistributedSet extends ObservableSet {
  constructor(key) {
    super();
    this[KEY] = key;
    this[PID] = THIS_PID;
    this.onsync = this.onsync.bind(this);
    BROKER.on(this[KEY], this.onsync);
    this[LOADING] = (async() => {
      const data = await smembers(this[KEY]);
      super.clear();
      for (const v of data) {
        try {
          super.add(unserializeKey(JSON.parse(v)));
        }
        catch (ex) {
          await srem(this[KEY], v);
        }
      }
    })();
  }

  get loaded() {
    return this[LOADING];
  }

  onsync(d) {
    if (d.pid === this[PID]) {
      return;
    }
    switch (d.t) {
    case "a":
      super.add(unserializeKey(d.v));
      return;

    case "d":
      super.delete(unserializeKey(d.v));
      return;

    case "c":
      super.clear();
      return;

    default:
      console.error("invalid op", this[KEY], d);
      return;
    }
  }

  add(item) {
    const sk = JSON.stringify(ensureKey(item));
    BROKER.PUB.dset(this[KEY], this[PID], "add", sk);
    super.add(item);
  }

  delete(item) {
    const sk = JSON.stringify(ensureKey(item));
    BROKER.PUB.dset(this[KEY], this[PID], "delete", sk);
    super.delete(item);
  }

  clear() {
    BROKER.PUB.dset(this[KEY], this[PID], "clear");
    super.clear();
  }

  kill() {
    this.emit("kill");
    this.removeAllListeners();
    BROKER.removeKeyListener(this[KEY], this.onsync);
    super.clear();
  }
}

class DistributedTracking extends EventEmitter {
  constructor(key) {
    super();
    this[KEY] = `tracking:${key}`;
    this[PID] = THIS_PID;
    this[MAP] = new Map();
    this.onsync = this.onsync.bind(this);
    BROKER.on(this[KEY], this.onsync);
    this[LOADING] = (async () => {
      try {
        const data = JSON.parse(await tracking(this[KEY], "getall", this[PID]));
        if (Array.isArray(data)) {
          this[MAP] = new Map(data);
        }
        else {
          this[MAP].clear();
        }
        this.emit("load");
        this.emit("update");
      }
      catch (ex) {
        console.error("getallerr", ex);
      }
    })();
    Object.seal(this);

    REFRESHER.add(this);
  }

  get loaded() {
    return this[LOADING];
  }

  [REFRESH]() {
    tracking(this[KEY], "refresh", this[PID]);
  }

  onsync(t) {
    switch (t.op) {
    case "s": {
      const map = this[MAP];
      if (t.v) {
        map.set(t.k, t.v);
      }
      else {
        map.delete(t.k);
      }
      this.emit("update");
      return;
    }

    case "del":
      this[MAP].delete(t.k);
      this.emit("update");
      return;

    case "c":
      this[MAP].clear();
      this.emit("update");
      return;

    case "exp":
      if (Array.isArray(t.v)) {
        this[MAP] = new Map(t.v);
      }
      else {
        this[MAP].clear();
      }
      this.emit("update");
      return;

    default:
      throw new Error("invalid op");
    }
  }

  get size() {
    return this[MAP].size;
  }

  get(key) {
    return this[MAP].get(key) || 0;
  }

  async incr(key) {
    return await tracking(this[KEY], "incr", this[PID], key);
  }

  async decr(key) {
    return await tracking(this[KEY], "decr", this[PID], key);
  }

  async delete(key) {
    await tracking(this[KEY], "del", this[PID], key);
    return this[MAP].delete(key);
  }

  async clear() {
    await tracking(this[KEY], "clear", this[PID]);
    this[MAP].clear();
  }

  dump() {
    console.log(this[MAP]);
  }

  kill() {
    this.emit("kill");
    this.removeAllListeners();
    REFRESHER.delete(this);
    BROKER.removeListener(this[KEY], this.onsync);
    this[MAP].clear();
  }
}

module.exports = {
  DistributedMap,
  DistributedSet,
  DistributedTracking,
};