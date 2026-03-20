FROM python:3.11-slim

WORKDIR /app

# ffmpeg is required by openai-whisper / pydub for audio decoding
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (~180 MB) so openai-whisper doesn't
# trigger the full CUDA build (~2 GB) when resolving its torch dependency.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
