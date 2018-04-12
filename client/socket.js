"use strict";

import io from "socket.io-client";
import registry from "./registry";

export default function createSocket() {
  const params = new URLSearchParams();
  const nick = localStorage.getItem("nick");
  params.set("roomid", registry.roomid);
  if (nick) {
    params.set("nick", nick);
  }
  const socket = io.connect({
    path: "/w",
    query: params.toString(),
    transports: ["websocket"],
  });
  socket.on("connect", console.log);
  socket.on("close", console.log);
  return socket;
}
