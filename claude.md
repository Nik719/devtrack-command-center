# DevTrack — Submission Document

**Project:** Backend API for tracking engineering issues  
**Stack:** Django · Python · JSON file storage · Vanilla JS frontend  
**Author:** Nikhil

---

## 1. Project Structure

```
devtrack/
├── manage.py
├── requirements.txt
├── data/
│   ├── issues.json          # persisted issues
│   └── reporters.json       # persisted reporters
├── devtrack/
│   ├── settings.py
│   └── urls.py              # root URL config
├── issues/
│   ├── models.py            # OOP classes — BaseEntity, Reporter, Issue, subclasses
│   ├── views.py             # all API logic
│   └── urls.py              # /api/ routes
└── frontend/
    ├── index.html           # Kanban dashboard
    ├── script.js
    └── style.css
```

---

## 2. OOP Design

### Part A — BaseEntity, validate(), to_dict()

`BaseEntity` is an abstract class. Every entity must implement `validate()`. `to_dict()` is a shared concrete method that serializes any instance using `__dict__`.

```python
from abc import ABC, abstractmethod

class BaseEntity(ABC):
    @abstractmethod
    def validate(self):
        pass

    def to_dict(self):
        return {
            key: value
            for key, value in self.__dict__.items()
        }
```

`Reporter` inherits from `BaseEntity` and implements `validate()` with `raise ValueError(...)`:

```python
class Reporter(BaseEntity):
    def __init__(self, id, name, email, team):
        self.id = id
        self.name = name
        self.email = email
        self.team = team

    def validate(self):
        if not self.name:
            raise ValueError('Name cannot be empty')
        if '@' not in self.email:
            raise ValueError('Invalid email')
        if not self.team:
            raise ValueError('Team cannot be empty')
```

`Issue` inherits from `BaseEntity` and validates title, status, priority, and reporter_id:

```python
VALID_STATUSES  = {"open", "in_progress", "resolved", "closed"}
VALID_PRIORITIES = {"low", "medium", "high", "critical"}

class Issue(BaseEntity):
    def __init__(self, id, title, description, status, priority, reporter_id, created_at=None):
        self.id          = id
        self.title       = title
        self.description = description
        self.status      = status
        self.priority    = priority
        self.reporter_id = reporter_id
        self.created_at  = created_at or str(datetime.now())

    def validate(self):
        if not self.title:
            raise ValueError('Title cannot be empty')
        if self.status not in VALID_STATUSES:
            raise ValueError(f'Status must be one of: {", ".join(VALID_STATUSES)}')
        if self.priority not in VALID_PRIORITIES:
            raise ValueError(f'Priority must be one of: {", ".join(VALID_PRIORITIES)}')
        if not self.reporter_id:
            raise ValueError('reporter_id is required')

    def describe(self):
        return f"{self.title} [{self.priority}]"
```

### Part B — Priority subclasses using inheritance

`CriticalIssue` and `LowPriorityIssue` both inherit from `Issue` and override only `describe()`:

```python
class CriticalIssue(Issue):
    def describe(self):
        return f"[URGENT] {self.title} — needs immediate attention"

class LowPriorityIssue(Issue):
    def describe(self):
        return f"{self.title} — low priority, handle when free"
```

**Inheritance hierarchy:**

```
BaseEntity  (abstract: validate | concrete: to_dict)
├── Reporter
└── Issue
    ├── CriticalIssue     (overrides describe)
    └── LowPriorityIssue  (overrides describe)
```

### Factory in views.py

The view instantiates the correct subclass based on priority, then calls `validate()` and `describe()`:

```python
def build_issue(id, data, created_at=None):
    priority    = data.get('priority', '')
    title       = data.get('title', '')
    description = data.get('description', '')
    status      = data.get('status', '')
    reporter_id = data.get('reporter_id')

    if priority == 'critical':
        return CriticalIssue(id, title, description, status, 'critical', reporter_id, created_at)
    if priority == 'low':
        return LowPriorityIssue(id, title, description, status, 'low', reporter_id, created_at)
    return Issue(id, title, description, status, priority, reporter_id, created_at)
```

In the POST view:

```python
issue_obj = build_issue(next_id(issues), body)
try:
    issue_obj.validate()
except ValueError as e:
    return JsonResponse({"error": str(e)}, status=400)

data = issue_obj.to_dict()
issues.append(data)
write_json('issues.json', issues)

response_data = issue_obj.to_dict()
response_data['message'] = issue_obj.describe()
return JsonResponse(response_data, status=201)
```

