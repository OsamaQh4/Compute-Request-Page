# VM Request Portal

A self-service web portal for requesting and managing virtual machines in a VMware vCenter environment. Employees submit VM provisioning or modification requests, admins approve or deny them, and an AI agent executes the approved operations against vCenter automatically.

---

## Features

- **Self-service VM requests** — requesters can submit new VM provisioning requests or request changes to existing VMs (CPU, memory, storage, snapshots)
- **Approval workflow** — admins review pending requests, add notes, and approve or deny them; auto-approval can also be configured
- **AI-driven execution** — on approval, an OpenAI-compatible AI agent receives a natural-language prompt and performs the actual vCenter operation
- **LDAP authentication** — login via Active Directory; role assignment (admin vs. requester) is based on AD group membership
- **Email notifications** — SMTP notifications sent at key workflow steps (submission, approval, denial, completion)
- **vCenter inventory sync** — admins can browse all VMs synced from configured vCenter instances
- **Admin settings UI** — configure LDAP, SMTP, vCenter connections, and the AI agent entirely from the web interface

---

## Architecture

```
┌─────────────────┐        ┌──────────────────────┐
│  React Frontend │ ──────▶│  FastAPI Backend      │
│  (Vite + TS +   │        │  (Python 3)           │
│   Tailwind CSS) │        │                       │
└─────────────────┘        │  ┌────────────────┐   │
                           │  │ SQLite / DB    │   │
                           │  └────────────────┘   │
                           │                       │
                           │  Integrations:        │
                           │  • LDAP (ldap3)       │
                           │  • vCenter (httpx)    │
                           │  • SMTP (aiosmtplib)  │
                           │  • AI Agent (OpenAI-  │
                           │    compatible API)    │
                           └──────────────────────┘
```

### Frontend pages

| Route | Role | Description |
|---|---|---|
| `/login` | All | LDAP login |
| `/portal` | Requester | Landing page with request options |
| `/portal/provision` | Requester | New VM provisioning form |
| `/portal/edit` | Requester | Edit an existing VM |
| `/portal/requests` | Requester | View personal request history |
| `/admin/approvals` | Admin | Review and act on pending requests |
| `/admin/vms` | Admin | Browse vCenter VM inventory |
| `/admin/settings` | Admin | Configure LDAP, SMTP, vCenter, AI agent |

### Backend routers

| Prefix | File | Purpose |
|---|---|---|
| `/api/auth` | `routers/auth.py` | Login, token refresh |
| `/api/vms` | `routers/vms.py` | VM inventory sync and listing |
| `/api/requests` | `routers/requests.py` | Submit, list, approve/deny requests |
| `/api/settings` | `routers/settings.py` | CRUD for all integration configs |
| `/api/health` | `main.py` | Liveness check |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Python 3, FastAPI 0.109, Uvicorn |
| ORM | SQLAlchemy 2.0 |
| Database | SQLite (default) — swappable via `DATABASE_URL` |
| Auth | JWT (python-jose), LDAP (ldap3) |
| Email | aiosmtplib |
| VM automation | httpx → OpenAI-compatible AI agent |
| Containerization | Docker, Docker Compose |
| Orchestration | Kubernetes |

---

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Run with Docker Compose

```bash
git clone <repo-url>
cd Compute-Request-Page
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/api/docs |

The SQLite database is persisted in a named Docker volume (`db_data`).

### Environment variables

The backend reads the following environment variables (or a `.env` file):

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | *(insecure default)* | JWT signing secret — **change in production** |
| `DATABASE_URL` | `sqlite:////data/vmrequest.db` | SQLAlchemy database URL |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | JWT lifetime (8 hours) |

---

## Configuration (via Admin UI)

All integration settings are stored in the database and managed through the **Admin → Settings** page. No config files need to be edited after initial deployment.

### LDAP

| Field | Description |
|---|---|
| Server / Port | AD server address and port (default 389) |
| Base DN | Root DN for searches |
| User search base | OU where user accounts live |
| Admin group DN | Members of this group get admin access |
| Requester group DN | Members of this group can submit requests |
| Bind DN / Password | Service account for group lookups |
| Use SSL / Ignore SSL | TLS options |

### vCenter

Multiple vCenter instances can be added. Each requires:
- URL, username, password
- Optional SSL ignore flag

A sync pulls the full VM inventory (name, CPU, memory, storage, power state, IP addresses, snapshots, datacenter/cluster/datastore/network).

### SMTP

| Field | Description |
|---|---|
| Host / Port | Mail server (default port 587) |
| Use TLS / Ignore SSL | TLS options |
| Username / Password | SMTP credentials |
| From address / name | Sender identity |
| Admin email(s) | Comma-separated list for admin notifications |

### AI Agent

Connects to any OpenAI-compatible endpoint (OpenAI, Azure OpenAI, local LLM, etc.).

| Field | Description |
|---|---|
| Base URL | API base (e.g. `https://api.openai.com`) |
| API Key | Bearer token |
| Model | Model name (e.g. `gpt-4`) |
| System prompt | Instructions prepended to every agent call |
| Ignore SSL | Skip TLS verification for private endpoints |

When a request is approved, the portal sends a natural-language prompt to `POST /v1/chat/completions` describing the exact operation, and stores the agent's response against the request record.

---

## Kubernetes Deployment

Manifests are in `k8s/`. Apply them in order:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml        # set SECRET_KEY here
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

The backend `Deployment` includes liveness (`/api/health`) and readiness probes, and mounts a `PersistentVolumeClaim` for the SQLite database.

Images are pulled from a Harbor registry. See `scripts/` for helper scripts:

| Script | Purpose |
|---|---|
| `build-push.sh` | Build and push images to Harbor |
| `deploy.sh` | Full deploy to the cluster |
| `setup-harbor-secret.sh` | Create the `harbor-registry-secret` pull secret |
| `configure-insecure-registry.sh` | Add Harbor as an insecure registry on nodes |
| `mirror-base-images.sh` | Mirror public base images into Harbor |

---

## Development

### Backend (local)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
SECRET_KEY=dev uvicorn app.main:app --reload --port 8000
```

### Frontend (local)

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

The Vite dev server proxies `/api` requests to `http://localhost:8000` (see `vite.config.ts`).

---

## Request Lifecycle

```
Requester submits form
        │
        ▼
  Request created (status: pending)
        │
        ├── auto-approval configured? ──yes──▶ status: auto_approved
        │                                              │
        └── no ──▶ Admin reviews                      │
                        │                             │
                   approve / deny                     │
                        │                             │
               approved ◀────────────────────────────┘
                        │
                        ▼
              AI Agent executes operation
              (provision VM  or  edit VM)
                        │
                        ▼
             status: completed / failed
             Agent response stored on request
```

---

## License

Internal tooling — no license file present.
