use zhezhi_runtime::{backend, process_tree, runtime_root, server_config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if std::env::args().any(|arg|arg=="--design-worker") {return backend::design::run_stdio();}
    std::fs::create_dir_all(runtime_root())?;
    process_tree::constrain_process_tree().map_err(std::io::Error::other)?;
    let mut server = backend::start(server_config(false)).await?;
    println!("ZHEZHI_RUST_READY {}", server.address);
    tokio::signal::ctrl_c().await?;
    server.shutdown().await;
    Ok(())
}
