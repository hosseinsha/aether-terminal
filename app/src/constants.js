export const LIMITS = {
  maxPanes: 8,
};

export const TIMING = {
  paneRemovalMs: 420,
  sessionAttachDelayMs: 30,
  resizeDebounceMs: 80,
};

export const TAURI_COMMANDS = {
  attach: "attach",
  closeSession: "close_session",
  connectRemote: "connect_remote",
  createSession: "create_session",
  detach: "detach",
  input: "input",
  listSessions: "list_sessions",
  resize: "resize",
};

export const TAURI_EVENTS = {
  connStatus: "aether:conn-status",
  created: "aether:created",
  error: "aether:error",
  exited: "aether:exited",
  output: "aether:output",
  sessions: "aether:sessions",
  snapshot: "aether:snapshot",
};

export const SELECTORS = {
  pixelArt: "#pixelart",
};
