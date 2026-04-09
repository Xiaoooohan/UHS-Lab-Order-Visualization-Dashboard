const timelineStages = [
  { key: "collection_hours", label: "Collected" },
  { key: "receipt_hours", label: "Received" },
  { key: "max_result_hours", label: "Resulted" },
  { key: "max_verified_hours", label: "Verified" }
];

const state = {
  raw: [],
  filtered: [],
  global: {
    test_code: "All",
    test_performing_dept: "All",
    event_street: "All",
    ordered_weekpart: "All",
    idxStart : null,
    idxEnd : null,
    dateStart : null,
    dateEnd : null
  },
  groupA: { weekpart: "Weekday", cancel: "All" },
  groupB: { weekpart: "Weekend", cancel: "All" }
};

const timeParser = d3.utcParse("%Y-%m-%dT%H:%M:%SZ");

//==================================================
// Helper functions to render a KDE plot
//==================================================
// source: https://datavisualizationwithsvelte.com/basics/density-plot#kerneldensityestimator-function
function kernelDensityEstimator(kernel, X) {
  return function (V) {
    return X.map(function (x) {
      return [
        x,
        d3.mean(V, function (v) {
          return kernel(x - v);
        })
      ];
    });
  };
}
function Epanechnikov(bandwidth) {
  return function (v) {
    return Math.abs((v /= bandwidth)) <= 1
      ? (0.75 * (1 - v * v)) / bandwidth
      : 0;
  };
}
// 
//==================================================



function uniqueValues(data, key) {
  return ["All", ...Array.from(new Set(data.map(d => d[key]).filter(Boolean))).sort()];
}

function mean(values) {
  const v = values.filter(x => Number.isFinite(x));
  return v.length ? d3.mean(v) : null;
}

function populateSelect(id, options) {
  const sel = d3.select(id);
  sel.selectAll("option").remove();
  sel.selectAll("option")
    .data(options)
    .join("option")
    .attr("value", d => d)
    .text(d => d);
}

// Brute force hammer method. Should see significant speedup if we break global vs time-slicing up
function applyGlobalFilters() {
  state.filtered = state.raw.filter(d => {
    return (state.global.test_code === "All" || d.test_code === state.global.test_code)
      && (state.global.test_performing_dept === "All" || d.test_performing_dept === state.global.test_performing_dept)
      && (state.global.event_street === "All" || d.event_street === state.global.event_street)
      && (state.global.ordered_weekpart === "All" || d.ordered_weekpart === state.global.ordered_weekpart);
  });
}

function renderKPIs(data) {
  const kpis = [
    { label: "Orders", value: data.length },
    { label: "Cancellation Rate", value: `${(100 * d3.mean(data, d => d.has_cancellation ? 1 : 0) || 0).toFixed(1)}%` },
    { label: "Median Hours from Order to Collection", value: (d3.median(data.map(d => d.collection_hours).filter(Number.isFinite)) || 0).toFixed(2) },
    { label: "Median Hours from Order to Verification", value: (d3.median(data.map(d => d3.max([d.min_verified_hours, d.max_verified_hours])).filter(Number.isFinite)) || 0).toFixed(2) },
    { label: "Mean | Std. Deviation of Count of Tube Tracker Events", value: String((d3.mean(data.map(d => d.n_tube_tracker_events).filter(Number.isFinite)) || 0).toFixed(2)) + " | " + String((d3.deviation(data.map(d => d.n_tube_tracker_events).filter(Number.isFinite))).toFixed(2))}
  ];

  d3.select("#kpi-cards")
    .selectAll(".kpi")
    .data(kpis)
    .join("div")
    .attr("class", "kpi")
    .html(d => `<div class='label'>${d.label}</div><div class='value'>${d.value}</div>`);
}