---

## 3. Django Setup

- Django project: `devtrack`
- App: `issues` — registered in `INSTALLED_APPS`
- `issues/urls.py` included under `api/` in the project's `devtrack/urls.py`
- Data stored in `data/issues.json` and `data/reporters.json`

**settings.py relevant config:**

```python
INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.staticfiles',
    'issues',
]

DATA_DIR = BASE_DIR / 'data'
```

**devtrack/urls.py:**

```python
urlpatterns = [
    path('api/', include('issues.urls')),
    path('', TemplateView.as_view(template_name='index.html'), name='dashboard'),
]
```

**issues/urls.py:**

```python
urlpatterns = [
    path('reporters/',       views.reporters_view, name='reporters'),
    path('issues/stats/',    views.issues_stats,   name='issues-stats'),
    path('issues/search/',   views.issues_search,  name='issues-search'),
    path('issues/',          views.issues_view,    name='issues'),
]
```

---

## 4. Endpoints and Sample Responses

### Reporters

**POST /api/reporters/** — Create a reporter

Request:
```json
{ "name": "Alice", "email": "alice@example.com", "team": "backend" }
```

Response 201:
```json
{ "id": 1, "name": "Alice", "email": "alice@example.com", "team": "backend" }
```

Response 400:
```json
{ "error": "Invalid email" }
```

---

**GET /api/reporters/** — List all reporters

Response 200:
```json
[
  { "id": 1, "name": "Alice", "email": "alice@example.com", "team": "backend" },
  { "id": 2, "name": "Bob",   "email": "bob@example.com",   "team": "frontend" }
]
```

---

**GET /api/reporters/?id=1** — Get a single reporter

Response 200:
```json
{ "id": 1, "name": "Alice", "email": "alice@example.com", "team": "backend" }
```

Response 404:
```json
{ "error": "Reporter not found" }
```

---

### Issues

**POST /api/issues/** — Create an issue

Request:
```json
{
  "title": "Login button not working on mobile",
  "description": "Users on iOS 17 cannot tap the login button",
  "status": "open",
  "priority": "critical",
  "reporter_id": 1
}
```

Response 201 (CriticalIssue — describe() called):
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

Response 400 (validation failure):
```json
{ "error": "Title cannot be empty" }
```

---

**GET /api/issues/** — List all issues

Response 200:
```json
[
  {
    "id": 1,
    "title": "Login button not working on mobile",
    "status": "open",
    "priority": "critical",
    "reporter_id": 1,
    "created_at": "2026-05-01 15:13:25.252497",
    "sla_risk": true
  }
]
```

---

**GET /api/issues/?id=1** — Get single issue

Response 200: issue object with `sla_risk`  
Response 404:
```json
{ "error": "Issue not found" }
```

---

**GET /api/issues/?status=open** — Filter by status

Returns all issues where `status == "open"`, each with `sla_risk`.

---

## 5. How to Run

```bash
# Windows
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver
```

Open **http://127.0.0.1:8000** for the Kanban dashboard.  
Use **http://127.0.0.1:8000/api/** for Postman testing.

---

## 6. Key Design Decisions

**validate() raises ValueError, not returns a list**  
Each class calls `raise ValueError('...')` on the first failing rule. The view wraps the call in `try/except ValueError as e` and returns `{"error": str(e)}`. This keeps validation logic in the model and error formatting in the view.

**to_dict() lives only in BaseEntity**  
Using `self.__dict__` means any subclass automatically serializes all its instance attributes without overriding anything. Adding a new field to `__init__` is enough — no `to_dict()` update needed.

**describe() is overridden per subclass**  
This is the method-overriding pattern from class. `Issue.describe()` returns `"{title} [{priority}]"`. `CriticalIssue` overrides it to return the URGENT string. `LowPriorityIssue` overrides it for the low priority string. The view calls `issue_obj.describe()` without knowing which subclass it has.

**JSON file storage**  
`read_json` / `write_json` in `views.py` handle all I/O. Swapping to a database requires changing only these two functions — the OOP models and view logic are unaffected.

**One Reporter → Many Issues (1:many)**  
`reporter_id` is stored on the Issue. The reporter record is never modified when issues are created. To find all issues by a reporter, filter by `reporter_id`.
