import { safeStorage } from 'electron';
import type { SensitiveValueCodec } from './sensitive-value-codec.js';

const ENVELOPE_PREFIX = 'mochi:protected:v1:';

/**
 * Protects local database fields with the operating-system credential store.
 *
 * There is intentionally no plaintext fallback. If DPAPI/Keychain/libsecret
 * is unavailable, construction fails and the caller uses session-only storage
 * rather than writing private email content in the clear.
 */
export class SafeStorageValueCodec implements SensitiveValueCodec {
  constructor() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Operating-system encrypted storage is unavailable.');
    }
  }

  isProtected(value: string): boolean {
    return value.startsWith(ENVELOPE_PREFIX);
  }

  protect(value: string): string {
    if (this.isProtected(value)) return value;
    const encrypted = safeStorage.encryptString(value).toString('base64');
    return `${ENVELOPE_PREFIX}${encrypted}`;
  }

  reveal(value: string): string {
    if (!this.isProtected(value)) return value;
    const encoded = value.slice(ENVELOPE_PREFIX.length);
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  }
}
