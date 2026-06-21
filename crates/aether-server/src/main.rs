//! Standalone Aether session server (daemon mode).
//!
//! Used for remote hosts: run this binary, point a client at its socket. The
//! macOS app embeds the same logic in-process for local sessions via the
//! library's [`aether_server::serve`].

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    aether_server::serve(aether_server::default_socket_path()).await
}
