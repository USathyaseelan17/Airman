# Use Python 3.11 explicitly
# 3.11 is stable and fully supported by pydantic-core
# (Python 3.14 causes build failures with older pydantic versions)
FROM python:3.11-slim

# All commands run from /app inside the container
WORKDIR /app

# ── Layer caching trick ───────────────────────────────────────────────────────
# Copy requirements first before source code.
# If requirements.txt hasn't changed, Docker skips pip install on rebuild.
COPY requirements.txt ./

# Install Python dependencies
# --no-cache-dir keeps the image smaller by not storing the pip cache
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the source code
# .dockerignore ensures venv and .env are NOT copied
COPY . .

# Tell Docker this container listens on port 8000
EXPOSE 8000

# Start the FastAPI app using uvicorn
# host 0.0.0.0 is required inside Docker —
# without it, the server only accepts connections from inside the container
# and other services (like Skynet) cannot reach it
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]