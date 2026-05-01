#!/usr/bin/env node
// Génère un hash bcrypt à coller dans AUTH_PASSWORD_HASH.
// Usage : `npm run auth:hash` puis saisie au prompt, ou pipe :
//   echo -n "MotDePasse" | node scripts/hash-password.mjs
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";

async function readPassword() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\n$/, "");
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const pwd = await rl.question("Mot de passe : ");
  rl.close();
  return pwd;
}

const password = await readPassword();
if (!password) {
  process.stderr.write("Mot de passe vide, abandon.\n");
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
process.stdout.write(hash + "\n");
