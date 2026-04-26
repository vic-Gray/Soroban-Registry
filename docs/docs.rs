use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    about = "Access offline tutorials and online documentation",
    long_about = "Provides access to the Soroban Registry documentation. You can read the built-in tutorial or open the official web documentation in your default browser.",
    after_help = "Examples:\n  soroban-registry docs tutorial\n  soroban-registry docs online"
)]
pub struct DocsArgs {
    #[command(subcommand)]
    pub cmd: DocsSubcommand,
}

#[derive(Subcommand, Debug)]
pub enum DocsSubcommand {
    /// Launch the official online documentation in your browser
    #[command(
        about = "Open the official online documentation in your browser",
        after_help = "Example:\n  soroban-registry docs online"
    )]
    Online,

    /// Read the built-in interactive tutorial
    #[command(
        about = "Read the built-in interactive tutorial for Soroban Registry",
        after_help = "Example:\n  soroban-registry docs tutorial"
    )]
    Tutorial,
}

pub fn execute(args: DocsArgs) -> Result<()> {
    match args.cmd {
        DocsSubcommand::Online => {
            let url = "https://github.com/ALIPHATICHYD/Soroban-Registry/tree/main/docs";
            println!("Opening documentation at: {}", url);
            
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("cmd").args(["/C", "start", url]).spawn();
            
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open").arg(url).spawn();
            
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open").arg(url).spawn();
        }
        DocsSubcommand::Tutorial => {
            println!("{}", TUTORIAL_TEXT);
        }
    }
    Ok(())
}

const TUTORIAL_TEXT: &str = r#"
=======================================================
           SOROBAN REGISTRY - QUICK TUTORIAL           
=======================================================

Welcome to the Soroban Registry CLI! 
This tool helps you publish, discover, and verify smart 
contracts on the Stellar network.

1. SEARCHING FOR CONTRACTS
   Find existing contracts by keyword:
   $ soroban-registry search "token"

2. SCAFFOLDING A NEW PROJECT
   Create a new contract project from a template:
   $ soroban-registry scaffold init my-contract

3. PUBLISHING YOUR CONTRACT
   Publish your compiled WASM to the registry:
   $ soroban-registry publish --contract-path ./my-contract

For more specific help on any command, use the help command:
   $ soroban-registry help publish
=======================================================
"#;