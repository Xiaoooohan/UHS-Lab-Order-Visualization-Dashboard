# Client Delivery Package

## Contents

- `data_preprocessing.qmd` — narrative preprocessing workflow in Python.
- `preprocess_data.py` — production preprocessing script.
- `dashboard_data.json` — D3-ready order-level data.
- `order_level_dataset.csv` — tabular processed output.
- `preprocessing_summary.json` — processing metadata.
- `index.html`, `dashboard.js`, `styles.css` — complete D3 dashboard.

## Run

1. Regenerate processed data:
   ```bash
   python client_delivery/preprocess_data.py
   ```
2. Start a local server from repo root:
   ```bash
   python -m http.server 8000
   ```
3. Open:
   `http://localhost:8000/client_delivery/`
