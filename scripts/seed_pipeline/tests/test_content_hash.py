# scripts/seed_pipeline/tests/test_content_hash.py
# golden vectors for Python seed content hashing

from __future__ import annotations

import unittest

from seed_pipeline.content_hash import seed_content_hash


class SeedContentHashTests(unittest.TestCase):
	def test_seed_content_hash_matches_golden_vectors(self) -> None:
		self.assertEqual(
			seed_content_hash(
				"template-metadata",
				{"title": "A", "tags": ["x", "y"], "description": None},
			),
			"v1:bf0740600563e78d22c1e56ede65fd5d",
		)
		self.assertEqual(
			seed_content_hash("unicode", {"z": "é", "a": {"drop": None, "keep": 1}}),
			"v1:26af77010001185ffee1a14740f92a6a",
		)


if __name__ == "__main__":
	unittest.main()
