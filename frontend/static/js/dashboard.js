function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function loadSummary() {
  const res = await fetch("/api/analytics/summary");
  const rows = await res.json();

  const totalScans = rows.reduce((sum, r) => sum + r.scan_count, 0);
  document.getElementById("statTotalScans").textContent = totalScans;
  document.getElementById("statTotalProducts").textContent = rows.length;
  document.getElementById("statTopProduct").textContent = rows.length && rows[0].scan_count > 0 ? rows[0].name : "-";

  const chart = document.getElementById("barChart");
  chart.replaceChildren();
  const maxCount = Math.max(1, ...rows.map((r) => r.scan_count));

  if (!rows.length) {
    chart.append(el("div", "hint", "ยังไม่มีข้อมูลสินค้า"));
    return;
  }

  for (const r of rows) {
    const row = el("div", "bar-row");
    row.append(el("div", "name", r.name));
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.width = `${(r.scan_count / maxCount) * 100}%`;
    track.append(fill);
    row.append(track);
    row.append(el("div", "count", String(r.scan_count)));
    chart.append(row);
  }
}

async function loadHourly() {
  const res = await fetch("/api/analytics/hourly");
  const rows = await res.json();
  const byHour = new Array(24).fill(0);
  for (const r of rows) byHour[r.hour] = r.count;
  const maxCount = Math.max(1, ...byHour);

  const chart = document.getElementById("hourlyChart");
  const labels = document.getElementById("hourlyLabels");
  chart.replaceChildren();
  labels.replaceChildren();

  byHour.forEach((count, hour) => {
    const bar = el("div", "hourly-bar");
    bar.style.height = `${Math.max(2, (count / maxCount) * 100)}%`;
    bar.title = `${hour}:00 - ${count} ครั้ง`;
    chart.append(bar);

    labels.append(el("span", "", hour % 3 === 0 ? String(hour) : ""));
  });
}

loadSummary();
loadHourly();
setInterval(loadSummary, 5000);
setInterval(loadHourly, 5000);
