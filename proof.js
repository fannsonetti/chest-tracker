// Relay-signed match results. The relay signs each finished match with an
// Ed25519 private key that only the server holds; the app checks results with
// the public key below, so saved history that was edited, or a recap that the
// relay never sent, does not verify and earns no leaderboard points.
const crypto = require('node:crypto');
const fs = require('node:fs');

const RELAY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA7+gABGB3wFY49OfAO9JOHhNwKaW3XMM0qfLCczmS3t4=
-----END PUBLIC KEY-----`;

// The signed bytes travel with the signature, so verification never depends
// on how JSON is re-serialized.
function signResult(result, privateKey) {
  const data = JSON.stringify(result);
  return { data, sig:crypto.sign(null, Buffer.from(data), privateKey).toString('base64') };
}

// Returns the signed result, or null when the proof is missing or invalid.
function verifyResult(proof, publicKey = RELAY_PUBLIC_KEY) {
  try {
    if (!proof || typeof proof.data !== 'string' || typeof proof.sig !== 'string') return null;
    if (!crypto.verify(null, Buffer.from(proof.data), publicKey, Buffer.from(proof.sig, 'base64'))) return null;
    const result = JSON.parse(proof.data);
    if (!result || typeof result.id !== 'string' || !Array.isArray(result.players)) return null;
    return result;
  } catch { return null; }
}

// RELAY_SIGNING_KEY holds the PEM itself; RELAY_SIGNING_KEY_FILE points to
// it. Without either the relay signs with a throwaway key, so its results do
// not verify in the app.
function loadSigningKey(env = process.env) {
  const pem = env.RELAY_SIGNING_KEY ? env.RELAY_SIGNING_KEY.replace(/\\n/g, '\n')
    : env.RELAY_SIGNING_KEY_FILE ? fs.readFileSync(env.RELAY_SIGNING_KEY_FILE, 'utf8') : null;
  if (pem) return crypto.createPrivateKey(pem);
  console.warn('No RELAY_SIGNING_KEY or RELAY_SIGNING_KEY_FILE set: match results will not verify in the app.');
  return crypto.generateKeyPairSync('ed25519').privateKey;
}

module.exports = { RELAY_PUBLIC_KEY, signResult, verifyResult, loadSigningKey };
