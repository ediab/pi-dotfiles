"""Minimal evaluation harness for tabular / time-series models.

Copy into your project. Conventions baked in:

- Splits are TEMPORAL by default. Random shuffling of time-series rows is how
  look-ahead bias sneaks in; use `time_split` / `expanding_windows` unless you
  can argue your data has no temporal structure.
- Every model must beat a naive baseline (`beat_baseline`) or the test fails.
- Preprocessing parity: fit preprocessing on train only and reuse it at
  inference. Prefer sklearn Pipeline so this is structural, not remembered.

    pipe = Pipeline([("scale", StandardScaler()), ("m", model)])
    pipe.fit(X_train, y_train)   # scaler sees train only
    pipe.predict(X_test)         # same fitted object at inference
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def mae(y_true, y_pred) -> float:
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def rmse(y_true, y_pred) -> float:
    return float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))


def hit_rate(y_true, y_pred) -> float:
    """Direction accuracy for sign-based predictions (quant default)."""
    yt, yp = np.asarray(y_true), np.asarray(y_pred)
    return float(np.mean(np.sign(yt) == np.sign(yp)))


def time_split(
    df: pd.DataFrame, ts_col: str, test_frac: float = 0.2
) -> tuple[pd.Index, pd.Index]:
    """Chronological split: last `test_frac` of rows (by ts_col) is test."""
    ordered = df.sort_values(ts_col)
    n_test = max(1, int(round(len(ordered) * test_frac)))
    return ordered.index[:-n_test], ordered.index[-n_test:]


def expanding_windows(
    df: pd.DataFrame,
    ts_col: str,
    n_splits: int = 5,
    min_train_frac: float = 0.5,
):
    """Yield (train_idx, test_idx) walk-forward windows, oldest first."""
    ordered = df.sort_values(ts_col)
    n = len(ordered)
    min_train = int(n * min_train_frac)
    step = (n - min_train) // (n_splits + 1)
    if step < 1:
        raise ValueError(f"not enough rows ({n}) for {n_splits} splits")
    for i in range(1, n_splits + 1):
        cut = min_train + i * step
        yield ordered.index[:cut], ordered.index[cut : cut + step]


def beat_baseline(
    y_true,
    y_pred,
    y_baseline,
    metric=mae,
    label: str = "model",
) -> None:
    """Assert the model beats the naive baseline on `metric`.

    For MAE/RMSE lower is better; for hit_rate-style metrics pass
    metric=lambda t, p: -hit_rate(t, p) or flip the comparison here.
    Raises with both numbers so the miss is visible in test output.
    """
    m_model = metric(y_true, y_pred)
    m_base = metric(y_true, y_baseline)
    if m_model >= m_base:
        raise AssertionError(
            f"{label}: {metric.__name__}={m_model:.4g} did not beat baseline "
            f"{m_base:.4g}. A naive rule is as good — do not ship this."
        )


def slice_report(
    df: pd.DataFrame,
    y_true: str,
    y_pred: str,
    slice_col: str,
    metric=mae,
) -> pd.DataFrame:
    """Metric per slice of `slice_col` (year, regime, entity...).

    Not an assertion — print/inspect it. A good average over bad slices is a
    classic misleading evaluation.
    """
    g = df.groupby(slice_col)
    return g.apply(lambda x: metric(x[y_true], x[y_pred]), include_groups=False).rename(
        metric.__name__
    )
