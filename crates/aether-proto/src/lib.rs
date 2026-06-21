//! Aether wire protocol.
//!
//! Deliberately transport-agnostic: the same [`ClientMsg`]/[`ServerMsg`] pair is
//! framed over *any* async byte stream. Locally that stream is a Unix socket;
//! a remote host is the identical protocol over TCP+TLS or an SSH tunnel. That
//! is the whole point of the client/server split — "remote" is just a different
//! socket, not a different codebase.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Server-assigned identifier for a persistent session (one PTY + its grid).
pub type SessionId = u64;

/// Lightweight description of a session, safe to list without attaching.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: SessionId,
    pub title: String,
    pub cols: u16,
    pub rows: u16,
    pub alive: bool,
}

/// Messages sent from a client (the app) to the server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClientMsg {
    /// Ask for every live session (used on connect / reattach).
    ListSessions,
    /// Spawn a new PTY-backed session.
    CreateSession {
        cols: u16,
        rows: u16,
        shell: Option<String>,
    },
    /// Begin receiving output for a session. The server replies with a
    /// [`ServerMsg::Snapshot`] (current screen) then live [`ServerMsg::Output`].
    Attach { id: SessionId },
    /// Stop receiving output for a session (the session keeps running).
    Detach { id: SessionId },
    /// Forward keystrokes / bytes to a session's PTY.
    Input { id: SessionId, data: Vec<u8> },
    /// Resize a session's PTY and grid.
    Resize { id: SessionId, cols: u16, rows: u16 },
    /// Terminate a session and its process.
    CloseSession { id: SessionId },
}

/// Messages sent from the server to a client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerMsg {
    /// Reply to [`ClientMsg::ListSessions`].
    Sessions(Vec<SessionInfo>),
    /// Reply to [`ClientMsg::CreateSession`].
    Created(SessionInfo),
    /// Full current screen state, sent immediately on attach so a (re)connecting
    /// client is brought up to date. `data` is a stream of escape sequences that
    /// reproduce the screen when written to a terminal/`xterm.js`.
    Snapshot { id: SessionId, data: Vec<u8> },
    /// Live PTY output for an attached session.
    Output { id: SessionId, data: Vec<u8> },
    /// The session's process exited.
    Exited { id: SessionId, code: Option<i32> },
    /// A request could not be satisfied.
    Error { message: String },
}

/// Write a length-prefixed, bincode-framed message to an async writer.
pub async fn write_msg<W, T>(w: &mut W, msg: &T) -> std::io::Result<()>
where
    W: AsyncWriteExt + Unpin,
    T: Serialize,
{
    let buf = bincode::serialize(msg)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    w.write_u32(buf.len() as u32).await?;
    w.write_all(&buf).await?;
    w.flush().await?;
    Ok(())
}

/// Read a single length-prefixed, bincode-framed message from an async reader.
pub async fn read_msg<R, T>(r: &mut R) -> std::io::Result<T>
where
    R: AsyncReadExt + Unpin,
    T: DeserializeOwned,
{
    let len = r.read_u32().await? as usize;
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    bincode::deserialize(&buf).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}
