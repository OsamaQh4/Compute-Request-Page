# ── Args — set these at build time or in your CI pipeline ─────────────────────
ARG HARBOR_URL=k8sreglvp01.gosi.ins:8080
ARG HARBOR_PROJECT=vm-portal

FROM ${HARBOR_URL}/${HARBOR_PROJECT}/python:3.11-slim

WORKDIR /app

# Install system deps for ldap3 (libldap) and SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
        libldap2-dev \
        libsasl2-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
