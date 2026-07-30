let audioContext: AudioContext | null = null;

/**
 * A quiet two-note chime synthesized locally with Web Audio.
 *
 * No bundled audio asset, network request, or operating-system beep. The
 * envelope is deliberately soft so a useful reminder does not feel like an
 * alarm.
 */
export async function playGentleAlertTone(): Promise<void> {
  const AudioContextType = window.AudioContext;
  audioContext ??= new AudioContextType();
  if (audioContext.state === 'suspended') await audioContext.resume();

  const start = audioContext.currentTime + 0.01;
  playNote(audioContext, 523.25, start, 0.42, 0.055);
  playNote(audioContext, 659.25, start + 0.2, 0.55, 0.045);
}

function playNote(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}
