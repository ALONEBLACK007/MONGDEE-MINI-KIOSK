const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.style = {};
    this.classList = { toggle() {}, contains() { return false; }, remove() {} };
    this.renders = 0;
    this.open = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.renders++; }
  addEventListener() {}
  querySelector() { return null; }
  get childElementCount() { return this.children.length; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const ids = new Map();
const element = id => {
  if (!ids.has(id)) ids.set(id, new Element());
  return ids.get(id);
};
let response = { status: 'idle', updated_at: 1 };
let pendingTimeout = null;
const context = vm.createContext({
  document: { getElementById: element, createElement: tag => new Element(tag), addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch: async url => ({ ok: true, json: async () => url.includes('/camera/') ? { camera_open: true, has_reference: true, state: 'empty' } : response }),
  setInterval() {}, setTimeout(fn) { pendingTimeout = fn; return 1; }, clearTimeout() { pendingTimeout = null; }, AbortSignal, Intl, console,
});
vm.runInContext(fs.readFileSync('frontend/static/js/kiosk.js', 'utf8'), context);

(async () => {
  // Let startup polling finish before manually advancing server responses.
  await new Promise(resolve => setImmediate(resolve));
  response = { status: 'matched', scan_event_id: 1, updated_at: 2, confidence: 0.9, product: { id: 1, name: 'A' } };
  await context.pollRecognition();
  const pane = element('infoPane');
  const first = pane.renders;
  await context.pollRecognition();
  assert.equal(pane.renders, first, 'unchanged match must not restart the video');
  response = { ...response, scan_event_id: 2, updated_at: 3, product: { id: 2, name: 'B' } };
  await context.pollRecognition();
  assert.equal(pane.renders, first + 1, 'same status with a different product must render');
  assert(pane.children.some(node => node.textContent === 'B'));
  response = { status: 'needs_reference', updated_at: 4, message: 'Capture empty platform' };
  await context.pollRecognition();
  assert(pane.children[0].children.some(node => node.href === '/calibrate'));
  response = { status: 'matched', scan_event_id: 3, updated_at: 5, manually_confirmed: true, product: { id: 2, name: 'B' } };
  await context.pollRecognition();
  assert(pane.children.flatMap(node => node.children).some(node => node.textContent === 'ยืนยันโดยผู้ใช้'));

  // The held-product popup opens on a confident match and closes when the
  // product leaves the frame.
  const popup = element('productPopup');
  response = { status: 'matched', scan_event_id: 9, updated_at: 9, confidence: 0.8, product: { id: 7, name: 'C', story: 'tale', video_url: 'https://v' } };
  await context.pollRecognition();
  assert.equal(popup.open, true, 'popup opens on a confident match');
  assert(element('popupContent').children.length > 0, 'popup has detail content');
  response = { status: 'idle', updated_at: 10 };
  await context.pollRecognition();
  assert.equal(popup.open, false, 'popup closes once the product is put down');

  // Auto-close: the customer keeps standing in front of the camera so the
  // backend stays "matched" — the popup must still time out on its own and
  // not immediately reopen for the same product.
  response = { status: 'matched', scan_event_id: 20, updated_at: 20, confidence: 0.8, product: { id: 8, name: 'D' } };
  await context.pollRecognition();
  assert.equal(popup.open, true, 'popup opens for the held product');
  assert.equal(typeof pendingTimeout, 'function', 'an auto-close timer was armed');
  pendingTimeout();  // fire the timeout
  assert.equal(popup.open, false, 'popup auto-closes after the timeout');
  response = { ...response, updated_at: 21 };  // still matched, same product
  await context.pollRecognition();
  assert.equal(popup.open, false, 'popup does not nag by reopening for the same held product');

  console.log('PASS: video, product swap, reference link, manual label, popup open/close/auto-close');
})().catch(error => { console.error(error); process.exitCode = 1; });
