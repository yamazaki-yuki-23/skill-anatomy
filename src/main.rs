use clap::{Parser, Subcommand};
use skill_anatomy::{PrepareOptions, approve, complete, prepare};
use std::path::PathBuf;

#[derive(Parser)]
#[command(version, about = "GitHubスキルの分析準備・差分検出・完了記録")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// URL判別・索引取得・差分と再開位置の計算
    Prepare {
        url: String,
        /// 今回の分析方針の確認を省略する
        #[arg(long)]
        no_confirm: bool,
        /// 索引で検知できない変更も含めて再調査する
        #[arg(long)]
        refresh: bool,
        /// ツールの保存先。既定はこのバイナリをビルドしたリポジトリ
        #[arg(long, default_value = env!("CARGO_MANIFEST_DIR"))]
        tool_root: PathBuf,
    },
    /// ユーザーが分析方針にOKした後にだけ実行する
    Approve { plan: PathBuf },
    /// 分析ファイルを保存した後に完了状態を記録する
    Complete {
        plan: PathBuf,
        /// 元のSKILL.mdのパス
        #[arg(
            long,
            required_unless_present = "repository",
            conflicts_with = "repository"
        )]
        skill: Option<String>,
        #[arg(long)]
        repository: bool,
        /// 読んだ共有ファイル。複数指定可
        #[arg(long, requires = "skill")]
        dependency: Vec<String>,
    },
}

fn main() {
    let result = match Cli::parse().command {
        Commands::Prepare {
            url,
            no_confirm,
            refresh,
            tool_root,
        } => prepare(&PrepareOptions {
            url,
            no_confirm,
            refresh,
            tool_root,
        }),
        Commands::Approve { plan } => approve(&plan),
        Commands::Complete {
            plan,
            skill,
            repository,
            dependency,
        } => complete(&plan, skill.as_deref(), repository, &dependency),
    };
    match result {
        Ok(value) => println!(
            "{}",
            serde_json::to_string_pretty(&value).expect("JSON output")
        ),
        Err(error) => {
            eprintln!("エラー: {error}");
            std::process::exit(1);
        }
    }
}