function renderKDE(data) {
  const width = 900, height = 150, margin = { top: 20, right: 24, bottom: 40, left: 24 };
  const svg = d3.select("#kde-chart").html("").append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const x = d3.scaleUtc().domain(d3.extent(data, d => timeParser(d.ordered_at))).range([margin.left, width - margin.right]).clamp(true);
 
  // construct the two KDE curves
  const cancelled = data.filter(d => d.has_cancellation).map(d => x(timeParser(d.ordered_at)));
  const successful = data.filter(d => !d.has_cancellation).map(d => x(timeParser(d.ordered_at)));

  const KDE = kernelDensityEstimator(
    Epanechnikov(7),
    x.ticks(40).map(d => x(d))
  );

  // use the concat to make sure it closes the area at the xaxis
  const cancelled_density = KDE(cancelled).map(d => [d[0], d[1] * cancelled.length / data.length]).concat([[width - margin.right, 0]]);
  const successful_density = KDE(successful).map(d => [d[0], d[1] * successful.length / data.length]).concat([[width - margin.right, 0]]);

  const y = d3.scaleLinear().domain([0, d3.max(cancelled_density.concat(successful_density).map(d => d[1]))]).nice().range([height - margin.bottom, margin.top]);
  const lineGenerator = d3.line()
                          .x((d) =>   d[0] )
                          .y((d) => y(d[1]))
                          .curve(d3.curveMonotoneX);

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
  svg.append("path").attr("stroke", "steelblue")
                    .attr("stroke-width", 1)
                    .attr("d", d3.line()([[margin.left / 2, (height - margin.top - margin.bottom) / 2 - 5], [margin.left, (height - margin.top - margin.bottom)/2 - 5]]))
                    .attr("text", "Validated Orders");
  svg.append("text").text("Validated Orders").style("font-size", "8px")
                    .attr("x", margin.left).attr("dx", 2)
                    .attr("y", (height - margin.top - margin.bottom)/2 - 5).attr("dy", 2);
  svg.append("path").attr("stroke", 'steelblue')
                    .attr("stroke-width", 1)
                    .attr("stroke-linejoin","round")
                    .attr("fill",'steelblue')
                    .attr("fill-opacity", 0.2)
                    .attr("d", lineGenerator(successful_density));
  svg.append("path").attr("stroke", "red")
                    .attr("stroke-width", 1)
                    .attr("d", d3.line()([[margin.left / 2, (height - margin.top - margin.bottom) / 2 + 5], [margin.left, (height - margin.top - margin.bottom)/2 + 5]]))
  svg.append("text").text("Cancelled Orders").style("font-size", "8px")
                    .attr("x", margin.left).attr("dx", 2)
                    .attr("y", (height - margin.top - margin.bottom)/2 + 5).attr("dy", 2);
  svg.append("path").attr("stroke", 'red')
                    .attr("stroke-width", 1)
                    .attr("stroke-linejoin","round")
                    .attr("fill",'red')
                    .attr("fill-opacity", 0.2)
                    .attr("d", lineGenerator(cancelled_density));

  // Brush things
  const brush = d3.brushX()
                  .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
                  .on("brush", brushed)
                  .on("end", brushended);

  const defaultSelection = state.global.dateStart && state.global.dateEnd
                ? [x(state.global.dateStart), x(state.global.dateEnd)]
                : [x(d3.utcYear.offset(x.domain()[1], -1)), x.range()[1]];

  const gb = svg.append("g").call(brush).call(brush.move, defaultSelection);

  function brushed({selection}) {
    if (selection) {
      const [startDate, endDate] = selection.map(x.invert, x).map(d3.utcDay.round);
      const idxStart = Math.max(data.findIndex(d => timeParser(d.ordered_at) >= startDate), 0);
      const idxEnd = Math.max(data.findLastIndex(d => timeParser(d.ordered_at) <= endDate), 1);
      if(idxStart != state.global.idxStart || idxEnd != state.global.idxEnd) {
        state.global.dateStart = startDate;
        state.global.dateEnd = endDate;
        state.global.idxStart = idxStart;
        state.global.idxEnd = idxEnd;
        renderTimespanChange();
      }
    }
  }
  function brushended({selection}) {
    if(!selection) {
      gb.call(brush.move, defaultSelection);
    }
  }
}


