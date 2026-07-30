import { describe, expect, it } from 'vitest';
import { encodeScript, parseLine } from './activity-sampler.js';

describe('parseLine', () => {
  it('reads a normal line', () => {
    expect(parseLine('Code|4213')).toEqual({ process: 'Code', idleMs: 4213 });
  });

  it('reads a process name containing a dot', () => {
    // Observed on a real machine: packaged apps report as `WhatsApp.Root`.
    expect(parseLine('WhatsApp.Root|0')).toEqual({ process: 'WhatsApp.Root', idleMs: 0 });
  });

  it('handles an unknown process, which the helper reports as empty', () => {
    expect(parseLine('|9000')).toEqual({ process: '', idleMs: 9000 });
  });

  it('splits on the last separator, so a name with a pipe cannot break parsing', () => {
    expect(parseLine('Weird|Name|120')).toEqual({ process: 'Weird|Name', idleMs: 120 });
  });

  it('tolerates trailing whitespace from the pipe', () => {
    expect(parseLine('  Code|500  \r')).toEqual({ process: 'Code', idleMs: 500 });
  });

  it('rejects anything malformed rather than inventing a sample', () => {
    // The helper writes to a pipe that can carry PowerShell noise; a bad line
    // must not become a fabricated hour of activity.
    for (const junk of ['', '   ', 'no separator', 'Code|notanumber', 'Code|-5']) {
      expect(parseLine(junk)).toBeNull();
    }
  });
});

describe('encodeScript', () => {
  it('encodes as UTF-16LE, which is what -EncodedCommand expects', () => {
    // Getting this wrong yields a process that starts, writes a parse error to a
    // stderr nobody reads, and exits — indistinguishable from an idle user, and
    // exactly how this shipped broken the first time.
    const decoded = Buffer.from(encodeScript(10), 'base64').toString('utf16le');
    expect(decoded).toContain('GetForegroundWindow');
    expect(decoded).toContain('Start-Sleep -Seconds 10');
  });

  it('never reads a window title', () => {
    // The privacy guarantee, asserted rather than promised in a comment.
    const decoded = Buffer.from(encodeScript(10), 'base64').toString('utf16le');
    expect(decoded).not.toContain('GetWindowText');
    expect(decoded).not.toMatch(/MainWindowTitle/i);
  });

  it('carries the interval through', () => {
    const decoded = Buffer.from(encodeScript(30), 'base64').toString('utf16le');
    expect(decoded).toContain('Start-Sleep -Seconds 30');
  });
});
