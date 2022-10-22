"use strict;";

import {dom, formToJSON, validateUsername} from "client/util";

const findGetParameter = function (parameterName) {
    var result = null,
        tmp = [];
    location.search
        .substr(1)
        .split("&")
        .forEach(function (item) {
          tmp = item.split("=");
          if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
        });
    return result;
}

const form = document.querySelector("#register");
form.addEventListener("submit", async e => {
  e.preventDefault();
  e.stopPropagation();
  const body = new FormData(form);
  const user = body.get("u");
  const pass = body.get("p");
  body.delete("c");

  const errors = [];
  try {
    if (await validateUsername(user) !== user) {
      errors.push(`Invalid user name:
      no special chars, like umlauts or accented characters!`);
    }
  }
  catch (ex) {
    errors.push(ex.message || ex);
  }

  if (pass.length < 8) {
    errors.push("Password too short!");
  }
  if (!/\w/.test(pass) || !/\d/.test(pass)) {
    errors.push(`Password must contain at least
    one regular character and one number`);
  }
  const ul = document.querySelector("#errors");
  ul.textContent = "";
  errors.forEach(error => {
    ul.appendChild(dom("li", {text: error}));
  });
  if (errors.length) {
    return;
  }

  const submit = document.querySelector("#submit");
  submit.setAttribute("disabled", "disabled");
  const oldval = submit.textContent;
  submit.textContent = "Please wait...";

  try {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    let res = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: formToJSON(body),
    });

    if (!res.ok) {
      throw new Error("Server err'ed out, sorry! Please try again later");
    }
    res = await res.json();
    
    // {"session":"kpXMCiHATlhjR_U3m4uj0lGNF9k5c3rHvcwvc3E7WHM","user":"voroneril","role":"user"}
    // {"err":"Invalid username or password"}
    if (res.err) {
      throw new Error(res.err);
    }
    if (window.PasswordCredential) {
      const cred = new window.PasswordCredential({
        id: body.get("u").toLowerCase(),
        password: body.get("p")
      });
      try {
        await navigator.credentials.store(cred);
      }
      catch (ex) {
        console.error("Failed to save cred", ex);
      }
    }
    
    document.location = "/r/" + findGetParameter('roomid');
  }
  catch (ex) {
    ul.appendChild(dom("li", {text: ex.message || ex}));
    console.trace(ex);
  }
  finally {
    submit.textContent = oldval;
    submit.removeAttribute("disabled");
  }
});

