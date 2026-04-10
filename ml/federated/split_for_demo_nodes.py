#!/usr/bin/env python3
"""
Split one labeled CSV into two stratified halves (by IS_FRAUD) to simulate two banks
when you only have synthetic_transactions_source2.csv. Outputs local files to upload
to gs://.../federated/nodes/bank-a/ and bank-b/.

Usage (from repo root):
  python ml/federated/split_for_demo_nodes.py synthetic_transactions_source2.csv
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split


def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    src = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else repo / "synthetic_transactions_source2.csv"
    if not src.is_file():
        print(f"Missing file: {src}", file=sys.stderr)
        return 1
    df = pd.read_csv(src)
    if "IS_FRAUD" not in df.columns:
        print("CSV must contain IS_FRAUD", file=sys.stderr)
        return 1
    a, b = train_test_split(df, test_size=0.5, stratify=df["IS_FRAUD"], random_state=42)
    out_dir = Path(__file__).resolve().parent / "demo_splits"
    out_dir.mkdir(parents=True, exist_ok=True)
    pa = out_dir / "node_bank_a.csv"
    pb = out_dir / "node_bank_b.csv"
    a.to_csv(pa, index=False)
    b.to_csv(pb, index=False)
    print(f"Wrote {len(a)} rows -> {pa}")
    print(f"Wrote {len(b)} rows -> {pb}")
    print("Upload with gsutil to federated/nodes/bank-a/ and federated/nodes/bank-b/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
