# Backend image — FastAPI (uvicorn). The repo is bind-mounted to /app at runtime
# (see docker-compose.yml) so all the existing /app/... paths resolve and uploads
# persist on the host. This image only needs the Python dependency layer.
FROM python:3.11

WORKDIR /app/backend

# System libs some wheels need to build/run (cryptography, jq, pillow, etc.).
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libffi-dev libssl-dev libjpeg-dev zlib1g-dev \
        autoconf libtool curl \
    && rm -rf /var/lib/apt/lists/*

# Dependency layer (cached unless requirements.txt changes).
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Application code is provided via the bind mount at runtime (./ -> /app).
EXPOSE 8000

# Single worker on purpose: the in-memory rate limiter + scheduler assume one
# process. Scale horizontally only after moving those to Redis (see DEPLOY.md).
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
