//! AETHER macOS app backend.
//!
//! Single-binary, single-app experience:
//!   * **Local** (default) — on launch we spawn the session server *in-process*
//!     on a per-process Unix socket and connect to it as a client. Zero setup;
//!     when the app quits the process (and its sessions) end.
//!   * **Remote** (later) — the exact same client connects to a remote server's
//!     socket instead. Only the endpoint changes.
//!
//! The Rust side is a thin bridge: it forwards Tauri commands to the server as
//! `ClientMsg`, and re-emits `ServerMsg` to the webview as Tauri events.

use std::time::Duration;

use aether_proto::{read_msg, write_msg, ClientMsg, ServerMsg};
use serde::Serialize;
use tauri::{async_runtime, AppHandle, Emitter, Manager, State};
use tokio::net::UnixStream;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

/// Shared state: a channel that funnels client messages to the connection task.
struct AppState {
    tx: UnboundedSender<ClientMsg>,
}

#[derive(Clone, Serialize)]
struct DataPayload {
    id: u64,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct ExitedPayload {
    id: u64,
    code: Option<i32>,
}

#[derive(Clone, Serialize)]
struct ErrorPayload {
    message: String,
}

// ---- Tauri commands (frontend -> server) -----------------------------------

#[tauri::command]
fn create_session(state: State<AppState>, cols: u16, rows: u16) {
    let _ = state.tx.send(ClientMsg::CreateSession { cols, rows, shell: None });
}

#[tauri::command]
fn attach(state: State<AppState>, id: u64) {
    let _ = state.tx.send(ClientMsg::Attach { id });
}

#[tauri::command]
fn input(state: State<AppState>, id: u64, data: Vec<u8>) {
    let _ = state.tx.send(ClientMsg::Input { id, data });
}

#[tauri::command]
fn resize(state: State<AppState>, id: u64, cols: u16, rows: u16) {
    let _ = state.tx.send(ClientMsg::Resize { id, cols, rows });
}

#[tauri::command]
fn close_session(state: State<AppState>, id: u64) {
    let _ = state.tx.send(ClientMsg::CloseSession { id });
}

// ---- Server -> webview -----------------------------------------------------

fn dispatch(app: &AppHandle, msg: ServerMsg) {
    match msg {
        ServerMsg::Created(info) => {
            let _ = app.emit("aether:created", info);
        }
        ServerMsg::Snapshot { id, data } => {
            let _ = app.emit("aether:snapshot", DataPayload { id, data });
        }
        ServerMsg::Output { id, data } => {
            let _ = app.emit("aether:output", DataPayload { id, data });
        }
        ServerMsg::Exited { id, code } => {
            let _ = app.emit("aether:exited", ExitedPayload { id, code });
        }
        ServerMsg::Sessions(list) => {
            let _ = app.emit("aether:sessions", list);
        }
        ServerMsg::Error { message } => {
            let _ = app.emit("aether:error", ErrorPayload { message });
        }
    }
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
            let handle = app.handle().clone();

            // Per-process socket so multiple app instances don't collide.
            let sock = std::env::temp_dir().join(format!("aether-{}.sock", std::process::id()));

            // 1) Embedded local server.
            let sock_srv = sock.clone();
            async_runtime::spawn(async move {
                if let Err(e) = aether_server::serve(&sock_srv).await {
                    eprintln!("aether-server (embedded) stopped: {e}");
                }
            });

            // 2) Client connection: commands in, events out.
            let (tx, mut rx) = unbounded_channel::<ClientMsg>();
            app.manage(AppState { tx });

            async_runtime::spawn(async move {
                let stream = match connect_with_retry(sock).await {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("could not connect to embedded server: {e}");
                        return;
                    }
                };
                let (mut rd, mut wr) = stream.into_split();

                // Writer: drain command channel to the server.
                async_runtime::spawn(async move {
                    while let Some(msg) = rx.recv().await {
                        if write_msg(&mut wr, &msg).await.is_err() {
                            break;
                        }
                    }
                });

                // Reader: server messages -> webview events.
                loop {
                    match read_msg::<_, ServerMsg>(&mut rd).await {
                        Ok(msg) => dispatch(&handle, msg),
                        Err(_) => break,
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            attach,
            input,
            resize,
            close_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running AETHER");
}