function renderTimeline(data) {
  const points = timelineStages
    .map(s => ({ stage: s.label, value: mean(data.map(d => d[s.key])) }))
    .filter(d => d.value !== null);

  const width = 900, height = 290, margin = { top: 20, right: 40, bottom: 40, left: 40 };
  const svg = d3.select("#timeline-chart").html("").append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const x = d3.scalePoint().domain(points.map(d => d.stage)).range([margin.left, width - margin.right]);
  // const y = d3.scaleLinear().domain([0, d3.max(points, d => d.value) * 1.1 || 1]).nice().range([height - margin.bottom, margin.top]);
  const y = d3.scaleLinear().domain(d3.extent(points, d => d.value)).nice().range([height - margin.bottom, margin.top]);

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
  // svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

  const line = d3.line().x(d => x(d.stage)).y(d => y(d.value));
  svg.append("path").datum(points).attr("fill", "none").attr("stroke", "#1f4f66").attr("stroke-width", 2.5).attr("d", line);

  svg.selectAll("circle").data(points).join("circle")
    .attr("cx", d => x(d.stage)).attr("cy", d => y(d.value)).attr("r", 4.2).attr("fill", "#1f4f66");

  svg.selectAll(".pt-label").data(points).join("text")
    .attr("class", "pt-label")
    .attr("x", d => x(d.stage)).attr("y", d => y(d.value) - 10)
    .attr("text-anchor", "middle").attr("fill", "#374151").style("font-size", "11px")
    .text(d => `${d.value.toFixed(2)}h`);
}

function filterAB(sourceData, config) {
  return sourceData.filter(d => {
    const weekOk = config.weekpart === "All" || d.ordered_weekpart === config.weekpart;
    const cancelOk = config.cancel === "All"
      || (config.cancel === "Cancelled" && d.has_cancellation)
      || (config.cancel === "Not Cancelled" && !d.has_cancellation);
    return weekOk && cancelOk;
  });
}

function summaryText(data) {
  const avgVerified = mean(data.map(d => d.max_verified_hours));
  const cancelRate = d3.mean(data, d => d.has_cancellation ? 1 : 0) || 0;
  return `N=${data.length} | Avg verified=${avgVerified ? avgVerified.toFixed(2) : "NA"}h | Cancel rate=${(cancelRate * 100).toFixed(1)}%`;
}

function renderAB(dataA, dataB) {
  d3.select("#a-summary").text(summaryText(dataA));
  d3.select("#b-summary").text(summaryText(dataB));

  const metrics = [
    { label: "Avg Collection (h)", key: "collection_hours" },
    { label: "Avg Receipt (h)", key: "receipt_hours" },
    { label: "Avg Verified (h)", key: "max_verified_hours" },
    { label: "Cancellation Rate (%)", key: "cancel_rate" }
  ];

  const rows = metrics.map(m => {
    const a = m.key === "cancel_rate"
      ? (d3.mean(dataA, d => d.has_cancellation ? 100 : 0) || 0)
      : (mean(dataA.map(d => d[m.key])) || 0);

    const b = m.key === "cancel_rate"
      ? (d3.mean(dataB, d => d.has_cancellation ? 100 : 0) || 0)
      : (mean(dataB.map(d => d[m.key])) || 0);

    return { metric: m.label, A: a, B: b };
  });

  const width = 960;
  const rowH = 52;
  const height = 120 + rowH * rows.length;
  const margin = { top: 52, right: 40, bottom: 30, left: 220 };

  const svg = d3.select("#ab-chart")
    .html("")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  const maxV = d3.max(rows.flatMap(r => [r.A, r.B])) || 1;

  const x = d3.scaleLinear()
    .domain([0, maxV * 1.15])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(rows.map(r => r.metric))
    .range([margin.top, height - margin.bottom])
    .padding(0.35);

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(x).ticks(6));

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  svg.selectAll(".barA")
    .data(rows)
    .join("rect")
    .attr("class", "barA")
    .attr("x", x(0))
    .attr("y", d => y(d.metric) + 6)
    .attr("width", d => Math.max(0, x(d.A) - x(0)))
    .attr("height", 14)
    .attr("fill", "#1f4f66");

  svg.selectAll(".barB")
    .data(rows)
    .join("rect")
    .attr("class", "barB")
    .attr("x", x(0))
    .attr("y", d => y(d.metric) + 26)
    .attr("width", d => Math.max(0, x(d.B) - x(0)))
    .attr("height", 14)
    .attr("fill", "#64748b");

  svg.selectAll(".txtA")
    .data(rows)
    .join("text")
    .attr("class", "txtA")
    .attr("x", d => x(d.A) + 6)
    .attr("y", d => y(d.metric) + 18)
    .attr("fill", "#1f4f66")
    .style("font-size", "12px")
    .text(d => d.A.toFixed(2));

  svg.selectAll(".txtB")
    .data(rows)
    .join("text")
    .attr("class", "txtB")
    .attr("x", d => x(d.B) + 6)
    .attr("y", d => y(d.metric) + 38)
    .attr("fill", "#475569")
    .style("font-size", "12px")
    .text(d => d.B.toFixed(2));

  const legend = svg.append("g")
    .attr("transform", `translate(${width - 180}, 8)`);

  legend.append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("fill", "#1f4f66")
    .style("font-size", "12px")
    .text("■ Group A");

  legend.append("text")
    .attr("x", 90)
    .attr("y", 0)
    .attr("fill", "#475569")
    .style("font-size", "12px")
    .text("■ Group B");
}

