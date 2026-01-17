/**
 * Key Recovery Utilities with PIN Protection
 * 
 * Security model:
 * - 12-word recovery phrase encodes 96 bits of entropy
 * - 6-digit PIN adds authentication factor
 * - Final key = PBKDF2(entropy + PIN, salt, 100000 iterations)
 * - BOTH phrase AND PIN required to restore
 */

// Word list for recovery phrases (256 common words)
const WORDS: string[] = [
  "apple", "ocean", "tiger", "piano", "green", "river", "cloud", "metal",
  "bread", "storm", "light", "music", "horse", "paper", "water", "stone",
  "dream", "earth", "flame", "glass", "heart", "image", "jewel", "knife",
  "lemon", "magic", "night", "olive", "peace", "queen", "radio", "sugar",
  "table", "uncle", "voice", "wheel", "youth", "zebra", "angel", "beach",
  "candy", "dance", "eagle", "fairy", "giant", "honey", "inbox", "jolly",
  "kitty", "lunar", "maple", "noble", "opera", "pearl", "quick", "robin",
  "sheep", "toast", "urban", "vivid", "witch", "xerox", "yacht", "zippy",
  "acorn", "bloom", "charm", "delta", "ember", "frost", "grace", "haven",
  "ivory", "joker", "karma", "lotus", "mango", "nexus", "orbit", "prism",
  "quartz", "realm", "solar", "tempo", "unity", "venom", "waves", "xenon",
  "yield", "zesty", "align", "blaze", "coral", "drift", "equip", "flora",
  "gleam", "haste", "inner", "jazzy", "kayak", "layer", "mirth", "north",
  "oasis", "plumb", "quest", "raven", "spark", "trail", "ultra", "valve",
  "woven", "xylon", "yearn", "zones", "adapt", "brave", "crisp", "dwarf",
  "epoch", "focus", "globe", "humble", "ideal", "jumbo", "knack", "loyal",
  "modest", "naval", "onion", "polar", "quota", "rapid", "scale", "trend",
  "usher", "vital", "weary", "axiom", "yeast", "zonal", "amaze", "bonus",
  "cider", "dozen", "elite", "fable", "grain", "humor", "index", "joust",
  "kudos", "linen", "mural", "novel", "oxide", "pixel", "qualm", "ridge",
  "scope", "theta", "unify", "vapor", "wrist", "proxy", "yummy", "zephyr",
  "amber", "bicep", "camel", "debug", "expel", "finch", "glide", "honor",
  "impel", "japan", "kebab", "llama", "mocha", "notch", "omega", "plank",
  "quilt", "rumor", "shrub", "tunic", "udder", "vinyl", "waltz", "yodel",
  "plaza", "anvil", "bison", "cedar", "diver", "elfin", "ferry", "gecko",
  "hippo", "igloo", "jumpy", "koala", "lyric", "melon", "nerdy", "otter",
  "panda", "quirk", "rhino", "squid", "tulip", "umbra", "viper", "wacky",
  "yappy", "zappy", "arrow", "badge", "cabin", "diary", "event", "flask",
  "grape", "hatch", "intel", "jelly", "kiosk", "label", "medal", "nudge",
  "outdo", "patch", "query", "roast", "snack", "torch", "under", "vault",
  "wafer", "youth", "zingy", "alien", "burnt", "clash", "dodge", "eject",
  "flint", "gamer", "hinge", "input", "juicy", "kneel", "lodge", "miner",
];

// Storage keys
const BACKUP_ENABLED_KEY = "spritz_backup_enabled";
const BACKUP_SALT_KEY = "spritz_backup_salt";

/**
 * Generate a random 12-word recovery phrase
 */
export function generateRecoveryPhrase(): string {
  const entropy = crypto.getRandomValues(new Uint8Array(12));
  const words: string[] = [];
  
  for (let i = 0; i < 12; i++) {
    words.push(WORDS[entropy[i]]);
  }
  
  return words.join(" ");
}

/**
 * Convert recovery phrase to entropy bytes
 */
export function phraseToEntropy(phrase: string): Uint8Array | null {
  const words = phrase.toLowerCase().trim().split(/\s+/);
  
  if (words.length !== 12) {
    return null;
  }
  
  const entropy = new Uint8Array(12);
  
  for (let i = 0; i < 12; i++) {
    const index = WORDS.indexOf(words[i]);
    if (index === -1) {
      return null;
    }
    entropy[i] = index;
  }
  
  return entropy;
}

