//! AETHER macOS app backend.
//!
//! Single app, two kinds of connection — both speaking the identical protocol:
//!   * **local** — an in-process server on a private Unix socket (zero setup;
//!     ends when the app quits).
//!   * **remote** — `ssh host aether-server --stdio` (or any program), piped
//!     over stdin/stdout. Only the transport differs.
//!
//! Every connection has a string id. Commands carry that id so they route to
//! the right server; events carry it so the webview can namespace panes.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use aether_proto::{read_msg, write_msg, ClientMsg, ServerMsg, SessionInfo};
use base64::Engine as _;
use serde::Serialize;
use tauri::{async_runtime, AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::UnixStream;
use tokio::process::Command;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

type Conns = Arc<Mutex<HashMap<String, UnboundedSender<ClientMsg>>>>;

struct AppState {
    conns: Conns,
}

#[derive(Clone, Serialize)]
struct CreatedPayload { conn: String, id: u64, title: String }
// PTY bytes ride as base64 (`data`) rather than a JSON number array: a `Vec<u8>`
// serialises to `[12,34,...]` (~4 chars/byte) which dominates output latency
// under heavy load. Base64 is ~1.35 char/byte and parses as a plain string.
#[derive(Clone, Serialize)]
struct DataPayload { conn: String, id: u64, data: String }

fn b64(data: Vec<u8>) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}
#[derive(Clone, Serialize)]
struct ExitedPayload { conn: String, id: u64, code: Option<i32> }
#[derive(Clone, Serialize)]
struct ErrorPayload { conn: String, message: String }
#[derive(Clone, Serialize)]
struct ConnStatus { id: String, status: String, message: Option<String> }
#[derive(Clone, Serialize)]
struct SessionsPayload { conn: String, sessions: Vec<SessionInfo> }

// ---- Tauri commands (frontend -> a specific connection) --------------------

fn send(state: &AppState, conn: &str, msg: ClientMsg) {
    if let Some(tx) = state.conns.lock().unwrap().get(conn) {
        let _ = tx.send(msg);
    }
}

#[tauri::command]
fn create_session(state: State<AppState>, conn: String, cols: u16, rows: u16) {
    send(&state, &conn, ClientMsg::CreateSession { cols, rows, shell: None });
}
#[tauri::command]
fn attach(state: State<AppState>, conn: String, id: u64) {
    send(&state, &conn, ClientMsg::Attach { id });
}
#[tauri::command]
fn input(state: State<AppState>, conn: String, id: u64, data: Vec<u8>) {
    send(&state, &conn, ClientMsg::Input { id, data });
}
#[tauri::command]
fn resize(state: State<AppState>, conn: String, id: u64, cols: u16, rows: u16) {
    send(&state, &conn, ClientMsg::Resize { id, cols, rows });
}
#[tauri::command]
fn close_session(state: State<AppState>, conn: String, id: u64) {
    send(&state, &conn, ClientMsg::CloseSession { id });
}
#[tauri::command]
fn list_sessions(state: State<AppState>, conn: String) {
    send(&state, &conn, ClientMsg::ListSessions);
}
/// Stop receiving a session's output without killing it — the session keeps
/// running on the server and can be reattached later.
#[tauri::command]
fn detach(state: State<AppState>, conn: String, id: u64) {
    send(&state, &conn, ClientMsg::Detach { id });
}

/// Open a remote (or otherwise out-of-process) connection by spawning a program
/// that speaks the protocol over stdin/stdout. For SSH the frontend passes
/// program="ssh", args=["user@host", "aether-server --stdio"].
#[tauri::command]
async fn connect_remote(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    program: String,
    args: Vec<String>,
) -> Result<(), String> {
    let _ = app.emit("aether:conn-status", ConnStatus { id: id.clone(), status: "connecting".into(), message: None });

    let mut child = Command::new(&program)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn {program}: {e}"))?;

    let wr = child.stdin.take().ok_or("no stdin")?;
    let rd = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let conns = state.conns.clone();
    let rx = register_connection(&conns, &id);
    pump_connection(app.clone(), conns.clone(), id.clone(), rd, wr, rx);

    // Surface remote stderr (e.g. "aether-server: command not found").
    let app_e = app.clone();
    let id_e = id.clone();
    async_runtime::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut s = stderr;
        let mut buf = Vec::new();
        let _ = s.read_to_end(&mut buf).await;
        if !buf.is_empty() {
            let _ = app_e.emit("aether:conn-status", ConnStatus {
                id: id_e,
                status: "stderr".into(),
                message: Some(String::from_utf8_lossy(&buf).trim().to_string()),
            });
        }
    });

    // Watch for the connection dropping.
    let app_c = app.clone();
    let id_c = id.clone();
    let conns_c = conns.clone();
    async_runtime::spawn(async move {
        let status = child.wait().await;
        conns_c.lock().unwrap().remove(&id_c);
        let code = status.ok().and_then(|s| s.code());
        let _ = app_c.emit("aether:conn-status", ConnStatus {
            id: id_c,
            status: "closed".into(),
            message: code.map(|c| format!("exit {c}")),
        });
    });

    let _ = app.emit("aether:conn-status", ConnStatus { id, status: "connected".into(), message: None });
    Ok(())
}

