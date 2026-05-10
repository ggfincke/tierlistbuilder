# scripts/seed_pipeline/tests/test_crop.py
# parity fixtures for Python seed crop & ratio decisions

from __future__ import annotations

import unittest

from seed_pipeline.crop import (
    CropBBox,
    bbox_to_item_transform,
    pick_auto_crop_bbox,
    ratios_match,
    resolve_ratio_decision,
    scan_auto_crop_pixels,
)


class CropParityTests(unittest.TestCase):
    def test_bbox_transform_matches_typescript_fixture(self) -> None:
        transform = bbox_to_item_transform(
            CropBBox(left=0.1, top=0, right=0.9, bottom=1),
            image_aspect_ratio=8 / 9,
            board_aspect_ratio=1,
            padding_fraction=0,
        )
        self.assertAlmostEqual(transform["zoom"], 8 / 9, places=6)
        self.assertAlmostEqual(transform["offsetX"], 0, places=6)
        self.assertAlmostEqual(transform["offsetY"], 0, places=6)

    def test_alpha_tail_trimming_matches_typescript_fixture(self) -> None:
        data = bytearray(100 * 100 * 4)
        _paint_alpha_rect(data, 100, left=20, top=10, right=80, bottom=71, alpha=255)
        _paint_alpha_rect(data, 100, left=20, top=71, right=80, bottom=96, alpha=32)
        scan = scan_auto_crop_pixels(bytes(data), 100, 100)
        self.assertIsNotNone(scan)
        bbox = pick_auto_crop_bbox(scan, trim_soft_shadows=True)
        self.assertEqual(
            bbox,
            CropBBox(left=0.2, top=0.1, right=0.8, bottom=0.71),
        )

    def test_ratio_source_decisions_match_seed_rules(self) -> None:
        dominant = resolve_ratio_decision([2 / 3, 2 / 3, 1])
        square = resolve_ratio_decision([2 / 3, 1])
        self.assertEqual(dominant.ratio_source, "mixed-dominant")
        self.assertAlmostEqual(dominant.item_aspect_ratio, 2 / 3)
        self.assertEqual(square.ratio_source, "mixed-square")
        self.assertEqual(square.item_aspect_ratio, 1)

    def test_ratio_matching_rejects_bool_inputs(self) -> None:
        self.assertFalse(ratios_match(True, 1))


def _paint_alpha_rect(
    data: bytearray,
    width: int,
    left: int,
    top: int,
    right: int,
    bottom: int,
    alpha: int,
) -> None:
    for y in range(top, bottom):
        for x in range(left, right):
            index = (y * width + x) * 4
            data[index] = 255
            data[index + 1] = 255
            data[index + 2] = 255
            data[index + 3] = alpha


if __name__ == "__main__":
    unittest.main()
