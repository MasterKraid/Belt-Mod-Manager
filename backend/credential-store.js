/**
 * Secure credential storage for Factorio mod portal authentication.
 *
 * Uses AES-256-GCM encryption with a machine-bound key derived from:
 *   - A random salt (unique per installation, stored alongside the ciphertext)
 *   - Machine-specific entropy (hostname + username + app path)
 *
 * The encrypted credentials file is useless on any other machine or
 * if moved outside the application directory.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CRED_FILE = path.join(__dirname, '.credentials');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

/**
 * Derive a machine-bound encryption key from the salt.
 * Ties credentials to this specific machine + user + install path.
 */
function deriveKey(salt) {
  const machineEntropy = [
    os.hostname(),
    os.userInfo().username,
    __dirname,
    'belt-mod-manager-v1'
  ].join('::');
  return crypto.pbkdf2Sync(machineEntropy, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt and store Factorio credentials.
 * @param {string} username - Factorio username
 * @param {string} token    - Factorio service token
 */
function saveCredentials(username, token) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(salt);

  const plaintext = JSON.stringify({ username, token });
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // File format: salt(32) + iv(16) + authTag(16) + ciphertext(variable)
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  fs.writeFileSync(CRED_FILE, combined);
}

/**
 * Load and decrypt Factorio credentials.
 * @returns {{ username: string, token: string } | null}
 */
function loadCredentials() {
  try {
    if (!fs.existsSync(CRED_FILE)) return null;

    const data = fs.readFileSync(CRED_FILE);
    if (data.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) return null;

    const salt    = data.subarray(0, SALT_LENGTH);
    const iv      = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8'));

    if (parsed.username && parsed.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete stored credentials.
 */
function clearCredentials() {
  try {
    if (fs.existsSync(CRED_FILE)) fs.unlinkSync(CRED_FILE);
  } catch {}
}

/**
 * Check if credentials are stored (without decrypting).
 */
function hasCredentials() {
  return fs.existsSync(CRED_FILE);
}

module.exports = { saveCredentials, loadCredentials, clearCredentials, hasCredentials };
