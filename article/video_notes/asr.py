"""Isolate native CPU transcription so a stalled decoder has a hard deadline."""
import json
import sys


def main(model, cache, audio):
    try:
        from faster_whisper import WhisperModel
        recognizer = WhisperModel(model, device='cpu', compute_type='int8', cpu_threads=4,
                                  download_root=cache, local_files_only=True)
    except (ImportError, RuntimeError, OSError, ValueError):
        return 2
    segments, _ = recognizer.transcribe(audio, vad_filter=True, beam_size=1)
    print(json.dumps([[s.start, s.end, s.text.strip()] for s in segments if s.text.strip()], ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:]))
