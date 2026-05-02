import json
import os
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Reporter, Issue, CriticalIssue, LowPriorityIssue

# ---------------------------------------------------------------------------
# JSON file helpers
# ---------------------------------------------------------------------------

def _path(filename):
    return os.path.join(settings.DATA_DIR, filename)


def read_json(filename):
    try:
        with open(_path(filename), 'r') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_json(filename, data):
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    with open(_path(filename), 'w') as f:
        json.dump(data, f, indent=2)


def next_id(records):
    return max((r['id'] for r in records), default=0) + 1


# ---------------------------------------------------------------------------
# SLA risk helper
# ---------------------------------------------------------------------------

def add_sla_risk(issue_dict):
    issue_dict['sla_risk'] = (
        issue_dict.get('priority') in ('critical', 'high') and
        issue_dict.get('status') in ('open', 'in_progress')
    )
    return issue_dict


# ---------------------------------------------------------------------------
# Duplicate detection helper
# ---------------------------------------------------------------------------

IGNORE_WORDS = {'the', 'is', 'on', 'a', 'an', 'and', 'or', 'to', 'in', 'of', 'for', 'not', 'with'}


def find_possible_duplicate(new_title, issues):
    new_words = {w for w in new_title.lower().split() if w not in IGNORE_WORDS}
    for issue in issues:
        existing_words = {w for w in issue['title'].lower().split() if w not in IGNORE_WORDS}
    if len(new_words & existing_words) >= 2:
        return issue['title']
    return None


# ---------------------------------------------------------------------------
# Issue factory using OOP subclasses
# ---------------------------------------------------------------------------

def build_issue(id, data, created_at=None):
    priority = data.get('priority', '')
    title = data.get('title', '')
    description = data.get('description', '')
    status = data.get('status', '')
    reporter_id = data.get('reporter_id')
    if priority == 'critical':
        return CriticalIssue(id, title, description, status, 'critical', reporter_id, created_at)
    if priority == 'low':
        return LowPriorityIssue(id, title, description, status, 'low', reporter_id, created_at)
    return Issue(id, title, description, status, priority, reporter_id, created_at)


# ---------------------------------------------------------------------------
# Reporters
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET", "POST"])
def reporters_view(request):
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        reporters = read_json('reporters.json')
        reporter = Reporter(
            id=next_id(reporters),
            name=body.get('name', ''),
            email=body.get('email', ''),
            team=body.get('team', ''),
        )
        try:
            reporter.validate()
        except ValueError as e:
            return JsonResponse({"error": str(e)}, status=400)

        data = reporter.to_dict()
        reporters.append(data)
        write_json('reporters.json', reporters)
        return JsonResponse(data, status=201)

    # GET
    reporters = read_json('reporters.json')
    rid = request.GET.get('id')
    if rid:
        try:
            rid = int(rid)
        except ValueError:
            return JsonResponse({"error": "Invalid id"}, status=400)
        match = next((r for r in reporters if r['id'] == rid), None)
        if not match:
            return JsonResponse({"error": "Reporter not found"}, status=404)
        return JsonResponse(match)
    return JsonResponse(reporters, safe=False)


