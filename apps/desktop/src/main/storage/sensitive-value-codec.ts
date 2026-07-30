/**
 * Encryption boundary for sensitive values persisted in SQLite.
 *
 * The adapter depends on this tiny interface rather than Electron directly so
 * its migration and persistence behaviour can be tested in a plain Node
 * process. Production always supplies SafeStorageValueCodec.
 */
export interface SensitiveValueCodec {
  isProtected(value: string): boolean;
  protect(value: string): string;
  reveal(value: string): string;
}
