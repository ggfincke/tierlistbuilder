# scripts/seed_pipeline/seed_pipeline/progress.py
# lightweight stderr progress logging for long local seed runs

from __future__ import annotations

import sys
import time
from dataclasses import dataclass, field
from typing import TextIO


@dataclass
class ProgressLogger:
	label: str
	stream: TextIO = sys.stderr
	_started_at: float = field(init=False, repr=False)

	def __post_init__(self) -> None:
		self._started_at = time.monotonic()

	def log(self, message: str) -> None:
		elapsed = time.monotonic() - self._started_at
		print(
			f"[seed:{self.label} +{elapsed:0.1f}s] {message}",
			file=self.stream,
			flush=True,
		)

	def count(
		self,
		label: str,
		current: int,
		total: int,
		*,
		every: int = 1,
		suffix: str | None = None,
	) -> None:
		if total <= 0:
			return
		if current != total and every > 1 and current % every != 0:
			return
		percent = current / total * 100
		detail = f"{label}: {current}/{total} ({percent:0.1f}%)"
		if suffix:
			detail = f"{detail} {suffix}"
		self.log(detail)


def progress_interval(total: int) -> int:
	if total <= 25:
		return max(total, 1)
	if total <= 150:
		return 25
	if total <= 500:
		return 50
	return 100
