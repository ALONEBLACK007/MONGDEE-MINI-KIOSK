// Shared by enroll.js and kiosk.js: positions the ROI overlay box (from
// /api/calibration) and colors/labels it from /api/camera/status' box_status
// (none/blurry/ok) — kept in one place so both pages stay in sync.
const DETECT_BOX_LABELS = { none: "ไม่พบสินค้า", blurry: "สินค้าไม่ชัด", ok: "ปกติ" };

async function positionDetectBox(boxEl) {
  try {
    const res = await fetch("/api/calibration");
    const data = await res.json();
    const { x, y, w, h } = data.roi;
    boxEl.style.left = `${x * 100}%`;
    boxEl.style.top = `${y * 100}%`;
    boxEl.style.width = `${w * 100}%`;
    boxEl.style.height = `${h * 100}%`;
  } catch (err) {
    // Leave the box hidden (no status class applied yet) if this fails.
  }
}

function applyDetectBoxStatus(boxEl, labelEl, status) {
  const boxStatus = status && status.camera_open && status.has_reference ? status.box_status : null;
  boxEl.className = "detect-box" + (boxStatus ? ` status-${boxStatus}` : "");
  labelEl.textContent = boxStatus ? DETECT_BOX_LABELS[boxStatus] || "" : "";
}