// ---- connection plumbing ---------------------------------------------------

fn dispatch(app: &AppHandle, conn: &str, msg: ServerMsg) {
    let conn = conn.to_string();
    match msg {
        ServerMsg::Created(info) => {
            let _ = app.emit("aether:created", CreatedPayload { conn, id: info.id, title: info.title });
        }
        ServerMsg::Snapshot { id, data } => {
            let _ = app.emit("aether:snapshot", DataPayload { conn, id, data: b64(data) });
        }
        ServerMsg::Output { id, data } => {
            let _ = app.emit("aether:output", DataPayload { conn, id, data: b64(data) });
        }
        ServerMsg::Exited { id, code } => {
            let _ = app.emit("aether:exited", ExitedPayload { conn, id, code });
        }
        ServerMsg::Sessions(sessions) => {
            let _ = app.emit("aether:sessions", SessionsPayload { conn, sessions });
        }
        ServerMsg::Error { message } => {
            let _ = app.emit("aether:error", ErrorPayload { conn, message });
        }
    }
}

/// Register a connection's command channel *synchronously* so commands issued
/// before the transport is ready (e.g. the first session at boot) buffer rather
/// than getting dropped. Returns the receiver to hand to `pump_connection`.
fn register_connection(conns: &Conns, id: &str) -> UnboundedReceiver<ClientMsg> {
    let (tx, rx) = unbounded_channel::<ClientMsg>();
    conns.lock().unwrap().insert(id.to_string(), tx);
    rx
}

/// Pump a connection's streams once the transport is ready: drain queued
/// commands to the server, and dispatch server messages to the webview.
fn pump_connection<R, W>(app: AppHandle, conns: Conns, id: String, rd: R, wr: W, mut rx: UnboundedReceiver<ClientMsg>)
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    async_runtime::spawn(async move {
        let mut wr = wr;
        while let Some(msg) = rx.recv().await {
            if write_msg(&mut wr, &msg).await.is_err() {
                break;
            }
        }
    });

    async_runtime::spawn(async move {
        let mut rd = rd;
        loop {
            match read_msg::<_, ServerMsg>(&mut rd).await {
                Ok(msg) => dispatch(&app, &id, msg),
                Err(_) => break,
            }
        }
        conns.lock().unwrap().remove(&id);
    });
}

async fn connect_with_retry(path: std::path::PathBuf) -> std::io::Result<UnixStream> {
    for _ in 0..200 {
        match UnixStream::connect(&path).await {
            Ok(s) => return Ok(s),
            Err(_) => tokio::time::sleep(Duration::from_millis(25)).await,
        }
    }
    UnixStream::connect(&path).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Native macOS frosted-glass behind the translucent UI.
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                if let Some(win) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(
                        &win,
                        NSVisualEffectMaterial::HudWindow,
                        Some(NSVisualEffectState::Active),
                        None,
                    );
                }
            }

            let conns: Conns = Arc::new(Mutex::new(HashMap::new()));
            app.manage(AppState { conns: conns.clone() });

            let handle = app.handle().clone();
            let sock = std::env::temp_dir().join(format!("aether-{}.sock", std::process::id()));

            // Register the local connection synchronously so the first session
            // (created at boot) buffers until the socket is ready.
            let rx_local = register_connection(&conns, "local");

            // Embedded local server.
            let sock_srv = sock.clone();
            async_runtime::spawn(async move {
                if let Err(e) = aether_server::serve(&sock_srv).await {
                    eprintln!("aether-server (embedded) stopped: {e}");
                }
            });

            // Connect to the embedded server, then pump the local connection.
            let conns_local = conns.clone();
            async_runtime::spawn(async move {
                match connect_with_retry(sock).await {
                    Ok(stream) => {
                        let (rd, wr) = stream.into_split();
                        pump_connection(handle, conns_local, "local".into(), rd, wr, rx_local);
                    }
                    Err(e) => eprintln!("could not connect to embedded server: {e}"),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            attach,
            input,
            resize,
            close_session,
            list_sessions,
            detach,
            connect_remote
        ])
        .run(tauri::generate_context!())
        .expect("error while running AETHER");
}
