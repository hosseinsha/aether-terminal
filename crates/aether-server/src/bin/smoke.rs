//! End-to-end smoke test for the session server.
//!
//!   cargo run --bin aether-smoke            # via the Unix socket (run server first)
//!   cargo run --bin aether-smoke -- --stdio # spawns `aether-server --stdio` and pipes to it
//!
//! Either way it creates a session, attaches, types a command into the real
//! shell, and prints what comes back. Expect to see `hello-from-aether`.

use std::process::Stdio;
use std::time::Duration;

use aether_proto::{read_msg, write_msg, ClientMsg, ServerMsg};
use anyhow::Result;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::UnixStream;
use tokio::process::Command;

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args().any(|a| a == "--stdio") {
        let exe = std::env::current_exe()?
            .parent()
            .unwrap()
            .join("aether-server");
        let mut child = Command::new(exe)
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()?;
        let wr = child.stdin.take().unwrap();
        let rd = child.stdout.take().unwrap();
        drive(rd, wr).await
    } else {
        let path = std::env::temp_dir().join("aether-server.sock");
        let stream = UnixStream::connect(&path).await?;
        let (rd, wr) = stream.into_split();
        drive(rd, wr).await
    }
}

async fn drive<R, W>(mut rd: R, mut wr: W) -> Result<()>
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    write_msg(&mut wr, &ClientMsg::CreateSession { cols: 80, rows: 24, shell: None }).await?;

    let id = loop {
        match read_msg::<_, ServerMsg>(&mut rd).await? {
            ServerMsg::Created(info) => {
                println!("[created session {} ({})]", info.id, info.title);
                break info.id;
            }
            ServerMsg::Error { message } => anyhow::bail!("server error: {message}"),
            _ => {}
        }
    };

    write_msg(&mut wr, &ClientMsg::Attach { id }).await?;

    let typer = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        let _ = write_msg(&mut wr, &ClientMsg::Input { id, data: b"echo hello-from-aether\r".to_vec() }).await;
        tokio::time::sleep(Duration::from_millis(700)).await;
        let _ = write_msg(&mut wr, &ClientMsg::Input { id, data: b"exit\r".to_vec() }).await;
    });

    let reader = async {
        loop {
            match read_msg::<_, ServerMsg>(&mut rd).await {
                Ok(ServerMsg::Snapshot { data, .. }) | Ok(ServerMsg::Output { data, .. }) => {
                    print!("{}", String::from_utf8_lossy(&data));
                    use std::io::Write;
                    let _ = std::io::stdout().flush();
                }
                Ok(ServerMsg::Exited { code, .. }) => {
                    println!("\n[session exited: {code:?}]");
                    break;
                }
                Ok(other) => println!("[msg: {other:?}]"),
                Err(_) => break,
            }
        }
    };

    tokio::select! {
        _ = reader => {}
        _ = tokio::time::sleep(Duration::from_secs(6)) => println!("\n[timeout]"),
    }
    let _ = typer.await;
    Ok(())
}
