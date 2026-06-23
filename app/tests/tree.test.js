import test from "node:test";
import assert from "node:assert/strict";

import { findLeaf, findParent, insertSplit, leaves, removeLeaf, swapLeaves } from "../src/tree.js";

function pane(id) {
  return { id };
}

function leaf(id) {
  return { type: "leaf", pane: pane(id) };
}

test("leaves returns leaf nodes in traversal order", () => {
  const left = { type: "leaf", pane: pane(1) };
  const right = { type: "leaf", pane: pane(2) };
  const root = { type: "split", dir: "h", ratio: 0.5, a: left, b: right };

  assert.deepEqual(leaves(root), [left, right]);
});

test("findLeaf locates panes by id", () => {
  const target = { type: "leaf", pane: pane(7) };
  const root = {
    type: "split",
    dir: "v",
    ratio: 0.6,
    a: { type: "leaf", pane: pane(3) },
    b: target,
  };

  assert.equal(findLeaf(root, 7), target);
  assert.equal(findLeaf(root, 99), null);
});

test("findParent returns the direct split parent", () => {
  const target = { type: "leaf", pane: pane(2) };
  const parent = {
    type: "split",
    dir: "h",
    ratio: 0.5,
    a: { type: "leaf", pane: pane(1) },
    b: target,
  };
  const root = { type: "split", dir: "v", ratio: 0.5, a: parent, b: { type: "leaf", pane: pane(3) } };

  assert.equal(findParent(root, target), parent);
  assert.equal(findParent(root, root), null);
});

test("insertSplit wraps a single-leaf root in a new split", () => {
  const root = leaf(1);
  const added = leaf(2);
  const next = insertSplit(root, root, added, "h");

  assert.equal(next.type, "split");
  assert.equal(next.dir, "h");
  assert.equal(next.ratio, 0.5);
  assert.deepEqual(leaves(next), [root, added]);
});

test("insertSplit re-parents a nested target without disturbing siblings", () => {
  const target = leaf(2);
  const other = leaf(3);
  const root = {
    type: "split",
    dir: "h",
    ratio: 0.5,
    a: leaf(1),
    b: { type: "split", dir: "v", ratio: 0.5, a: target, b: other },
  };
  const added = leaf(4);

  const next = insertSplit(root, target, added, "v");

  assert.equal(next, root); // root identity preserved for nested inserts
  const split = root.b.a;
  assert.equal(split.type, "split");
  assert.deepEqual(leaves(split), [target, added]);
  assert.equal(root.b.b, other);
});

test("removeLeaf promotes the sibling into the parent slot", () => {
  const keep = leaf(1);
  const drop = leaf(2);
  const root = { type: "split", dir: "h", ratio: 0.5, a: keep, b: drop };

  assert.equal(removeLeaf(root, drop), keep);
});

test("removeLeaf returns null when the last leaf goes", () => {
  const only = leaf(1);
  assert.equal(removeLeaf(only, only), null);
});

test("removeLeaf rewires a grandparent for nested removals", () => {
  const keep = leaf(1);
  const drop = leaf(2);
  const sibling = leaf(3);
  const branch = { type: "split", dir: "v", ratio: 0.5, a: drop, b: sibling };
  const root = { type: "split", dir: "h", ratio: 0.5, a: keep, b: branch };

  const next = removeLeaf(root, drop);

  assert.equal(next, root);
  assert.equal(root.b, sibling); // branch collapsed to the surviving sibling
});

test("removeLeaf leaves the tree untouched for a missing leaf", () => {
  const root = { type: "split", dir: "h", ratio: 0.5, a: leaf(1), b: leaf(2) };
  assert.equal(removeLeaf(root, null), root);
});

test("swapLeaves exchanges panes by id and reports success", () => {
  const a = leaf(1);
  const b = leaf(2);
  const root = { type: "split", dir: "h", ratio: 0.5, a, b };

  assert.equal(swapLeaves(root, 1, 2), true);
  assert.equal(a.pane.id, 2);
  assert.equal(b.pane.id, 1);
  assert.equal(swapLeaves(root, 1, 99), false);
});
