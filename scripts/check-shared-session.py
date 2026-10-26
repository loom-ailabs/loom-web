"""Actual local Workerd + opaque D1 sessions; synthetic identity, no public OIDC calls."""

from __future__ import annotations

import http.client
import http.cookiejar
import json
import os
import signal
import sqlite3
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_ID = "7wqbzelu2ey5n5brfr73d"
LOGIN = "https://login.loom-labs.ai"
WWW = "https://www.loom-labs.ai"
CHECKOUT = "https://checkout.loom-labs.ai"
COOKIE = f"__Secure-loom_sid_{APP_ID}"
TEST_KEY = str(uuid.uuid4())  # Generated fixture key only; never a production credential.
processes: list[subprocess.Popen[bytes]] = []
checks: list[str] = []


def command(args: list[str], app: str, **kwargs):
    return subprocess.run(args, cwd=ROOT / f"apps/{app}", check=True, capture_output=True, **kwargs)


def session_fixtures() -> dict:
    result = subprocess.run(
        ["node", "scripts/create-session-fixture.mjs"],
        text=True,
        cwd=ROOT / "packages/identity-core",
        check=True,
        capture_output=True,
        env={**os.environ, "SHARED_SESSION_TEST_KEY": TEST_KEY},
    )
    return json.loads(result.stdout)


def local_database(state: Path) -> Path:
    for file in state.rglob("*.sqlite"):
        with sqlite3.connect(file) as database:
            if database.execute("SELECT 1 FROM sqlite_master WHERE name='auth_sessions'").fetchone():
                return file
    raise AssertionError("Local migration must create the new opaque session table")


def seed_sessions(file: Path, fixture: dict):
    with sqlite3.connect(file) as database:
        for statement in fixture["statements"]:
            database.execute(statement["sql"], statement["values"])
        rows = database.execute("SELECT id_hash,data FROM auth_sessions").fetchall()
    assert len(rows) == 5
    assert all(len(row[0]) == 64 and (row[1] is None or "fixture-only" not in row[1]) for row in rows)
    checks.append("actual_repository_generated_opaque_hashes_and_encrypted_d1_snapshots")


def jar_with(value: str, name=COOKIE) -> http.cookiejar.CookieJar:
    jar = http.cookiejar.CookieJar()
    jar.set_cookie(
        http.cookiejar.Cookie(
            version=0,
            name=name,
            value=value,
            port=None,
            port_specified=False,
            domain=".loom-labs.ai",
            domain_specified=True,
            domain_initial_dot=True,
            path="/",
            path_specified=True,
            secure=True,
            expires=None,
            discard=True,
            comment=None,
            comment_url=None,
            rest={"HttpOnly": None, "SameSite": "Lax"},
            rfc2109=False,
        )
    )
    return jar


def request_http(url: str, jar: http.cookiejar.CookieJar, *, method="GET", origin=None):
    parsed = urllib.parse.urlsplit(url)
    request = urllib.request.Request(url, method=method)
    jar.add_cookie_header(request)
    headers = dict(request.header_items())
    headers["Host"] = parsed.hostname
    if origin:
        headers["Origin"] = origin
    port = 3100 if parsed.hostname == "www.loom-labs.ai" else 3101
    connection = http.client.HTTPConnection("localhost", port, timeout=15)
    connection.request(method, urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, "")), headers=headers)
    response = connection.getresponse()
    jar.extract_cookies(response, request)
    result = (response.status, {key.lower(): value for key, value in response.getheaders()}, response.read())
    connection.close()
    return result


def start(app: str, port: int, host: str, state: Path, log):
    app_url = WWW if app == "web" else CHECKOUT
    args = [
        "pnpm",
        "exec",
        "wrangler",
        "dev",
        "--env",
        "preview",
        "--local",
        "--port",
        str(port),
        "--host",
        host,
        "--inspector-port",
        str(port + 10000),
        "--upstream-protocol",
        "https",
        "--persist-to",
        str(state),
        "--var",
        f"APP_URL:{app_url}",
        "--var",
        f"LOGIN_URL:{LOGIN}",
        "--var",
        f"AUTH_SUCCESS_URL:{WWW}/",
        "--var",
        "LOGTO_COOKIE_DOMAIN:.loom-labs.ai",
        "--var",
        "LOGTO_ENDPOINT:http://localhost:59999",
        "--var",
        f"LOGTO_COOKIE_SECRET:{TEST_KEY}",
        "--var",
        "LOGTO_APP_SECRET:local-only-fixture-client-secret",
    ]
    processes.append(subprocess.Popen(args, cwd=ROOT / f"apps/{app}", stdout=log, stderr=log, start_new_session=True))


