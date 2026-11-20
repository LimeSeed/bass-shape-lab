# Audio engine notes

`engine.ts` exposes the application API. `processor.js` owns source position,
A/B looping, gap length, and stop decisions on the audio render thread. The
transport advances by `outputFrames × speed / sampleRate`; pitch is passed
independently to Signalsmith Stretch. No `AudioBufferSourceNode.playbackRate`
shortcut implements the pitch control.

At exactly 1x speed and zero semitone shift the same transport reads original
PCM transparently, avoiding unnecessary phase-vocoder coloration. Entering or
leaving that mode explicitly resets DSP state and retains the same seek,
loop, gain, and transition fades.

`signalsmith-core.js` contains the unchanged Emscripten/WASM module extracted
from the official `signalsmith-stretch@1.3.2` npm release, before its Web Audio
wrapper. The WASM is embedded as a data URI. The MIT notice is preserved in a
legal comment and in `LICENSE-Signalsmith.txt`. The custom transport follows
the official buffer-mode analysis-window and latency compensation strategy.
Vite bundles the core and transport into a local AudioWorklet asset; there is
no CDN request or downloaded runtime model.

On seeks the worker calls `_reset()`, supplies a fresh source analysis window,
and applies a 6 ms fade. Loop endings use a 6 ms fade and stop reading samples
outside the selected region. Gap durations are integer output-sample counts.
Pause/seek discontinuities additionally fade the previous final sample toward
zero. Positive EQ boosts reserve output headroom equal to the sum of positive
band gains. EQ centers are 120, 800, and 3000 Hz.

`load()` copies at most two channels to the worklet using transferable buffers.
Replacing a song replaces those references. `dispose()` disconnects nodes,
closes the MessagePort, and closes its AudioContext. Repeated seek operations
reuse the same DSP instance and reset it rather than creating new nodes.

## Measured limits

The generated 110 Hz sine tests demonstrate independent speed and pitch.
They do not show mathematically perfect tuning: at 44.1 kHz, half speed/+12
semitones produces approximately 221.379 Hz rather than 220 Hz (10.82 cents).
The unchanged official Web Audio wrapper produces the same result, including
a spectral peak around 221.38 Hz. The original strict 1 Hz failure is retained
in `tests/dsp-results-strict-initial.json`. A separately stated practical
20-cent threshold passes; this must not be described as passing the original
strict threshold. Very slow speeds and large pitch shifts can alter tone and
transients. This tool is not a tuning reference.

48 kHz stereo, 120 repeated seeks/parameter changes, 12 sample-buffer
replacements, finite output, positive EQ headroom, pause stability, and context
shutdown were exercised in desktop Edge. GC behavior and physical device
memory reclamation were not instrumented. Real iOS/Android audio scheduling,
Bluetooth latency, background suspension, and subjective sound quality still
require device/listening verification.
