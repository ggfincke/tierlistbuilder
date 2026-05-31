# scripts/seed_pipeline/seed_pipeline/concurrency.py
# bounded thread-pool helpers for seed pipeline commands

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, TypeVar, cast

TItem = TypeVar("TItem")
TResult = TypeVar("TResult")


def run_in_parallel(
	items: list[TItem],
	worker: Callable[[TItem], TResult],
	max_workers: int,
	on_complete: Callable[[int, int, TItem], None] | None = None,
) -> list[TResult]:
	if max_workers <= 1 or len(items) <= 1:
		results: list[TResult] = []
		for index, item in enumerate(items):
			results.append(worker(item))
			if on_complete is not None:
				on_complete(index + 1, len(items), item)
		return results
	results: list[TResult | None] = [None] * len(items)
	completed = 0
	with ThreadPoolExecutor(max_workers=max_workers) as pool:
		future_to_index = {pool.submit(worker, item): index for index, item in enumerate(items)}
		for future in as_completed(future_to_index):
			index = future_to_index[future]
			results[index] = future.result()
			completed += 1
			if on_complete is not None:
				on_complete(completed, len(items), items[index])
	return cast(list[TResult], results)
