//! End-to-end smoke test for the session server.
//!
//! Connects over the Unix socket, creates a session, attaches, types a command
//! into the real shell, and prints whatever the PTY sends back. Proves the full
//! pipe (socket -> PTY -> grid mirror -> broadcast -> client) works without
//! needing the GUI yet.
//!
//! Run the server first (`cargo run --bin aether-server`), then this in another
//! terminal (`cargo run --bin aether-smoke`). Expect to see `hello-from-aether`.

use std::time::Duration;

use aether_proto::{read_msg, write_msg, ClientMsg, ServerMsg};
use anyhow::Result;
use tokio::net::UnixStream;

#[tokio::main]
async fn main() -> Result<()> {
    let path = std::env::temp_dir().join("aether-server.sock");
    let stream = UnixStream::connect(&path).await?;
    let (mut rd, mut wr) = stream.into_split();

    write_msg(
        &mut wr,
        &ClientMsg::CreateSession { cols: 80, rows: 24, shell: None },
    )
    .await?;

    // Wait for the session id.
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

    // Drive the shell, then exit it.
    let typer = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        let _ = write_msg(
            &mut wr,
            &ClientMsg::Input { id, data: b"echo hello-from-aether\r".to_vec() },
        )
        .await;
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
