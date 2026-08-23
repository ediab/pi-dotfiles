"""Guard against duplicate external side effects (Slack alerts, webhooks...).

Copy into your project. Two protections:

1. DRY-RUN BY DEFAULT: nothing sends unless explicitly enabled
   (dry_run=False or ALERTS_LIVE=1). Scheduled jobs must pass their live
   flag deliberately — the safe default is silence.
2. SEND-ONCE PER KEY: emit() records a dedup key before sending; retries,
   reruns, and crashes-after-send cannot double-send.

    emitter = Emitter(send_fn=send_slack, store_path="var/emitted.json")
    # job body: safe to retry as many times as you like
    if emitter.emit(f"delay:{route}:{date}", {"text": f"{route} delayed {n} flights"}):
        log.info("alert sent")
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


class Emitter:
    def __init__(
        self,
        send_fn: Callable[[dict[str, Any]], Any],
        store_path: str | Path = "var/emitted.json",
        dry_run: bool | None = None,
    ):
        """dry_run defaults from env: live only when ALERTS_LIVE=1."""
        self.send_fn = send_fn
        self.store_path = Path(store_path)
        self.dry_run = (os.environ.get("ALERTS_LIVE") != "1") if dry_run is None else dry_run
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        self._sent: dict[str, str] = {}
        if self.store_path.exists():
            self._sent = json.loads(self.store_path.read_text())

    def _record(self, key: str) -> None:
        self._sent[key] = datetime.now(timezone.utc).isoformat()
        tmp = self.store_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._sent, indent=0))
        tmp.replace(self.store_path)

    def already_sent(self, key: str) -> bool:
        return key in self._sent

    def emit(self, key: str, payload: dict[str, Any]) -> bool:
        """Send `payload` via send_fn exactly once per key. True iff sent now."""
        if key in self._sent:
            return False
        if self.dry_run:
            print(f"[dry-run] would send {key}: {payload}")
            return False
        self._record(key)  # record BEFORE sending: crash after send won't double-send
        self.send_fn(payload)
        return True


def reset_key(store_path: str | Path, key: str) -> None:
    """Clear one dedup key (e.g. re-alerting after you fixed the data)."""
    p = Path(store_path)
    sent = json.loads(p.read_text())
    sent.pop(key, None)
    p.write_text(json.dumps(sent))
