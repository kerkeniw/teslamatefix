#!/usr/bin/env node
// Génère un hash bcrypt à coller dans AUTH_PASSWORD_HASH.
// Usage : `npm run auth:hash` puis saisie masquée au prompt, ou pipe :
//   echo -n "MotDePasse" | node scripts/hash-password.mjs
import bcrypt from "bcryptjs";

async function readPassword() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\n$/, "");
  }
  // Saisie masquée (Medium #8) : mode raw, rien n'est renvoyé à l'écran.
  process.stderr.write("Mot de passe : ");
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let pwd = "";
    const done = (value) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      resolve(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return done(pwd);
        if (ch === "\u0003") {
          process.stderr.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") pwd = pwd.slice(0, -1);
        else pwd += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await readPassword();
if (!password) {
  process.stderr.write("Mot de passe vide, abandon.\n");
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
process.stdout.write(hash + "\n");
