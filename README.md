# Client Delivery Package

## Contents

- `data_preprocessing.qmd` — narrative preprocessing workflow in Python.
- `preprocess_data.py` — production preprocessing script.
- `dashboard_data.json` — D3-ready order-level data.
- `order_level_dataset.csv` — tabular processed output.
- `preprocessing_summary.json` — processing metadata.
- `index.html`, `dashboard.js`, `styles.css` — complete D3 dashboard.

## Use
Unzip the data file and preprocess it with the provided python script. Serve the site `index.html` with e.g. live-server.

```bash
$ unzip 2025_specimen_time_series_event_no_phi.zip
$ python3 preprocess_data.py
$ live-server
```