def main():
    for app in ["web", "identity"]:
        handler = ROOT / f"apps/{app}/.open-next/server-functions/default/apps/{app}/handler.mjs"
        assert handler.exists() and "loom_sid_" in handler.read_text(), "Rebuild both OpenNext apps before this check"
    with tempfile.TemporaryDirectory(prefix="loom-opaque-session-http-") as directory:
        state = Path(directory) / "state"
        command(
            [
                "pnpm",
                "exec",
                "wrangler",
                "d1",
                "migrations",
                "apply",
                "DB",
                "--local",
                "--env",
                "preview",
                "--persist-to",
                str(state),
            ],
            "identity",
        )
        fixture = session_fixtures()
        file = local_database(state)
        seed_sessions(file, fixture)
        fixtures = fixture["fixtures"]
        with open(Path(directory) / "workers.log", "wb") as log:
            start("identity", 3101, "login.loom-labs.ai", state, log)
            start("web", 3100, "www.loom-labs.ai", state, log)
            for _ in range(100):
                try:
                    if (
                        request_http(WWW + "/api/health", http.cookiejar.CookieJar())[0] == 200
                        and request_http(LOGIN + "/api/health", http.cookiejar.CookieJar())[0] == 200
                    ):
                        break
                except OSError:
                    pass
                time.sleep(0.2)
            else:
                raise AssertionError("Local Workerd servers did not become healthy")
            jar = jar_with(fixtures["valid"]["id"])
            for product in [WWW, CHECKOUT, LOGIN]:
                status, headers, body = request_http(product + "/api/me", jar)
                assert status == 200 and json.loads(body)["data"]["user"]["id"] == "local-opaque-domain-fixture", (
                    "Both rebuilt products must read the new opaque D1 session"
                )
                assert headers.get("x-robots-tag") == "noindex, nofollow, noarchive"
                assert request_http(product + "/api/premium", jar)[0] == 403, (
                    "A shared login must not imply paid access"
                )
            checks.append("three_hosts_share_d1_opaque_session_without_granting_premium")
            target = "https://future.loom-labs.ai/workspace?source=sso-check&tag=a%2Bb&tag=2"
            status, headers, _ = request_http(LOGIN + "/?" + urllib.parse.urlencode({"returnTo": target}), jar)
            assert status in [303, 307] and headers.get("location") == target
            checks.append("central_existing_session_skips_oidc_and_preserves_exact_path_query")
            for label in ["expired", "revoked", "abandoned"]:
                for product in [WWW, CHECKOUT]:
                    assert request_http(product + "/api/premium", jar_with(fixtures[label]["id"]))[0] == 401
            checks.append("expired_revoked_and_abandoned_lease_sessions_fail_closed")
            with sqlite3.connect(file) as database:
                assert (
                    database.execute(
                        "SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NOT NULL AND data IS NULL"
                    ).fetchone()[0]
                    == 3
                )
            near = jar_with(fixtures["nearAbsoluteExpiry"]["id"])
            assert json.loads(request_http(WWW + "/api/me", near)[2])["data"]["user"] is not None
            with sqlite3.connect(file) as database:
                deadline = database.execute(
                    "SELECT MIN(expires_at) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at> ?",
                    (int(time.time() * 1000),),
                ).fetchone()[0]
                assert deadline == fixtures["nearAbsoluteExpiry"]["expiresAt"], (
                    "Reading must never slide the fixed 14-day deadline"
                )
            checks.append("advanced_age_fixture_keeps_absolute_fourteen_day_deadline")
            for invalid in ["invalid", "x" * 43, "A" * 43]:
                assert json.loads(request_http(WWW + "/api/me", jar_with(invalid))[2])["data"]["user"] is None
            assert (
                json.loads(
                    request_http(WWW + "/api/me", jar_with(fixtures["valid"]["id"], f"__Secure-loom_session_{APP_ID}"))[
                        2
                    ]
                )["data"]["user"]
                is None
            )
            checks.append("unknown_malformed_and_obsolete_cookie_credentials_are_rejected")
            for url, expected in [
                ("https://future.loom-labs.ai/", True),
                ("https://loom-labs.ai.evil.example/", False),
                ("http://www.loom-labs.ai/", False),
            ]:
                request = urllib.request.Request(url)
                jar.add_cookie_header(request)
                assert request.has_header("Cookie") == expected
            checks.append("standard_cookiejar_enforces_parent_domain_and_secure")
            assert (
                request_http(LOGIN + "/api/auth/callback?code=fixture&state=fixture", http.cookiejar.CookieJar())[0]
                == 400
            )
            checks.append("callback_without_encrypted_flow_is_rejected_without_provider_call")
            request_http(WWW + "/api/auth/logout", jar, method="POST", origin=WWW)
            assert all(cookie.name != COOKIE for cookie in jar), "Logout must expire the exact parent-domain cookie"
            for product in [WWW, CHECKOUT, LOGIN]:
                assert (
                    json.loads(request_http(product + "/api/me", jar_with(fixtures["valid"]["id"]))[2])["data"]["user"]
                    is None
                ), "Logout must also reject replay of the old opaque identifier"
            checks.append("logout_revokes_d1_and_replayed_sid_on_all_three_hosts")
            evidence = {
                "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "runtime": "real local Workerd HTTP",
                "cookieJar": "Python standard http.cookiejar",
                "sessionFixture": "actual SessionRepository + SessionCrypto, generated key and isolated temporary D1",
                "realOidcLogin": False,
                "realTokenRefresh": False,
                "publicProviderContact": False,
                "timeAdvanceEvidence": "fixtures created 14 days ago; current server clock unchanged",
                "remoteMutations": False,
                "checks": checks,
            }
            output = ROOT / ".codex-artifacts/web/shared-domain-local.json"
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(evidence, indent=2) + "\n")
            print(
                json.dumps(
                    {
                        "localOpaqueSessionChecksPassed": len(checks),
                        "realOidcLogin": False,
                        "realTokenRefresh": False,
                        "remoteMutations": False,
                    }
                )
            )


if __name__ == "__main__":
    try:
        main()
    finally:
        for process in processes:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
            except (ProcessLookupError, PermissionError, subprocess.TimeoutExpired):
                if process.poll() is None:
                    process.kill()
