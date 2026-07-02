"""SDK Python officiel pour l'API Elysia Panel.

Implémenté avec `urllib` (bibliothèque standard) pour ne dépendre
d'aucun paquet tiers. Pour les endpoints non couverts par les méthodes
typées, utilisez `ElysiaClient.request(...)` directement — la
spécification complète est publiée par le Backend sur /api/docs-json
(OpenAPI 3).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional


class ElysiaApiError(Exception):
    def __init__(self, status: int, body: Any):
        self.status = status
        self.body = body
        super().__init__(f"Elysia API error ({status}): {body}")


class ElysiaClient:
    def __init__(self, base_url: str, access_token: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token

    def set_access_token(self, token: str) -> None:
        self.access_token = token

    def request(self, method: str, path: str, body: Optional[dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            raw = err.read()
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = raw.decode("utf-8", errors="replace")
            raise ElysiaApiError(err.code, parsed) from err

    # --- Auth -------------------------------------------------------
    def login(self, email: str, password: str, totp_code: Optional[str] = None) -> dict:
        return self.request("POST", "/auth/login", {"email": email, "password": password, "totpCode": totp_code})

    def register(self, email: str, username: str, password: str) -> dict:
        return self.request("POST", "/auth/register", {"email": email, "username": username, "password": password})

    def me(self) -> dict:
        return self.request("GET", "/auth/me")

    # --- Serveurs -----------------------------------------------------
    def list_servers(self) -> list:
        return self.request("GET", "/servers")

    def get_server(self, server_id: str) -> dict:
        return self.request("GET", f"/servers/{server_id}")

    def create_server(self, **payload) -> dict:
        return self.request("POST", "/servers", payload)

    def power_action(self, server_id: str, action: str) -> dict:
        return self.request("POST", f"/servers/{server_id}/power/{action}")

    def send_command(self, server_id: str, command: str) -> dict:
        return self.request("POST", f"/servers/{server_id}/command", {"command": command})

    # --- Sauvegardes ------------------------------------------------------
    def list_backups(self, server_id: str) -> list:
        return self.request("GET", f"/servers/{server_id}/backups")

    def create_backup(self, server_id: str, name: Optional[str] = None) -> dict:
        return self.request("POST", f"/servers/{server_id}/backups", {"name": name})
