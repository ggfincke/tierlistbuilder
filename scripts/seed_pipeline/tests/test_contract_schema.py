# scripts/seed_pipeline/tests/test_contract_schema.py
# compiled-manifest contract guards for generated seed artifacts

from __future__ import annotations

import copy
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from seed_pipeline.manifest import read_json
from seed_pipeline.settings import COMPILED_SCHEMA_PATH


class CompiledManifestSchemaTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls) -> None:
		cls.validator = Draft202012Validator(read_json(COMPILED_SCHEMA_PATH))
		cls.example = read_json(
			Path(__file__).resolve().parent / "fixtures" / "compiled-manifest.example.json"
		)

	def test_rejects_out_of_range_crop_values(self) -> None:
		manifest = copy.deepcopy(self.example)
		manifest["templates"][0]["items"][0]["asset"]["crop"] = {
			"left": -0.01,
			"top": 0,
			"right": 1,
			"bottom": 1,
		}
		errors = list(self.validator.iter_errors(manifest))
		self.assertTrue(errors)

	def test_rejects_out_of_range_transform_values(self) -> None:
		manifest = copy.deepcopy(self.example)
		manifest["templates"][0]["items"][0]["transform"] = {
			"rotation": 0,
			"zoom": 11,
			"offsetX": 0,
			"offsetY": 0,
		}
		errors = list(self.validator.iter_errors(manifest))
		self.assertTrue(errors)


if __name__ == "__main__":
	unittest.main()
