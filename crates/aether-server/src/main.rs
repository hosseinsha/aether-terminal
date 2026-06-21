//! Standalone Aether session server.
//!
//! Two modes:
//!   * default — listen on a Unix socket (a local daemon).
//!   * `--stdio` — serve one connection over stdin/stdout, for remote use over
//!     `ssh host aether-server --stdio`.
//!
//! The macOS app embeds the same logic in-process for local sessions via the
//! library's [`aether_server::serve`].

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args().any(|a| a == "--stdio") {
        aether_server::serve_stdio().await
    } else {
        aether_server::serve(aether_server::default_socket_path()).await
    }
}
