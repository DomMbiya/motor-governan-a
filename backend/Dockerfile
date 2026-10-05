# API do Motor Determinístico Focado em Governança.
# Tudo o que a API precisa roda dentro deste contêiner: nada é chamado fora da máquina.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    RULES_DIR=/app/rules

# Plano B de formatos: LibreOffice (DOCX -> PDF), Tesseract com português (OCR) e
# fontes DejaVu (acentuação completa no dossiê). Tudo local.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui tesseract-ocr tesseract-ocr-por fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 motor
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY rules ./rules
COPY scripts ./scripts

RUN mkdir -p /data && chown -R motor:motor /data /app/rules
USER motor
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
