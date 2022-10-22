"use strict;";

import {dom, formToJSON, validateUsername} from "client/util";

const form = document.querySelector("#register");
form.addEventListener("submit", async e => {
  e.preventDefault();
  e.stopPropagation();

  const errors = [];
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
  const body = new FormData(form);

  try {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    let res = await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: formToJSON(body),
    });

    if (!res.ok) {
      throw new Error("Server err'ed out, sorry! Please try again later");
    }
    
    document.location = "/login";
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

