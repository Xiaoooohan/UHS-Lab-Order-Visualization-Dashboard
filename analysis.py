import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("2025_specimen_time_series_events_no_phi.tsv", sep="\t")

print(df.shape) # Dimention
print(df.columns) # Column names

print(df.head())

# Missing value summary
print(df.isnull().sum()) # missing per column
print(df.isnull().mean()) # proportion missing

print(df.dtypes)
print(df.describe())
print(df.describe(include='all'))

for col in df.columns:
    print(f"\nColumn: {col}")
    print(df[col].nunique(), "unique values")
    print(df[col].value_counts().head())

'''Unique value and missing summary table''' 

summary = df.describe(include='all').T
summary['missing'] = df.isnull().sum()
summary['missing_pct'] = df.isnull().mean()
print(summary)
summary.to_csv("summary.csv")
# TIME SERIES BARCHART
df['event_dt'] = pd.to_datetime(df['event_dt'])
# Sorting the column
df = df.sort_values('event_dt')
# Overall time series
ts = df.set_index('event_dt').resample('1D').size()
# Graph
plt.figure()
ts.plot()
plt.title("Total Events Over Time")
plt.xlabel("Time")
plt.ylabel("Count")
plt.show()

''' Generating barcode missing rows '''

no_barcode = df[df['barcode'].isnull() | (df['barcode'] == "")]
no_barcode.to_csv("nobarcode.csv")

