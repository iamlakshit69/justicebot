FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Expose the port used by Hugging Face Spaces
EXPOSE 7860

# Hugging Face Spaces requires running as a non-root user
RUN useradd -m -u 1000 user
USER user

# Set environment variables for the user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Run with gunicorn on port 7860
CMD ["gunicorn", \
     "--workers", "2", \
     "--threads", "4", \
     "--timeout", "120", \
     "--bind", "0.0.0.0:7860", \
     "--access-logfile", "-", \
     "app:app"]
