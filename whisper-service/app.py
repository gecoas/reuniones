import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel

app = FastAPI()
model = WhisperModel(os.getenv("WHISPER_MODEL", "small"), device="cpu", compute_type="int8", download_root=os.getenv("WHISPER_DOWNLOAD_ROOT", "/models"))

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    suffix = os.path.splitext(audio.filename or "audio.m4a")[1] or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
        temp.write(await audio.read())
        filename = temp.name
    try:
        segments, _ = model.transcribe(filename, language="es", vad_filter=True)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if not text:
            raise HTTPException(status_code=422, detail="No se detectó voz en el audio")
        return {"transcript": text}
    finally:
        os.unlink(filename)
