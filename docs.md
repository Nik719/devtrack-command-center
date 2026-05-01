# DevTrack API — Feature Documentation

**Base URL:** `http://127.0.0.1:8000`  
**Content-Type:** `application/json` for all POST / PATCH requests  
**Storage:** `data/reporters.json`, `data/issues.json`

---

## Data Models

### Reporter

| Field | Type   | Rules |
|-------|--------|-------|
| id    | int    | Auto-assigned, unique |
| name  | string | Required, non-empty |
| email | string | Required, must contain `@` |
| team  | string | Required, non-empty (e.g. `backend`, `frontend`, `devops`) |

### Issue

| Field       | Type   | Rules |
|-------------|--------|-------|
| id          | int    | Auto-assigned, unique |
| title       | string | Required, non-empty |
| description | string | Required |
| status      | string | One of: `open`, `in_progress`, `resolved`, `closed` |
| priority    | string | One of: `low`, `medium`, `high`, `critical` |
| reporter_id | int    | Required, must reference a valid reporter |
| created_at  | string | Auto-set to `str(datetime.now())` on creation |
| sla_risk    | bool   | Computed on read — `true` when priority is `critical`/`high` AND status is `open`/`in_progress` |

---

## OOP Class Summary

| Class | Role |
|-------|------|
| `BaseEntity` | Abstract base — declares `validate()`, provides concrete `to_dict()` via `__dict__` |
| `Reporter` | Validates name, email, team |
| `Issue` | Validates title, status, priority, reporter_id. `describe()` → `"{title} [{priority}]"` |
| `CriticalIssue` | Extends Issue. `describe()` → `"[URGENT] {title} — needs immediate attention"` |
| `LowPriorityIssue` | Extends Issue. `describe()` → `"{title} — low priority, handle when free"` |

The POST /api/issues/ view selects the subclass via `build_issue()`:
- `priority == "critical"` → `CriticalIssue`
- `priority == "low"` → `LowPriorityIssue`
- anything else → `Issue`

---

## Reporter Endpoints

### POST /api/reporters/

Create a new reporter.

**Request body:**
```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "team": "backend"
}
```

**201 Created:**
```json
{
  "id": 1,
  "name": "Alice",
  "email": "alice@example.com",
  "team": "backend"
}
```

**400 Bad Request (validation):**
```json
{ "error": "Invalid email" }
```

---

### GET /api/reporters/

List all reporters.

**200 OK:**
```json
[
  { "id": 1, "name": "Alice", "email": "alice@example.com", "team": "backend" },
  { "id": 2, "name": "Bob",   "email": "bob@example.com",   "team": "frontend" }
]
```

---

### GET /api/reporters/?id=1

Get a single reporter by ID.

**200 OK:**
```json
{ "id": 1, "name": "Alice", "email": "alice@example.com", "team": "backend" }
```

**404 Not Found:**
```json
{ "error": "Reporter not found" }
```

---

## Issue Endpoints

### POST /api/issues/

Create a new issue. Returns the issue dict plus a `message` field from `describe()`.  
If the title shares 2+ significant words with an existing issue, a `duplicate_warning` is added.

**Request body:**
```json
{
  "title": "Login button not working on mobile",
  "description": "Users on iOS 17 cannot tap the login button",
  "status": "open",
  "priority": "critical",
  "reporter_id": 1
}
```

**201 Created — critical priority (`CriticalIssue.describe()`):**
```json
{
  "id": 1,
  "title": "Login button not working on mobile",
  "description": "Users on iOS 17 cannot tap the login button",
  "status": "open",
  "priority": "critical",
  "reporter_id": 1,
  "created_at": "2026-05-01 15:13:25.252497",
  "message": "[URGENT] Login button not working on mobile — needs immediate attention"
}
```

**201 Created — low priority (`LowPriorityIssue.describe()`):**
```json
{
  "id": 2,
  "title": "Fix tooltip wording",
  "description": "Minor copy change",
  "status": "open",
  "priority": "low",
  "reporter_id": 1,
  "created_at": "2026-05-01 15:14:00.000000",
  "message": "Fix tooltip wording — low priority, handle when free"
}
```

**201 Created — with duplicate warning:**
```json
{
  "id": 3,
  "title": "Login button broken on desktop",
  ...
  "message": "Login button broken on desktop [high]",
  "duplicate_warning": "Possible duplicate: Login button not working on mobile"
}
```

**400 Bad Request:**
```json
{ "error": "Title cannot be empty" }
{ "error": "Status must be one of: open, in_progress, resolved, closed" }
{ "error": "Priority must be one of: low, medium, high, critical" }
{ "error": "reporter_id is required" }
```

---

### GET /api/issues/

List all issues. Every issue includes a computed `sla_risk` boolean.

