"""Transcribes voice clips so demo-video produce can check the voice said exactly the script line, and time the captions.

    python -I transcribe.py <clip.wav> [<clip.wav> ...]

Prints one JSON object per clip: {"file": ..., "text": ..., "words": [{"word": ..., "start": ..., "end": ...}]}, with
times in seconds from the start of the clip. Needs the faster-whisper package; runs offline on the CPU once the model
has been downloaded the first time.

Audio is decoded by ffmpeg, not PyAV: faster-whisper's built-in decoder calls av.open(metadata_errors=...), which
PyAV's recent releases removed, so passing file paths makes transcription fail with a TypeError and the speech check
silently switches off. Handing the model a float32 array skips that path entirely.
"""
import json
import subprocess
import sys
import tempfile
import wave

import numpy as np
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000


def decode(path):
    """Mono 16 kHz samples for one clip, via ffmpeg, as float32 in [-1, 1]."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        wav_path = handle.name
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", path, "-vn", "-ac", "1",
         "-ar", str(SAMPLE_RATE), "-f", "wav", wav_path],
        check=True,
    )
    with wave.open(wav_path, "rb") as wav:
        frames = wav.readframes(wav.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


model = WhisperModel("small", device="cpu", compute_type="int8")
for path in sys.argv[1:]:
    segments, _ = model.transcribe(
        decode(path), language="en", vad_filter=True, word_timestamps=True
    )
    segments = list(segments)
    words = [
        {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
        for s in segments
        for w in (s.words or [])
    ]
    print(json.dumps({"file": path, "text": " ".join(s.text.strip() for s in segments), "words": words}), flush=True)
