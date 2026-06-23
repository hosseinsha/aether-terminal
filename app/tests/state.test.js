import test from "node:test";
import assert from "node:assert/strict";

import { createAppState, createConnection, sessionKey } from "../src/state.js";

test("sessionKey namespaces sessions by connection", () => {
  assert.equal(sessionKey("local", 42), "local/42");
  assert.equal(sessionKey("user@example.com", 7), "user@example.com/7");
});

test("createConnection returns a fresh connection model", () => {
  const conn = createConnection({ id: "remote", label: "remote host" });

  assert.equal(conn.id, "remote");
  assert.equal(conn.label, "remote host");
  assert.equal(conn.status, "connecting");
  assert.deepEqual(conn.panes, []);
  assert.deepEqual(conn.sessions, []);
});

test("createAppState owns active connection and pane aggregation", () => {
  const state = createAppState();
  state.conns.get("local").panes.push({ id: 1 });
  state.conns.set("remote", createConnection({ id: "remote", label: "Remote" }));
  state.conns.get("remote").panes.push({ id: 2 });

  assert.equal(state.activeConn, "local");
  assert.equal(state.setActiveConn("remote"), true);
  assert.equal(state.activeConn, "remote");
  assert.equal(state.setActiveConn("missing"), false);
  assert.deepEqual(
    state.allPanes().map((pane) => pane.id),
    [1, 2],
  );
});