**200 OK:**
```json
[
  {
    "id": 1,
    "title": "Login button not working on mobile",
    "description": "Users on iOS 17 cannot tap the login button",
    "status": "open",
    "priority": "critical",
    "reporter_id": 1,
    "created_at": "2026-05-01 15:13:25.252497",
    "sla_risk": true
  },
  {
    "id": 2,
    "title": "DB timeout fixed",
    "description": "Root cause was connection pool exhaustion",
    "status": "open",
    "priority": "medium",
    "reporter_id": 2,
    "created_at": "2026-05-01 08:50:58.978516",
    "sla_risk": false
  }
]
```

---

### GET /api/issues/?id=1

Get a single issue by ID.

**200 OK:** issue object with `sla_risk`

**404 Not Found:**
```json
{ "error": "Issue not found" }
```

---

### GET /api/issues/?status=open

Filter issues by status. Combine with other params for multi-filter.

**Supported query params:**

| Param | Example | Effect |
|-------|---------|--------|
| `id` | `?id=3` | Single issue by ID |
| `status` | `?status=open` | Filter by status |
| `priority` | `?priority=critical` | Filter by priority |
| `reporter_id` | `?reporter_id=1` | Filter by reporter |
| `team` | `?team=backend` | Filter by reporter's team |

**Combined example:** `GET /api/issues/?status=open&priority=high`

---

### PATCH /api/issues/?id=1

Update any subset of `title`, `description`, `status`, or `priority`. Validates after applying changes.

**Request body (any or all fields):**
```json
{ "status": "resolved" }
```

**200 OK:** updated issue with `sla_risk`

**400 Bad Request:** validation error (same format as POST)  
**404 Not Found:** `{ "error": "Issue not found" }`

---

### DELETE /api/issues/?id=1

Delete an issue permanently.

**200 OK:**
```json
{ "deleted": 1 }
```

**404 Not Found:**
```json
{ "error": "Issue not found" }
```

---

## Stats Endpoint

### GET /api/issues/stats/

Aggregated counts across all issues. Counts by team are resolved through reporter records.

**200 OK:**
```json
{
  "total": 6,
  "open": 3,
  "in_progress": 1,
  "resolved": 1,
  "closed": 1,
  "critical": 2,
  "sla_risk": 2,
  "by_team": {
    "backend": 4,
    "frontend": 2
  },
  "by_priority": {
    "low": 2,
    "medium": 1,
    "high": 1,
    "critical": 2
  }
}
```

---

## Search Endpoint

### GET /api/issues/search/?q=login

Full-text search across `title` and `description` (case-insensitive substring match).

**200 OK:** array of matching issues, each with `sla_risk`

**400 Bad Request (empty query):**
```json
{ "error": "Search query is required" }
```

---

## Error Reference

| Status | When |
|--------|------|
| 400 | Invalid JSON body, failed validation, invalid id param |
| 404 | Record not found |
| 405 | Method not allowed on that route |

All error responses use the same shape:
```json
{ "error": "Human-readable message" }
```

---

## SLA Risk Rules

An issue is flagged `sla_risk: true` when **both** conditions are met:
- `priority` is `critical` or `high`
- `status` is `open` or `in_progress`

This is computed on every GET response and in the stats endpoint. It is never stored in the JSON file — always derived.

---

## Duplicate Detection

When creating an issue via POST, the title is compared against all existing issue titles. Significant words (non-stop-words) are extracted from both titles. If 2 or more significant words overlap, a `duplicate_warning` key is added to the 201 response. The issue is still created — the warning is advisory only.

Stop words ignored: `the, is, on, a, an, and, or, to, in, of, for, not, with`

---

## Running the Server

```bash
# 1 — Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Mac / Linux

# 2 — Install dependencies
pip install -r requirements.txt

# 3 — Start server
python manage.py runserver
```

Dashboard: **http://127.0.0.1:8000**  
API root: **http://127.0.0.1:8000/api/**

---

## Postman Quick-Start

| Test | Method | URL | Body |
|------|--------|-----|------|
| Create reporter | POST | `/api/reporters/` | `{"name":"Alice","email":"alice@example.com","team":"backend"}` |
| List reporters | GET | `/api/reporters/` | — |
| Get reporter | GET | `/api/reporters/?id=1` | — |
| Create critical issue | POST | `/api/issues/` | `{"title":"API down","description":"503 on all routes","status":"open","priority":"critical","reporter_id":1}` |
| Create low issue | POST | `/api/issues/` | `{"title":"Fix typo","description":"Minor copy","status":"open","priority":"low","reporter_id":1}` |
| List all issues | GET | `/api/issues/` | — |
| Filter by status | GET | `/api/issues/?status=open` | — |
| Filter by team | GET | `/api/issues/?team=backend` | — |
| Get one issue | GET | `/api/issues/?id=1` | — |
| Update status | PATCH | `/api/issues/?id=1` | `{"status":"resolved"}` |
| Delete issue | DELETE | `/api/issues/?id=1` | — |
| Stats | GET | `/api/issues/stats/` | — |
| Search | GET | `/api/issues/search/?q=login` | — |
| Trigger 400 | POST | `/api/issues/` | `{"title":"","description":"x","status":"open","priority":"high","reporter_id":1}` |
| Trigger 404 | GET | `/api/issues/?id=9999` | — |