# ---------------------------------------------------------------------------
# Issues
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def issues_view(request):
    if request.method == 'DELETE':
        issue_id = request.GET.get('id')
        if not issue_id:
            return JsonResponse({"error": "id is required"}, status=400)
        try:
            issue_id = int(issue_id)
        except ValueError:
            return JsonResponse({"error": "Invalid id"}, status=400)

        issues = read_json('issues.json')
        new_list = [i for i in issues if i['id'] != issue_id]
        if len(new_list) == len(issues):
            return JsonResponse({"error": "Issue not found"}, status=404)
        write_json('issues.json', new_list)
        return JsonResponse({"deleted": issue_id})

    if request.method == 'PATCH':
        issue_id = request.GET.get('id')
        if not issue_id:
            return JsonResponse({"error": "id is required"}, status=400)
        try:
            issue_id = int(issue_id)
        except ValueError:
            return JsonResponse({"error": "Invalid id"}, status=400)

        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        issues = read_json('issues.json')
        idx = next((i for i, x in enumerate(issues) if x['id'] == issue_id), None)
        if idx is None:
            return JsonResponse({"error": "Issue not found"}, status=404)

        allowed = {'status', 'priority', 'title', 'description'}
        for key in allowed:
            if key in body:
                issues[idx][key] = body[key]

        issue_obj = build_issue(issues[idx]['id'], issues[idx], issues[idx].get('created_at'))
        try:
            issue_obj.validate()
        except ValueError as e:
            return JsonResponse({"error": str(e)}, status=400)

        write_json('issues.json', issues)
        return JsonResponse(add_sla_risk(dict(issues[idx])))

    if request.method == 'POST':
        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        issues = read_json('issues.json')
        reporters = read_json('reporters.json')
        reporter_id = body.get('reporter_id')
        if not any(r['id'] == reporter_id for r in reporters):
            return JsonResponse({"error": "reporter_id does not match any existing Reporter"}, status=400)
        issue_obj = build_issue(next_id(issues), body)
        try:
            issue_obj.validate()
        except ValueError as e:
            return JsonResponse({"error": str(e)}, status=400)

        data = issue_obj.to_dict()
        dup = find_possible_duplicate(data['title'], issues)

        issues.append(data)
        write_json('issues.json', issues)

        response_data = issue_obj.to_dict()
        response_data['message'] = issue_obj.describe()
        if dup:
            response_data['duplicate_warning'] = f"Possible duplicate: {dup}"
        return JsonResponse(response_data, status=201)

    # GET with optional filters
    issues = read_json('issues.json')
    reporters = read_json('reporters.json')

    issue_id = request.GET.get('id')
    status = request.GET.get('status')
    priority = request.GET.get('priority')
    reporter_id = request.GET.get('reporter_id')
    team = request.GET.get('team')

    if issue_id:
        try:
            issue_id = int(issue_id)
        except ValueError:
            return JsonResponse({"error": "Invalid id"}, status=400)
        match = next((i for i in issues if i['id'] == issue_id), None)
        if not match:
            return JsonResponse({"error": "Issue not found"}, status=404)
        return JsonResponse(add_sla_risk(dict(match)))

    result = issues

    if status:
        result = [i for i in result if i.get('status') == status]
    if priority:
        result = [i for i in result if i.get('priority') == priority]
    if reporter_id:
        try:
            rid = int(reporter_id)
        except ValueError:
            return JsonResponse({"error": "Invalid reporter_id"}, status=400)
        result = [i for i in result if i.get('reporter_id') == rid]
    if team:
        team_reporter_ids = {r['id'] for r in reporters if r.get('team', '').lower() == team.lower()}
        result = [i for i in result if i.get('reporter_id') in team_reporter_ids]

    return JsonResponse([add_sla_risk(dict(i)) for i in result], safe=False)


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@require_http_methods(["GET"])
def issues_stats(request):
    issues = read_json('issues.json')
    reporters = read_json('reporters.json')

    reporter_map = {r['id']: r for r in reporters}

    total = len(issues)
    by_status = {"open": 0, "in_progress": 0, "resolved": 0, "closed": 0}
    by_priority = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    by_team = {}
    sla_risk = 0

    for issue in issues:
        status = issue.get('status', '')
        priority = issue.get('priority', '')
        rid = issue.get('reporter_id')

        if status in by_status:
            by_status[status] += 1
        if priority in by_priority:
            by_priority[priority] += 1

        reporter = reporter_map.get(rid)
        if reporter:
            team = reporter.get('team', 'unknown').lower()
            by_team[team] = by_team.get(team, 0) + 1

        if priority in ('critical', 'high') and status in ('open', 'in_progress'):
            sla_risk += 1

    return JsonResponse({
        "total": total,
        "open": by_status["open"],
        "in_progress": by_status["in_progress"],
        "resolved": by_status["resolved"],
        "closed": by_status["closed"],
        "critical": by_priority["critical"],
        "sla_risk": sla_risk,
        "by_team": by_team,
        "by_priority": by_priority,
    })


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@require_http_methods(["GET"])
def issues_search(request):
    q = request.GET.get('q', '').strip()
    if not q:
        return JsonResponse({"error": "Search query is required"}, status=400)

    issues = read_json('issues.json')
    q_lower = q.lower()
    matches = [
        add_sla_risk(dict(i)) for i in issues
        if q_lower in i.get('title', '').lower() or q_lower in i.get('description', '').lower()
    ]
    return JsonResponse(matches, safe=False)
