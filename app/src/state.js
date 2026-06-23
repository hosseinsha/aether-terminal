export function createConnection({ id, label, status = "connecting" }) {
  return {
    id,
    label,
    root: null,
    panes: [],
    focusId: null,
    pending: [],
    status,
    sessions: [],
    bootstrapped: false,
    restoring: false,
  };
}

export function sessionKey(conn, sessionId) {
  return `${conn}/${sessionId}`;
}

export function createAppState() {
  let activeConn = "local";
  const conns = new Map([["local", createConnection({ id: "local", label: "local", status: "connected" })]]);

  return {
    bySession: new Map(),
    conns,
    get activeConn() {
      return activeConn;
    },
    setActiveConn(id) {
      if (!conns.has(id)) return false;
      activeConn = id;
      return true;
    },
    currentConn() {
      return conns.get(activeConn);
    },
    allPanes() {
      const panes = [];
      conns.forEach((conn) => conn.panes.forEach((pane) => panes.push(pane)));
      return panes;
    },
  };
}
