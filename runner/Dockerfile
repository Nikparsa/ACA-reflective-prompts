FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy application files
COPY runner.py ./
COPY language_plugins ./language_plugins

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 5001
CMD ["python", "runner.py"]