function renderRaw() {
  state.filtered = state.raw;
  renderKDE(state.raw)
  renderKPIs(state.raw);
  renderTimeline(state.raw);
  const aData = filterAB(state.raw, state.groupA);
  const bData = filterAB(state.raw, state.groupB);
  renderAB(aData, bData);
}

function renderTimespanChange() {
  const sliced = state.filtered.slice(state.global.idxStart, state.global.idxEnd);
  renderKPIs(sliced);
  renderTimeline(sliced);
  const aData = filterAB(sliced, state.groupA);
  const bData = filterAB(sliced, state.groupB);
  renderAB(aData, bData);
}

function renderStateChange() {
  applyGlobalFilters();
  renderKDE(state.filtered)
  renderKPIs(state.filtered.slice(state.global.idxStart, state.global.idxEnd));
  renderTimeline(state.filtered.slice(state.global.idxStart, state.global.idxEnd));
  const aData = filterAB(state.filtered.slice(state.global.idxStart, state.global.idxEnd), state.groupA);
  const bData = filterAB(state.filtered.slice(state.global.idxStart, state.global.idxEnd), state.groupB);
  renderAB(aData, bData);
}

function setupControls() {
  const opts = {
    tests: uniqueValues(state.raw, "test_code"),
    depts: uniqueValues(state.raw, "test_performing_dept"),
    streets: uniqueValues(state.raw, "event_street"),
    weekparts: ["All", "Weekday", "Weekend", "Unknown"]
  };

  populateSelect("#global-test", opts.tests);
  populateSelect("#global-dept", opts.depts);
  populateSelect("#global-street", opts.streets);
  populateSelect("#global-weekpart", opts.weekparts);

  populateSelect("#a-weekpart", opts.weekparts);
  populateSelect("#b-weekpart", opts.weekparts);
  populateSelect("#a-cancel", ["All", "Cancelled", "Not Cancelled"]);
  populateSelect("#b-cancel", ["All", "Cancelled", "Not Cancelled"]);

  d3.select("#a-weekpart").property("value", "Weekday");
  d3.select("#b-weekpart").property("value", "Weekend");

  d3.select("#global-test").on("change", e => { state.global.test_code = e.target.value; renderStateChange(); });
  d3.select("#global-dept").on("change", e => { state.global.test_performing_dept = e.target.value; renderStateChange(); });
  d3.select("#global-street").on("change", e => { state.global.event_street = e.target.value; renderStateChange(); });
  d3.select("#global-weekpart").on("change", e => { state.global.ordered_weekpart = e.target.value; renderStateChange(); });

  d3.select("#a-weekpart").on("change", e => { state.groupA.weekpart = e.target.value; renderStateChange(); });
  d3.select("#a-cancel").on("change", e => { state.groupA.cancel = e.target.value; renderStateChange(); });
  d3.select("#b-weekpart").on("change", e => { state.groupB.weekpart = e.target.value; renderStateChange(); });
  d3.select("#b-cancel").on("change", e => { state.groupB.cancel = e.target.value; renderStateChange(); });

  d3.select("#reset-global").on("click", () => {
    state.global = {
      test_code: "All",
      test_performing_dept: "All",
      event_street: "All",
      ordered_weekpart: "All"
    };
    d3.select("#global-test").property("value", "All");
    d3.select("#global-dept").property("value", "All");
    d3.select("#global-street").property("value", "All");
    d3.select("#global-weekpart").property("value", "All");
    render();
  });
}

fetch("dashboard_data.json")
  .then(r => r.json())
  .then(data => {
    state.raw = data;
    setupControls();
    renderRaw();
  })
  .catch(err => {
    d3.select("main").append("p").style("color", "crimson").text(`Failed to load dashboard_data.json: ${err}`);
  });
