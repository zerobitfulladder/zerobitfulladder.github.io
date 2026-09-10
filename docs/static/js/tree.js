/* The content tree, and where the reader is standing in it.

   The build writes the whole tree into a JSON island, so this file carries
   no content of its own. One rule decides how anything is shown:

       a directory is a list, a file is a document.

   Everything the old section enum used to special-case follows from that,
   and `hasList()` is the only place the difference is asked about. */

const island = id => JSON.parse(document.getElementById(id).textContent);
const SITE = island('site-data');

export const ROOT = SITE.root;
export const SETTINGS = SITE.settings;
export const BUILD = SITE.build;
export const COMMIT = SITE.commit;

export const isDir = node => Array.isArray(node?.children);

/* The column shape is a setting, so it has to survive a typo in the yaml. */
const validCols = v =>
  Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && n > 0)
    ? [...v] : null;

export const S = {
  menu: 0,          // which root entry the first column has selected
  sel: {},          // path -> selected index, so each list remembers its place
  focus: 'menu',    // menu | list | doc
  filter: '',
  mode: null,       // the command line's prompt, when it is open
  cols: validCols(SETTINGS.columns) ?? [0.5, 1, 1],
  listKey: null,    // what each pane is currently showing, so a render that
  doc2Key: null,    // would rebuild identical markup can skip the work
  doc3Key: null,
  hash: '',
};

/* ── where we are ─────────────────────────────────────────────── */
export const section = () => ROOT[S.menu];

/** Does the second column hold rows, or a document? */
export const hasList = () => isDir(section());

const haystack = node =>
  [node.name, (node.tags || []).join(' '), node.summary || ''].join(' ').toLowerCase();

/* Categories appear in order of first appearance and keep their entries
   together, because the filename ordering interleaves them. Grouping is a
   display choice, but it has to happen here: the rows the reader sees and
   the index the selection counts in must be the same sequence. */
function cluster(items){
  const order = [], bins = new Map();
  for (const item of items){
    const key = item.group || '';
    if (!bins.has(key)){ bins.set(key, []); order.push(key); }
    bins.get(key).push(item);
  }
  return order.flatMap(key => bins.get(key));
}

export function listItems(){
  const s = section();
  if (!isDir(s)) return [];
  const f = S.filter.trim().toLowerCase();
  // filtering cuts across the categories, so it lists flat
  if (f) return s.children.filter(n => haystack(n).includes(f));
  // every entry belongs to a category, and the categories keep the order
  // the _order file put them in
  return cluster(s.children);
}

export function selIndex(){
  const items = listItems();
  return items.length ? Math.min(S.sel[section().path] ?? 0, items.length - 1) : 0;
}

export function setSel(i){ S.sel[section().path] = i; }

export const current = () => listItems()[selIndex()] ?? null;

/* Three columns, always. The second holds rows when the section is a
   directory and the page itself when it is a file; the third holds the page
   the second column has selected, and stands empty when there is none. */
export const midDoc = () => (hasList() ? null : section());
export const rightDoc = () => (hasList() ? current() : null);

/** Whatever the focused column has singled out — a row, or the page it shows. */
export function focused(){
  if (S.focus === 'menu') return section();
  if (S.focus === 'list') return hasList() ? current() : section();
  return rightDoc();
}

/* ── moving ───────────────────────────────────────────────────── */
export function goSection(id){
  const i = ROOT.findIndex(n => n.id === id);
  if (i < 0) return false;
  if (i !== S.menu){ S.menu = i; S.filter = ''; }
  return true;
}
