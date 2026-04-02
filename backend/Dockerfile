# ── Args — set these at build time or in your CI pipeline ─────────────────────
ARG HARBOR_URL=k8sreglvp01.gosi.ins:8080
ARG HARBOR_PROJECT=vm-portal

FROM ${HARBOR_URL}/${HARBOR_PROJECT}/oraclelinux:9

WORKDIR /app

# Install Python 3.11 and ldap build dependencies via dnf
RUN dnf install -y \
        python3.11 \
        python3.11-devel \
        gcc \
        openldap-devel \
        cyrus-sasl-devel \
    && dnf clean all \
    && python3.11 -m ensurepip --upgrade

COPY requirements.txt .
RUN python3.11 -m pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data

EXPOSE 8000

CMD ["python3.11", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
