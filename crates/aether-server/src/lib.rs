//! Aether session server, as a library.
//!
//! Owns the terminal state that must survive client disconnects:
//!   * one PTY per session (via `portable-pty`),
//!   * a `vt100` grid mirror per session (for snapshot-on-attach + scrollback),
//!   * a broadcast channel per session that fans live output out to every
//!     attached client.
//!
//! Exposed as a library so it can run two ways from a single binary:
//!   * **embedded** — the macOS app calls [`serve`] in-process on a temp socket
//!     for local, zero-setup sessions (which end when the app quits),
//!   * **standalone** — a remote host runs the `aether-server` binary as a daemon.
//!
//! Either way the wire protocol is identical; only the listener's location changes.

use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use aether_proto::{read_msg, write_msg, ClientMsg, ServerMsg, SessionId, SessionInfo};
use anyhow::Result;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::UnixListener;
use tokio::sync::{broadcast, mpsc};

/// Bytes of raw PTY output kept per session for scrollback replay on attach.
/// Roughly the 5000-line `vt100` scrollback at 80 cols; the visible screen is
/// just the tail of this stream, so replaying it reproduces screen + history.
const HISTORY_CAP: usize = 1024 * 1024;

/// What the per-session reader thread fans out to attached clients.
#[derive(Clone)]
enum OutEvent {
    Data(Vec<u8>),
    Exit(Option<i32>),
}

/// Append a PTY chunk to the rolling history, trimming the front back under the
/// cap and then to the next line boundary — so a replay never starts in the
/// middle of an escape sequence.
fn push_history(h: &mut VecDeque<u8>, chunk: &[u8]) {
    h.extend(chunk.iter().copied());
    if h.len() > HISTORY_CAP {
        for _ in 0..(h.len() - HISTORY_CAP) {
            h.pop_front();
        }
        while let Some(&b) = h.front() {
            h.pop_front();
            if b == b'\n' {
                break;
            }
        }
    }
}

/// A live, persistent session: a PTY plus the state needed to render and revive it.
struct Session {
    info: Mutex<SessionInfo>,
    /// Grid mirror, fed by the reader thread; kept for resize reflow.
    parser: Arc<Mutex<vt100::Parser>>,
    /// Rolling raw PTY output, replayed on attach so clients get scrollback,
    /// not just the visible screen.
    history: Arc<Mutex<VecDeque<u8>>>,
    /// Writes go to the PTY master (keystrokes from clients).
    writer: Mutex<Box<dyn Write + Send>>,
    /// Kept for resize.
    master: Mutex<Box<dyn MasterPty + Send>>,
    /// Live output fan-out.
    out_tx: broadcast::Sender<OutEvent>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

impl Session {
    fn spawn(id: SessionId, cols: u16, rows: u16, shell: Option<String>) -> Result<Arc<Self>> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let shell = shell.unwrap_or_else(default_shell);
        let mut cmd = CommandBuilder::new(&shell);
        cmd.env("TERM", "xterm-256color");
        if let Some(home) = std::env::var_os("HOME") {
            cmd.cwd(home);
        }

        let child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave); // we never need the slave handle again
        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        let parser = Arc::new(Mutex::new(vt100::Parser::new(rows, cols, 5000)));
        let history = Arc::new(Mutex::new(VecDeque::<u8>::new()));
        let (out_tx, _keep) = broadcast::channel::<OutEvent>(1024);

        // Blocking PTY read loop on its own thread: record raw output for the
        // scrollback snapshot, feed the grid mirror, then fan the bytes out to
        // attached clients.
        {
            let parser = parser.clone();
            let history = history.clone();
            let out_tx = out_tx.clone();
            std::thread::spawn(move || {
                let mut buf = [0u8; 8192];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) | Err(_) => {
                            let _ = out_tx.send(OutEvent::Exit(None));
                            break;
                        }
                        Ok(n) => {
                            let chunk = buf[..n].to_vec();
                            if let Ok(mut h) = history.lock() {
                                push_history(&mut h, &chunk);
                            }
                            if let Ok(mut p) = parser.lock() {
                                p.process(&chunk);
                            }
                            // Err just means nobody is attached right now; the
                            // history still captured it for the next snapshot.
                            let _ = out_tx.send(OutEvent::Data(chunk));
                        }
                    }
                }
            });
        }

        let info = SessionInfo {
            id,
            title: shell_title(&shell),
            cols,
            rows,
            alive: true,
        };

        Ok(Arc::new(Session {
            info: Mutex::new(info),
            parser,
            history,
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            out_tx,
            child: Mutex::new(child),
        }))
    }

    /// Raw output replayed on attach. Because it's the verbatim PTY byte stream
    /// (up to [`HISTORY_CAP`]), feeding it to a terminal reproduces the visible
    /// screen *and* the scrollback above it — not just the current screen.
    fn snapshot(&self) -> Vec<u8> {
        self.history
            .lock()
            .map(|h| h.iter().copied().collect())
            .unwrap_or_default()
    }

    fn write_input(&self, data: &[u8]) {
        if let Ok(mut w) = self.writer.lock() {
            let _ = w.write_all(data);
            let _ = w.flush();
        }
    }

    fn resize(&self, cols: u16, rows: u16) {
        if let Ok(m) = self.master.lock() {
            let _ = m.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
        if let Ok(mut p) = self.parser.lock() {
            p.set_size(rows, cols);
        }
        if let Ok(mut i) = self.info.lock() {
            i.cols = cols;
            i.rows = rows;
        }
    }

    fn info(&self) -> SessionInfo {
        self.info.lock().unwrap().clone()
    }
}

