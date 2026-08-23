"""Reusable data-correctness assertions (pandas + pytest).

Copy into your project (e.g. tests/datachecks.py) and call inside pytest tests.
Every helper raises AssertionError with a short diagnostic. Keep task-specific
thresholds in the project's tests, not here.

The grain tripwire pattern:

    before = df.shape[0]
    out = df.merge(other, on="key", how="left")
    expect_same_grain(df, out, keys=["flight_id", "date"])
"""

from __future__ import annotations

import pandas as pd


def expect_unique(
    df: pd.DataFrame, keys: list[str], label: str = "df"
) -> None:
    """Grain contract: `keys` uniquely identify rows."""
    dup = df.duplicated(subset=keys, keep=False)
    if dup.any():
        sample = df.loc[dup, keys].head(5).to_dict(orient="records")
        raise AssertionError(
            f"{label}: {int(dup.sum())} rows violate uniqueness on {keys}; e.g. {sample}"
        )


def expect_same_grain(
    before: pd.DataFrame, after: pd.DataFrame, keys: list[str]
) -> None:
    """Row count on the grain keys must not change across a join/transform.

    Catches join fan-out (rows multiplied) and silent row loss. Call with a
    snapshot taken *before* the join.
    """
    if len(before) != len(after):
        raise AssertionError(
            f"grain changed: {len(before)} rows -> {len(after)} rows "
            f"(delta {len(after) - len(before):+d}) on keys {keys}"
        )


def expect_count_within(
    df: pd.DataFrame,
    baseline: int,
    pct: float = 0.05,
    label: str = "df",
) -> None:
    """Row count within ±pct of a baseline (last week's run, known total).

    The cheapest detector of silent row loss and unexpected growth.
    """
    low, high = baseline * (1 - pct), baseline * (1 + pct)
    if not (low <= len(df) <= high):
        raise AssertionError(
            f"{label}: {len(df)} rows outside expected range "
            f"[{low:.0f}, {high:.0f}] (baseline {baseline} ±{pct:.0%})"
        )


def expect_no_nulls(
    df: pd.DataFrame,
    cols: list[str],
    max_frac: float = 0.0,
    label: str = "df",
) -> None:
    """Null fraction in `cols` bounded by max_frac (0.0 = none allowed)."""
    for col in cols:
        frac = float(df[col].isna().mean())
        if frac > max_frac:
            raise AssertionError(
                f"{label}.{col}: {frac:.1%} nulls > allowed {max_frac:.1%}"
            )


def expect_no_future_dates(
    df: pd.DataFrame,
    feature_cols: list[str],
    as_of_col: str,
    label: str = "df",
) -> None:
    """Look-ahead tripwire: no feature timestamp may exceed its row's as_of.

    `feature_cols` are timestamp columns feeding features; `as_of_col` is the
    prediction/snapshot time. Both must be tz-aware or both tz-naive.
    """
    for col in feature_cols:
        late = df[df[col] > df[as_of_col]]
        if len(late):
            raise AssertionError(
                f"{label}: look-ahead in '{col}' — {len(late)} rows have {col} > "
                f"{as_of_col}; e.g. {late[[as_of_col, col]].head(3).to_dict(orient='records')}"
            )


def expect_freshness(
    ts: pd.Series,
    max_lag: pd.Timedelta,
    now: pd.Timestamp | None = None,
    label: str = "df",
) -> None:
    """Newest observation no older than max_lag. Catches stale sources.

    >>> expect_freshness(df["event_ts"], pd.Timedelta(hours=26))
    """
    now = now or pd.Timestamp.now(tz=getattr(ts.dtype, "tz", None))
    age = now - ts.max()
    if age > max_lag:
        raise AssertionError(
            f"{label}: stale data — newest observation is {age} old "
            f"(max allowed {max_lag}); newest = {ts.max()}"
        )


def reconcile(
    a: pd.DataFrame,
    b: pd.DataFrame,
    keys: list[str],
    cols: list[str],
    tol: float = 0.0,
    label: str = "a vs b",
) -> None:
    """Reconciliation between two sources on shared keys/columns.

    Reports (and raises on): rows missing from either side, value mismatches
    beyond tol. Use to make source disagreement explicit instead of averaging it away.
    """
    m = a.merge(b, on=keys, how="outer", suffixes=("_a", "_b"), indicator=True)
    only_a = int((m["_merge"] == "left_only").sum())
    only_b = int((m["_merge"] == "right_only").sum())
    problems = []
    if only_a:
        problems.append(f"{only_a} rows only in a")
    if only_b:
        problems.append(f"{only_b} rows only in b")
    for col in cols:
        ca, cb = f"{col}_a", f"{col}_b"
        both = m[m["_merge"] == "both"]
        if ca not in both or cb not in both:
            continue
        diff = (both[ca] - both[cb]).abs()
        bad = int((diff > tol).sum())
        if bad:
            worst = diff.max()
            problems.append(f"'{col}': {bad} mismatches beyond tol={tol} (worst {worst})")
    if problems:
        raise AssertionError(f"{label}: " + "; ".join(problems))
