# How well the app reads letters

These are the test results for the two readers, on the 640 fake letters that were kept out of training. The letters were read from photos the same way the app does it, including photos that were tilted, shadowed, folded or cut off.

- [reader_b_ocr.md](reader_b_ocr.md): my Naive Bayes classifier (Reader B). It named 98.1% of the letters right.
- [reader_a.md](reader_a.md): Gemini with my prompt (Reader A). It named 96.7% right. This report also shows how often it found each date, and that it never made one up.

The `.py` files in this folder make these reports and the numbers on the app's test dashboard.