type Sessions = Arc<Mutex<HashMap<SessionId, Arc<Session>>>>;

/// Bind a Unix socket at `socket_path` and serve sessions until the process ends.
pub async fn serve(socket_path: impl AsRef<Path>) -> Result<()> {
    let socket_path = socket_path.as_ref();
    let _ = std::fs::remove_file(socket_path);
    let listener = UnixListener::bind(socket_path)?;
    eprintln!("aether-server listening on {}", socket_path.display());

    let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
    let next_id = Arc::new(AtomicU64::new(1));

    loop {
        let (stream, _) = listener.accept().await?;
        let (rd, wr) = stream.into_split();
        let sessions = sessions.clone();
        let next_id = next_id.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_conn(rd, wr, sessions, next_id).await {
                eprintln!("connection ended: {e}");
            }
        });
    }
}

/// Serve a single connection over stdin/stdout. Used for remote hosts: a client
/// runs `ssh host aether-server --stdio` and speaks the protocol over the pipe.
pub async fn serve_stdio() -> Result<()> {
    let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
    let next_id = Arc::new(AtomicU64::new(1));
    handle_conn(tokio::io::stdin(), tokio::io::stdout(), sessions, next_id).await
}

async fn handle_conn<R, W>(rd: R, wr: W, sessions: Sessions, next_id: Arc<AtomicU64>) -> Result<()>
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let mut rd = rd;

    // A single writer task owns the socket write half; everything that needs to
    // send to this client funnels ServerMsgs through `tx`.
    let (tx, mut rx) = mpsc::channel::<ServerMsg>(256);
    let writer_task = tokio::spawn(async move {
        let mut wr = wr;
        while let Some(msg) = rx.recv().await {
            if write_msg(&mut wr, &msg).await.is_err() {
                break;
            }
        }
    });

    // One forwarder task per attached session.
    let mut forwarders: HashMap<SessionId, tokio::task::JoinHandle<()>> = HashMap::new();

    loop {
        let msg: ClientMsg = match read_msg(&mut rd).await {
            Ok(m) => m,
            Err(_) => break, // client disconnected
        };

        match msg {
            ClientMsg::ListSessions => {
                let list: Vec<SessionInfo> = {
                    let map = sessions.lock().unwrap();
                    map.values().map(|s| s.info()).collect()
                };
                let _ = tx.send(ServerMsg::Sessions(list)).await;
            }

            ClientMsg::CreateSession { cols, rows, shell } => {
                let id = next_id.fetch_add(1, Ordering::Relaxed);
                match Session::spawn(id, cols, rows, shell) {
                    Ok(sess) => {
                        let info = sess.info();
                        sessions.lock().unwrap().insert(id, sess);
                        let _ = tx.send(ServerMsg::Created(info)).await;
                    }
                    Err(e) => {
                        let _ = tx.send(ServerMsg::Error { message: e.to_string() }).await;
                    }
                }
            }

            ClientMsg::Attach { id } => {
                let sess = sessions.lock().unwrap().get(&id).cloned();
                let Some(sess) = sess else {
                    let _ = tx.send(ServerMsg::Error { message: format!("no session {id}") }).await;
                    continue;
                };

                // Snapshot first, then subscribe — no race because the grid
                // mirror and the broadcast are fed by the same byte stream.
                let _ = tx.send(ServerMsg::Snapshot { id, data: sess.snapshot() }).await;

                let mut sub = sess.out_tx.subscribe();
                let tx2 = tx.clone();
                let handle = tokio::spawn(async move {
                    loop {
                        match sub.recv().await {
                            Ok(OutEvent::Data(data)) => {
                                if tx2.send(ServerMsg::Output { id, data }).await.is_err() {
                                    break;
                                }
                            }
                            Ok(OutEvent::Exit(code)) => {
                                let _ = tx2.send(ServerMsg::Exited { id, code }).await;
                                break;
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                });
                if let Some(old) = forwarders.insert(id, handle) {
                    old.abort();
                }
            }

            ClientMsg::Detach { id } => {
                if let Some(h) = forwarders.remove(&id) {
                    h.abort();
                }
            }

            ClientMsg::Input { id, data } => {
                let sess = sessions.lock().unwrap().get(&id).cloned();
                if let Some(s) = sess {
                    s.write_input(&data);
                }
            }

            ClientMsg::Resize { id, cols, rows } => {
                let sess = sessions.lock().unwrap().get(&id).cloned();
                if let Some(s) = sess {
                    s.resize(cols, rows);
                }
            }

            ClientMsg::CloseSession { id } => {
                let sess = sessions.lock().unwrap().remove(&id);
                if let Some(s) = sess {
                    let _ = s.child.lock().unwrap().kill();
                }
                if let Some(h) = forwarders.remove(&id) {
                    h.abort();
                }
            }
        }
    }

    for (_, h) in forwarders {
        h.abort();
    }
    writer_task.abort();
    Ok(())
}

/// Default local socket path (used by the standalone binary and the embedded server).
pub fn default_socket_path() -> PathBuf {
    std::env::temp_dir().join("aether-server.sock")
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

fn shell_title(shell: &str) -> String {
    std::path::Path::new(shell)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("shell")
        .to_string()
}
