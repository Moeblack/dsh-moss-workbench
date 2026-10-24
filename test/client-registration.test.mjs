import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createClientPlugin } from "../src/client/entry.js";
import { createDocumentStore, documentFingerprint, updateActiveDocument, saveActiveDocument, newDocument, switchDocument, closeDocument, renameDocument } from '../src/client/document-store.js';

const artwork = () => ({ canvasWidth: 1760, canvasHeight: 896, globalCaption: '特写镜头', globalNoteZh: '', palette: [], meta: [], items: Array.from({ length: 5 }, (_, n) => ({ id: `box-${n}`, noteZh: `框${n}`, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] })), strokes: [] });
const blank = () => ({ ...artwork(), globalCaption: '', items: [], strokes: [] });

test('document migration seeds the existing five-box composition without mutating it', () => {
  const state = artwork(), store = createDocumentStore(state);
  assert.equal(store.documents.length, 1);
  assert.equal(store.documents[0].title, '特写镜头');
  assert.equal(store.documents[0].state.items.length, 5);
  assert.equal(store.documents[0].savedFingerprint, documentFingerprint(state));
  store.documents[0].state.items.pop();
  assert.equal(state.items.length, 5);
});
test('new auto-saves the original, switches to a blank, and restores the original on tab selection', () => {
  const state = artwork(), initial = createDocumentStore(state), originalId = initial.activeId;
  const edited = { ...state, globalNoteZh: '未保存的特写修改' };
  const draft = updateActiveDocument(initial, edited);
  assert.notEqual(draft.documents[0].savedFingerprint, documentFingerprint(edited));
  const next = newDocument(draft, edited, blank());
  assert.equal(next.documents.length, 2);
  assert.equal(next.documents[0].state.items.length, 5);
  assert.equal(next.documents[0].savedFingerprint, documentFingerprint(edited));
  assert.equal(next.documents[1].title, '未命名-2');
  assert.deepEqual(next.documents[1].state.items, []);
  assert.equal(next.activeId, next.documents[1].id);
  const restored = switchDocument(next, blank(), originalId);
  assert.equal(restored.activeId, originalId);
  assert.equal(restored.documents[0].state.globalNoteZh, edited.globalNoteZh);
  const reloaded = createDocumentStore(blank(), JSON.parse(JSON.stringify(restored)));
  assert.deepEqual(reloaded, restored);
});
test('explicit save clears dirty; drafts survive switching and manual titles stay stable', () => {
  let store = createDocumentStore(artwork());
  store = newDocument(store, artwork(), blank());
  const id = store.activeId, edited = { ...blank(), globalCaption: '新场景' };
  store = updateActiveDocument(store, edited);
  assert.equal(store.documents[1].title, '新场景');
  assert.notEqual(store.documents[1].savedFingerprint, documentFingerprint(edited));
  store = saveActiveDocument(store, edited);
  assert.equal(store.documents[1].savedFingerprint, documentFingerprint(edited));
  store = renameDocument(store, id, '我的文件');
  store = updateActiveDocument(store, { ...edited, globalCaption: '不同描述' });
  assert.equal(store.documents[1].title, '我的文件');
  const other = switchDocument(store, store.documents[1].state, store.documents[0].id);
  assert.equal(other.documents[1].state.globalCaption, '不同描述');
});
test('closing the active tab chooses its neighbour and closing the last leaves a blank tab', () => {
  const initial = createDocumentStore(artwork()), two = newDocument(initial, artwork(), blank());
  const one = closeDocument(two, blank(), two.activeId, blank());
  assert.equal(one.activeId, initial.activeId);
  assert.equal(one.documents.length, 1);
  const last = closeDocument(one, artwork(), one.activeId, blank());
  assert.equal(last.documents.length, 1);
  assert.equal(last.documents[0].title, '未命名-1');
  assert.deepEqual(last.documents[0].state.items, []);
});
test('invalid persisted document entries cannot discard the migration artwork', () => {
  const store = createDocumentStore(artwork(), { version: 1, documents: [{ id: 'broken', state: {} }] });
  assert.equal(store.documents[0].state.items.length, 5);
});

test('built ratio dropdown includes every preset and selecting one immediately resizes the canvas', () => {
  const local = new Map(), entries = [];
  const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useRef: initial => ({ current: initial }), useEffect: () => {}, useMemo: fn => fn(), useCallback: fn => fn };
  const context = { window: { __ModuleLoader__: { load: definition => definition.factory(() => React).apply({ slots: { inject: (_name, fn) => fn(), register: (options, component) => entries.push({ options, component }) }, inject: () => {} }) } }, localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) }, setTimeout: () => 1, clearTimeout: () => {} };
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), context);
  let tree = entries.find(entry => entry.options.name === 'conversation.view').component({});
  while (typeof tree.type === 'function') tree = tree.type(tree.props);
  const nodes = [];
  function walk(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk); nodes.push(node); walk(node.props?.children); }
  walk(tree);
  const dropdown = nodes.find(node => node.type === 'select' && node.props['aria-label'] === '画布比例');
  assert.ok(dropdown); assert.equal(dropdown.props.value, '2:3');
  const options = dropdown.props.children.flat();
  assert.equal(options.length, 14); assert.equal(options.at(-1).props.value, 'custom');
  for (const ratio of ['4:3', '9:19.5', '21:9', '2:1']) {
    dropdown.props.onChange({ target: { value: ratio } });
    const state = JSON.parse(local.get('dsh-moss-workbench-state-v1')).present;
    assert.equal(state.canvasWidth % 32, 0); assert.equal(state.canvasHeight % 32, 0);
    assert.equal(Number(state.canvasSizeConfig.ratioWidth) / Number(state.canvasSizeConfig.ratioHeight), ratio.split(':').map(Number).reduce((w, h) => w / h));
  }
});

test('built client bundle embeds and initializes the document store', () => {
  let plugin;
  const local = new Map();
  const context = { window: { __ModuleLoader__: { load: definition => { plugin = definition.factory(() => ({})); } } }, localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) } };
  assert.doesNotThrow(() => vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), context));
  assert.equal(typeof plugin.apply, 'function');
});

test("conversation view uses a callable or omitted slot inject option", () => {
  const entries = [];
  const React = {
    createElement: (type, props) => ({ type, props }),
  };
  const plugin = createClientPlugin(React);
  plugin.apply({
    slots: {
      inject: (_name, register) => register(),
      register: (options, component) => {
        entries.push({ options, component });
      },
    },
    // Optional services are not needed to register the top conversation tab.
    inject: () => {},
  });
  const view = entries.find(({ options }) => options.name === "conversation.view");
  assert.ok(view, "the full-width view must be registered");
  assert.equal(view.options.id, "moss-workbench");
  assert.equal(view.options.label(), "MOSS 分镜台");
  const inject = view.options.inject;
  assert.ok(inject === undefined || typeof inject === "function");
  // The host calls a supplied inject callback before rendering a session slot.
  if (inject !== undefined) assert.doesNotThrow(() => inject("test-session", {}));
  assert.equal(view.component({}).props.mode, "full");
});
