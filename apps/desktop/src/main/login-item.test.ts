/**
 * The point of these tests is the lie this module exists to prevent: a
 * settings file that says Mochi starts at sign-in while the OS has no login
 * item for it. Every case below is a way that disagreement arises.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  applyLaunchOnLogin,
  loginItemSupported,
  readLaunchOnLogin,
  reconcileLaunchOnLogin,
  type LoginItemOs,
} from './login-item.js';

/** A cooperative OS that does what it is told. */
function fakeOs(initial: boolean, platform = 'win32'): LoginItemOs & { value: boolean } {
  return {
    platform,
    value: initial,
    read(): boolean {
      return this.value;
    },
    write(enabled: boolean): void {
      this.value = enabled;
    },
  };
}

/** An OS that accepts the call and changes nothing — a managed machine. */
function refusingOs(stuck: boolean, platform = 'win32'): LoginItemOs {
  return {
    platform,
    read: () => stuck,
    write: () => {
      /* accepted and discarded, exactly as a locked startup policy behaves */
    },
  };
}

describe('loginItemSupported', () => {
  it('covers the platforms Electron implements', () => {
    expect(loginItemSupported('win32')).toBe(true);
    expect(loginItemSupported('darwin')).toBe(true);
  });

  it('excludes Linux, where the call is a no-op', () => {
    expect(loginItemSupported('linux')).toBe(false);
  });
});

describe('readLaunchOnLogin', () => {
  it('reports what the OS says', () => {
    expect(readLaunchOnLogin(fakeOs(true))).toBe(true);
    expect(readLaunchOnLogin(fakeOs(false))).toBe(false);
  });

  it('is false on an unsupported platform without asking', () => {
    const os = fakeOs(true, 'linux');
    const read = vi.spyOn(os, 'read');
    expect(readLaunchOnLogin(os)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('treats a throwing OS as "no login item" rather than propagating', () => {
    const os: LoginItemOs = {
      platform: 'win32',
      read: () => {
        throw new Error('registry unavailable');
      },
      write: () => undefined,
    };
    expect(readLaunchOnLogin(os)).toBe(false);
  });
});

describe('applyLaunchOnLogin', () => {
  it('returns the value read back, not the value requested', () => {
    const os = fakeOs(false);
    expect(applyLaunchOnLogin(os, true)).toBe(true);
    expect(os.value).toBe(true);
  });

  it('reports false when the OS accepts the call and does nothing', () => {
    // The whole reason this returns a value instead of void: without the
    // read-back the caller would store `true` and the toggle would claim a
    // login item that does not exist.
    expect(applyLaunchOnLogin(refusingOs(false), true)).toBe(false);
  });

  it('reports true when the OS refuses to remove an item it insists on', () => {
    expect(applyLaunchOnLogin(refusingOs(true), false)).toBe(true);
  });

  it('does not throw when the write throws, and still reports the OS state', () => {
    const os: LoginItemOs = {
      platform: 'win32',
      read: () => false,
      write: () => {
        throw new Error('access denied');
      },
    };
    expect(applyLaunchOnLogin(os, true)).toBe(false);
  });

  it('changes nothing on an unsupported platform', () => {
    const os = fakeOs(false, 'linux');
    const write = vi.spyOn(os, 'write');
    expect(applyLaunchOnLogin(os, true)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('reconcileLaunchOnLogin', () => {
  it('agrees with the stored value when the OS does', () => {
    expect(reconcileLaunchOnLogin(fakeOs(true), true)).toBe(true);
    expect(reconcileLaunchOnLogin(fakeOs(false), false)).toBe(false);
  });

  it('takes the OS answer when the user removed the item by hand', () => {
    // Settings say on, Task Manager says off. This is the case the module was
    // written for, and the stored value must lose.
    expect(reconcileLaunchOnLogin(fakeOs(false), true)).toBe(false);
  });

  it('takes the OS answer when an item exists that settings do not know about', () => {
    expect(reconcileLaunchOnLogin(fakeOs(true), false)).toBe(true);
  });

  it('never writes to the OS', () => {
    // Reconciling in the other direction would silently re-create a login
    // item the user had just deleted.
    const os = fakeOs(false);
    const write = vi.spyOn(os, 'write');
    reconcileLaunchOnLogin(os, true);
    expect(write).not.toHaveBeenCalled();
  });
});
