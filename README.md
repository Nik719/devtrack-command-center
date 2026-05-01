# DevTrack Command Center

A lightweight engineering issue tracker with a Django REST backend, JSON file storage, and a plain HTML/CSS/JavaScript Kanban dashboard. No database, no React — just clean Python and vanilla JS.

---

## Setup

```bash
# 1. Create virtual environment
python -m venv venv

# 2. Activate
# Windows:
venv\Scripts\activate
# Mac / Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
python manage.py runserver
```

Open your browser at **http://127.0.0.1:8000** to see the dashboard.

---

## API Endpoints

### Reporters

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/reporters/` | Create a reporter |
| GET | `/api/reporters/` | List all reporters |
| GET | `/api/reporters/?id=1` | Get reporter by ID |

### Issues

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/issues/` | Create an issue |
| GET | `/api/issues/` | List all issues (with `sla_risk`) |
| GET | `/api/issues/?id=1` | Get issue by ID |
| GET | `/api/issues/?status=open` | Filter by status |
| GET | `/api/issues/?priority=critical` | Filter by priority |
| GET | `/api/issues/?reporter_id=1` | Filter by reporter |
| GET | `/api/issues/?team=backend` | Filter by team |
| GET | `/api/issues/?status=open&priority=high` | Combine filters |

### Stats

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/issues/stats/` | Aggregated counts by status, priority, team |

### Search

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/issues/search/?q=login` | Full-text search in title and description |

---

## Frontend

The dashboard is served at **http://127.0.0.1:8000/** by Django.

You can also open `frontend/index.html` directly in a browser — note that API calls will require the Django server to be running on the same origin (same port). Opening the file directly via `file://` will hit CORS; use the Django URL instead.

Features:
- **4 stat cards** — Total, Open, Critical, SLA Risk
- **Kanban board** — Open / In Progress / Resolved / Closed columns
- **Filters** — Status, Priority, Team dropdowns
- **Search bar** — keyword search across title and description
- **Create Issue form** — with validation errors, success message, and duplicate warning

---

## Testing with curl / Postman

### Create a reporter
```bash
curl -X POST http://127.0.0.1:8000/api/reporters/ \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","team":"backend"}'
```

### Create an issue
```bash
curl -X POST http://127.0.0.1:8000/api/issues/ \
  -H "Content-Type: application/json" \
  -d '{"title":"Login button broken","description":"Login button does not respond on click","status":"open","priority":"high","reporter_id":1}'
```

### Create a duplicate issue (triggers warning)
```bash
curl -X POST http://127.0.0.1:8000/api/issues/ \
  -H "Content-Type: application/json" \
  -d '{"title":"Login button not working on mobile","description":"Login button unresponsive","status":"open","priority":"high","reporter_id":1}'
```

### Get stats
```bash
curl http://127.0.0.1:8000/api/issues/stats/
```

### Filter by team
```bash
curl "http://127.0.0.1:8000/api/issues/?team=backend"
```

### Search issues
```bash
curl "http://127.0.0.1:8000/api/issues/search/?q=login"
```

---

## Design Decisions

**Why JSON files?**
JSON files keep the project self-contained and dependency-free. No database setup, no migrations — just clone and run. For a real production system you would swap `read_json` / `write_json` for a database layer without touching the API or OOP classes.

**Why separate OOP classes in `models.py`?**
`BaseEntity` provides a shared concrete `to_dict()` (using `__dict__`) and declares `validate()` as abstract. `Reporter` and `Issue` each implement `validate()` with `raise ValueError(...)`. `CriticalIssue` and `LowPriorityIssue` override only `describe()`. The views instantiate the correct subclass via `build_issue()` and delegate all validation to the model, keeping the view layer thin.

**Inheritance hierarchy:**
```
BaseEntity (abstract — validate(); concrete — to_dict())
├── Reporter
└── Issue
    ├── CriticalIssue     (overrides describe())
    └── LowPriorityIssue  (overrides describe())
```
