FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Ensure data directory exists for JSON storage
RUN mkdir -p /app/data

EXPOSE 8000

# Production defaults — override with -e flags or docker-compose env
ENV DEBUG=False
ENV ALLOWED_HOSTS=*
ENV CORS_ALLOW_ALL_ORIGINS=True

CMD ["gunicorn", "devtrack.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "60"]
