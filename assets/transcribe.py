"""Transcribes voice clips so demo-video produce can check the voice said exactly the script line, and time the captions.

    python -I transcribe.py <clip.wav> [<clip.wav> ...]

Prints one JSON object per clip: {"file": ..., "text": ..., "words": [{"word": ..., "start": ..., "end": ...}]}, with
times in seconds from the start of the clip. Needs the faster-whisper package; runs offline on the CPU once the model
has been downloaded the first time.
"""
import json
import sys

from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
for path in sys.argv[1:]:
    segments, _ = model.transcribe(path, language="en", vad_filter=True, word_timestamps=True)
    segments = list(segments)
    words = [
        {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
        for s in segments
        for w in (s.words or [])
    ]
    print(json.dumps({"file": path, "text": " ".join(s.text.strip() for s in segments), "words": words}), flush=True)
