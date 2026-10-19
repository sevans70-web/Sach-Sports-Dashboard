# Immutable NBA observation source

The compressed source manifest records 424 discovery reads, 2,469 summary reads, 111 excluded fixtures, all public source URLs/retrieval times and both observation digests. There were zero source request failures. The full dataset contains 372,468 observations across six NBA markets and is preserved with its uncompressed manifest and fitted models in `NBA-Model-Evidence-2026-10-19.tar.gz`.

The larger source bytes are excluded from the app checkout and retained in the evidence archive. Extract that archive at the parent directory to replay the exact source. The evaluator can read either the original manifest JSON or its committed gzip form. Recollection from current revised sources may differ and must use a new output directory.

This source is independent of the dashboard's wagering history, existing archives, retention, storage volume and Google Drive backup settings.
