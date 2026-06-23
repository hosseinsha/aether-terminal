export function leaves(node, acc = []) {
  if (!node) return acc;
  if (node.type === "leaf") acc.push(node);
  else {
    leaves(node.a, acc);
    leaves(node.b, acc);
  }
  return acc;
}

export function findLeaf(node, id) {
  if (!node) return null;
  if (node.type === "leaf") return node.pane.id === id ? node : null;
  return findLeaf(node.a, id) || findLeaf(node.b, id);
}

export function findParent(node, target, parent = null) {
  if (!node || !target) return null;
  if (node === target) return parent;
  if (node.type !== "split") return null;
  return findParent(node.a, target, node) || findParent(node.b, target, node);
}

// Splice `leaf` next to `target` by wrapping them in a new split. Returns the
// (possibly new) root. Mutates the parent link in place when `target` is nested.
export function insertSplit(root, target, leaf, dir, ratio = 0.5) {
  const split = { type: "split", dir, ratio, a: target, b: leaf };
  const parent = findParent(root, target);
  if (!parent) return split;
  if (parent.a === target) parent.a = split;
  else parent.b = split;
  return root;
}

// Drop `leaf` and promote its sibling into the parent's slot. Returns the new
// root (null when the last leaf is removed, the sibling when the parent was root).
export function removeLeaf(root, leaf) {
  if (!leaf) return root;
  const parent = findParent(root, leaf);
  if (!parent) return null;
  const sibling = parent.a === leaf ? parent.b : parent.a;
  const grand = findParent(root, parent);
  if (!grand) return sibling;
  if (grand.a === parent) grand.a = sibling;
  else grand.b = sibling;
  return root;
}

// Swap the panes held by two leaves (identified by pane id). Returns true when
// both leaves exist and were swapped.
export function swapLeaves(root, idA, idB) {
  const la = findLeaf(root, idA);
  const lb = findLeaf(root, idB);
  if (!la || !lb) return false;
  const tmp = la.pane;
  la.pane = lb.pane;
  lb.pane = tmp;
  return true;
}