/**
 * Validate PIN format (6 digits)
 */
export function validatePin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/**
 * Derive encryption key from phrase + PIN using PBKDF2
 * This is the key used to encrypt/decrypt the ECDH private key
 */
export async function deriveKeyFromPhraseAndPin(
  phrase: string,
  pin: string,
  salt?: Uint8Array
): Promise<{ key: Uint8Array; salt: Uint8Array } | null> {
  const entropy = phraseToEntropy(phrase);
  if (!entropy || !validatePin(pin)) {
    return null;
  }
  
  // Use provided salt or generate new one
  const useSalt = salt || crypto.getRandomValues(new Uint8Array(16));
  
  // Combine entropy + PIN
  const pinBytes = new TextEncoder().encode(pin);
  const combined = new Uint8Array(entropy.length + pinBytes.length);
  combined.set(entropy);
  combined.set(pinBytes, entropy.length);
  
  // Import as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    combined,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  // Convert salt to ArrayBuffer for TypeScript
  const saltBuffer = new ArrayBuffer(useSalt.length);
  new Uint8Array(saltBuffer).set(useSalt);
  
  // Derive 256-bit key with PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  
  return {
    key: new Uint8Array(derivedBits),
    salt: useSalt,
  };
}

/**
 * Encrypt data with derived key
 */
export async function encryptWithDerivedKey(
  data: Uint8Array,
  key: Uint8Array
): Promise<string> {
  const keyBuffer = new ArrayBuffer(key.length);
  new Uint8Array(keyBuffer).set(key);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Convert data to ArrayBuffer for TypeScript
  const dataBuffer = new ArrayBuffer(data.length);
  new Uint8Array(dataBuffer).set(data);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    dataBuffer
  );
  
  // Combine IV + encrypted
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypt data with derived key
 */
export async function decryptWithDerivedKey(
  encryptedBase64: string,
  key: Uint8Array
): Promise<Uint8Array | null> {
  try {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const keyBuffer = new ArrayBuffer(key.length);
    new Uint8Array(keyBuffer).set(key);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      encrypted
    );
    
    return new Uint8Array(decrypted);
  } catch {
    return null;
  }
}

/**
 * Get random word indices for verification (e.g., "Enter word #3, #7, #11")
 */
export function getVerificationIndices(): number[] {
  const indices: number[] = [];
  while (indices.length < 3) {
    const idx = Math.floor(Math.random() * 12) + 1;
    if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }
  return indices.sort((a, b) => a - b);
}

/**
 * Verify user entered correct words at given positions
 */
export function verifyWords(
  phrase: string,
  indices: number[],
  userWords: string[]
): boolean {
  const words = phrase.toLowerCase().trim().split(/\s+/);
  
  for (let i = 0; i < indices.length; i++) {
    const expectedWord = words[indices[i] - 1]; // indices are 1-based
    const userWord = userWords[i]?.toLowerCase().trim();
    if (expectedWord !== userWord) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if backup is enabled
 */
export function isBackupEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BACKUP_ENABLED_KEY) === "true";
}

/**
 * Set backup enabled status
 */
export function setBackupEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKUP_ENABLED_KEY, enabled ? "true" : "false");
}

/**
 * Get stored salt for key derivation
 */
export function getStoredSalt(): Uint8Array | null {
  if (typeof window === "undefined") return null;
  const saltBase64 = localStorage.getItem(BACKUP_SALT_KEY);
  if (!saltBase64) return null;
  return Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
}

/**
 * Store salt for key derivation
 */
export function storeSalt(salt: Uint8Array): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKUP_SALT_KEY, btoa(String.fromCharCode(...salt)));
}

/**
 * Validate recovery phrase format
 */
export function validatePhrase(phrase: string): { valid: boolean; error?: string } {
  const words = phrase.toLowerCase().trim().split(/\s+/);
  
  if (words.length !== 12) {
    return { valid: false, error: `Expected 12 words, got ${words.length}` };
  }
  
  for (const word of words) {
    if (!WORDS.includes(word)) {
      return { valid: false, error: `Unknown word: "${word}"` };
    }
  }
  
  return { valid: true };
}

/**
 * Get a specific word from phrase by index (1-based)
 */
export function getWordAtIndex(phrase: string, index: number): string {
  const words = phrase.split(/\s+/);
  return words[index - 1] || "";
}
