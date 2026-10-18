use chrono::{SecondsFormat, Utc};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::Command,
};
use url::Url;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
const VERSION: u32 = 2;
const COMPONENT_ENCODING: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.');

#[derive(Debug)]
pub struct PrepareOptions {
    pub url: String,
    pub no_confirm: bool,
    pub refresh: bool,
    pub tool_root: PathBuf,
}

#[derive(Debug, PartialEq)]
pub struct Target {
    pub owner: String,
    pub repo: String,
    pub tail: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SkillState {
    pub status: String,
    pub report: String,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub source_signature: String,
    #[serde(default)]
    pub index_hash: String,
    #[serde(default)]
    pub report_hash: String,
    pub analyzed_commit: Option<String>,
    pub analyzed_at: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct State {
    pub version: u32,
    pub active_plan: String,
    pub skills: BTreeMap<String, SkillState>,
    pub inventory: Vec<String>,
    pub removed: Vec<String>,
    pub repository: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Entry {
    pub skill: String,
    pub report: PathBuf,
    pub status: String,
    pub selected: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Plan {
    pub version: u32,
    pub id: String,
    pub created_at: String,
    pub url: String,
    pub owner: String,
    pub repo: String,
    pub commit: String,
    pub scope: String,
    pub target: String,
    pub cache: PathBuf,
    pub destination: PathBuf,
    pub state_file: PathBuf,
    pub plan_file: PathBuf,
    pub github_index: PathBuf,
    pub index_status: String,
    pub index_hash: String,
    pub approved: bool,
    pub confirmation: String,
    pub files: BTreeMap<String, String>,
    pub skills: Vec<Entry>,
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn digest<T: Serialize>(value: &T) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("serializable input"))
    )
}

fn output(command: &mut Command) -> Result<Vec<u8>> {
    let program = command.get_program().to_string_lossy().to_string();
    let result = command
        .output()
        .map_err(|e| format!("{program}を起動できません: {e}"))?;
    if !result.status.success() {
        return Err(format!(
            "{program}の実行に失敗: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        )
        .into());
    }
    Ok(result.stdout)
}

fn git(cache: &Path, args: &[&str]) -> Result<String> {
    let bytes = output(
        Command::new("git")
            .args(["-c", "core.hooksPath=/dev/null", "--git-dir"])
            .arg(cache)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0"),
    )?;
    Ok(String::from_utf8(bytes)?)
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let parent = path.parent().ok_or("保存先に親フォルダがありません")?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut temporary, value)?;
    temporary.write_all(b"\n")?;
    temporary.as_file().sync_all()?;
    temporary.persist(path)?;
    Ok(())
}

// Check existing ancestors too, so a symlink cannot redirect output outside root.
pub fn inside(root: &Path, relative: &str) -> Result<PathBuf> {
    let mut path = root.to_path_buf();
    if relative.is_empty() {
        return Ok(path);
    }
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(name) => path.push(name),
            _ => return Err(format!("不正な保存先です: {relative}").into()),
        }
        if fs::symlink_metadata(&path).is_ok() {
            path = path.canonicalize()?;
            if !path.starts_with(root) {
                return Err(format!("保存先の範囲外です: {relative}").into());
            }
        }
    }
    Ok(path)
}

pub fn parse_url(input: &str) -> Result<Target> {
    let url = Url::parse(input)?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("https://github.com/OWNER/REPO 形式のURLを指定してください".into());
    }
    // Validate before URL normalization, which otherwise removes dot segments.
    let raw_path = input
        .split_once("://")
        .ok_or("URLが不正です")?
        .1
        .split_once('/')
        .map(|(_, path)| path)
        .unwrap_or("")
        .split(['?', '#'])
        .next()
        .unwrap_or("");
    let decoded = percent_decode_str(raw_path).decode_utf8()?;
    let mut parts: Vec<String> = decoded
        .trim_matches('/')
        .split('/')
        .map(String::from)
        .collect();
    if parts.len() < 2
        || parts.iter().any(|p| {
            p.is_empty()
                || p == "."
                || p == ".."
                || p.chars().any(char::is_control)
                || p.contains('\\')
        })
    {
        return Err("URLのパスが不正です".into());
    }
    let owner = parts.remove(0).to_lowercase();
    let repo_name = parts.remove(0);
    let repo = repo_name
        .strip_suffix(".git")
        .unwrap_or(&repo_name)
        .to_lowercase();
    if !owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        || repo.is_empty()
        || repo == "."
        || repo == ".."
        || !repo
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
    {
        return Err("所有者名またはリポジトリ名が不正です".into());
    }
    if !parts.is_empty() && (parts.len() < 2 || !["tree", "blob"].contains(&parts[0].as_str())) {
        return Err("リポジトリ、tree、blobのURLに対応しています".into());
    }
    Ok(Target {
        owner,
        repo,
        tail: parts,
    })
}

fn acquire(target: &Target, root: &Path) -> Result<(PathBuf, String)> {
    let cache = inside(
        root,
        &format!(".cache/repos/{}/{}.git", target.owner, target.repo),
    )?;
    let remote = format!("https://github.com/{}/{}.git", target.owner, target.repo);
    if !cache.exists() {
        fs::create_dir_all(cache.parent().ok_or("キャッシュの保存先が不正です")?)?;
        output(
            Command::new("git")
                .args([
                    "-c",
                    "core.hooksPath=/dev/null",
                    "clone",
                    "--bare",
                    "--",
                    &remote,
                ])
                .arg(&cache)
                .env("GIT_TERMINAL_PROMPT", "0"),
        )?;
    } else {
        git(
            &cache,
            &[
                "fetch",
                "--prune",
                &remote,
                "+refs/heads/*:refs/heads/*",
                "+refs/tags/*:refs/tags/*",
            ],
        )?;
    }
    let refs = String::from_utf8(output(
        Command::new("git")
            .args(["ls-remote", "--symref", &remote, "HEAD"])
            .env("GIT_TERMINAL_PROMPT", "0"),
    )?)?;
    let default_ref = refs
        .lines()
        .find_map(|line| line.strip_prefix("ref: ")?.strip_suffix("\tHEAD"))
        .ok_or("デフォルトブランチを取得できません。空のリポジトリか確認してください")?;
    Ok((cache, default_ref.to_owned()))
}

pub fn resolve_target(
    cache: &Path,
    default_ref: &str,
    tail: &[String],
) -> Result<(String, String, String)> {
    if tail.is_empty() {
        let commit = git(
            cache,
            &[
                "rev-parse",
                "--verify",
                &format!("{default_ref}^{{commit}}"),
            ],
        )?;
        return Ok((commit.trim().into(), String::new(), "repository".into()));
    }
    let segments = &tail[1..];
    // Prefer the longest branch or tag, supporting refs with slashes.
    for size in (1..=segments.len()).rev() {
        let reference = segments[..size].join("/");
        let mut candidates = vec![
            format!("refs/heads/{reference}"),
            format!("refs/tags/{reference}"),
        ];
        if (7..=40).contains(&reference.len()) && reference.chars().all(|c| c.is_ascii_hexdigit()) {
            candidates.push(reference);
        }
        for candidate in candidates {
            if let Ok(commit) = git(
                cache,
                &["rev-parse", "--verify", &format!("{candidate}^{{commit}}")],
            ) {
                return Ok((
                    commit.trim().into(),
                    segments[size..].join("/"),
                    tail[0].clone(),
                ));
            }
        }
    }
    Err("URLのブランチ・タグ・コミットを解決できません".into())
}

fn file_inventory(cache: &Path, commit: &str) -> Result<BTreeMap<String, String>> {
    let raw = git(cache, &["ls-tree", "-rz", "--full-tree", commit])?;
    let mut files = BTreeMap::new();
    for entry in raw.split('\0').filter(|s| !s.is_empty()) {
        let (meta, path) = entry
            .split_once('\t')
            .ok_or("Gitのファイル一覧が不正です")?;
        let values: Vec<_> = meta.split_whitespace().collect();
        if values.len() == 3 && ["100644", "100755"].contains(&values[0]) && values[1] == "blob" {
            files.insert(path.to_owned(), values[2].to_owned());
        }
    }
    Ok(files)
}

fn is_skill(path: &str) -> bool {
    path == "SKILL.md" || path.ends_with("/SKILL.md")
}

pub fn discover(
    files: &BTreeMap<String, String>,
    target: &str,
    kind: &str,
) -> Result<(Vec<String>, Vec<String>, String)> {
    let skills: Vec<_> = files
        .keys()
        .filter(|path| is_skill(path))
        .cloned()
        .collect();
    if kind == "repository" || (kind == "tree" && target.is_empty()) {
        return Ok((skills.clone(), skills, "repository".into()));
    }
    if kind == "blob" && !skills.iter().any(|s| s == target) {
        return Err("blobのURLはSKILL.mdを指定してください".into());
    }
    let candidate = if is_skill(target) {
        target.to_owned()
    } else {
        format!("{target}/SKILL.md")
    };
    if skills.contains(&candidate) {
        return Ok((skills, vec![candidate], "skill".into()));
    }
    if kind == "tree" {
        let selected: Vec<_> = skills
            .iter()
            .filter(|s| s.starts_with(&format!("{target}/")))
            .cloned()
            .collect();
        if !selected.is_empty() {
            return Ok((skills, selected, "subtree".into()));
        }
    }
    Err("指定パスに通常ファイルのSKILL.mdがありません".into())
}

fn folder(skill: &str) -> &str {
    skill
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or(".")
}

pub fn report_paths(skills: &[String]) -> BTreeMap<String, String> {
    let mut mapping = BTreeMap::new();
    for skill in skills {
        let mut parent = folder(skill);
        for prefix in [
            ".agents/skills/",
            ".claude/skills/",
            ".codex/skills/",
            "skills/",
        ] {
            if let Some(rest) = parent.strip_prefix(prefix) {
                parent = rest;
                break;
            }
        }
        let name = if parent == "." {
            "root".into()
        } else {
            parent
                .split('/')
                .map(|segment| utf8_percent_encode(segment, COMPONENT_ENCODING).to_string())
                .collect::<Vec<_>>()
                .join("/")
        };
        mapping.insert(skill.clone(), format!("skill-analyses/{name}.md"));
    }
    let mut counts = BTreeMap::new();
    for path in mapping.values() {
        *counts.entry(path.clone()).or_insert(0) += 1;
    }
    for (skill, path) in &mut mapping {
        if counts[path] > 1 {
            *path = format!(
                "{}--{}.md",
                path.trim_end_matches(".md"),
                &digest(skill)[..12]
            );
        }
    }
    mapping
}

fn fetch_index(target: &Target) -> Value {
    let result = (|| -> Result<Value> {
        let endpoint = format!(
            "repos/{}/{}/issues?state=all&per_page=100",
            target.owner, target.repo
        );
        let raw = output(Command::new("gh").args([
            "api",
            "--hostname",
            "github.com",
            "--paginate",
            "--slurp",
            &endpoint,
        ]))?;
        let pages: Vec<Vec<Value>> = serde_json::from_slice(&raw)?;
        let mut items: Vec<Value> = pages
            .into_iter()
            .flatten()
            .map(|item| {
                let mut slim = serde_json::Map::new();
                for key in [
                    "number",
                    "title",
                    "updated_at",
                    "comments",
                    "html_url",
                    "pull_request",
                ] {
                    slim.insert(key.into(), item[key].clone());
                }
                Value::Object(slim)
            })
            .collect();
        items.sort_by_key(|item| item["number"].as_u64().unwrap_or(0));
        Ok(json!({"status": "available", "items": items}))
    })();
    result.unwrap_or_else(
        |error| json!({"status": "unavailable", "items": [], "error": error.to_string()}),
    )
}

fn belongs(path: &str, parent: &str) -> bool {
    parent == "." || path.starts_with(&format!("{parent}/"))
}

fn source_signature(
    cache: &Path,
    commit: &str,
    files: &BTreeMap<String, String>,
    skill: &str,
    all_skills: &[String],
    dependencies: &[String],
) -> Result<String> {
    let parent = folder(skill);
    let roots: Vec<_> = all_skills
        .iter()
        .map(|s| folder(s))
        .filter(|p| *p != ".")
        .collect();
    let shared: BTreeSet<_> = files
        .keys()
        .filter(|p| !roots.iter().any(|r| belongs(p, r)))
        .cloned()
        .collect();
    let selected: BTreeMap<_, _> = files
        .iter()
        .filter(|(path, _)| {
            belongs(path, parent) || shared.contains(path.as_str()) || dependencies.contains(path)
        })
        .collect();
    let mut paths: BTreeSet<String> = shared
        .into_iter()
        .chain(dependencies.iter().cloned())
        .collect();
    paths.insert(parent.to_owned());
    let mut args = vec!["log", commit, "--format=%H", "--"];
    args.extend(paths.iter().map(String::as_str));
    let history = git(cache, &args)?;
    Ok(digest(&json!({"files": selected, "history": history})))
}

pub fn prepare(options: &PrepareOptions) -> Result<Value> {
    let target = parse_url(&options.url)?;
    fs::create_dir_all(&options.tool_root)?;
    let root = options.tool_root.canonicalize()?;
    let (cache, default_ref) = acquire(&target, &root)?;
    prepare_snapshot(
        options,
        &target,
        &root,
        &cache,
        &default_ref,
        fetch_index(&target),
    )
}

// Separate transport from planning so offline tests exercise real Git history and state transitions.
pub fn prepare_snapshot(
    options: &PrepareOptions,
    target: &Target,
    root: &Path,
    cache: &Path,
    default_ref: &str,
    index: Value,
) -> Result<Value> {
    let (commit, path, kind) = resolve_target(cache, default_ref, &target.tail)?;
    let files = file_inventory(cache, &commit)?;
    let (all_skills, selected, scope) = discover(&files, &path, &kind)?;
    if selected.is_empty() {
        return Err("通常ファイルのSKILL.mdが見つかりませんでした".into());
    }
    let destination = inside(root, &format!("reports/{}/{}", target.owner, target.repo))?;
    let state_file = inside(&destination, ".state.json")?;
    let mut state: State = if state_file.exists() {
        read_json(&state_file)?
    } else {
        State::default()
    };
    if state.version != 0 && state.version != VERSION {
        return Err("状態ファイルのバージョンが異なります".into());
    }
    let index_hash = digest(&json!({"status": index["status"], "items": index["items"]}));
    let mappings = report_paths(&all_skills);
    let mut entries = vec![];
    for skill in &all_skills {
        let old = state.skills.entry(skill.clone()).or_default();
        let report = &mappings[skill];
        let signature = source_signature(
            cache,
            &commit,
            &files,
            skill,
            &all_skills,
            &old.dependencies,
        )?;
        let report_path = inside(&destination, report)?;
        let unchanged = !options.refresh
            && old.status == "done"
            && old.source_signature == signature
            && old.index_hash == index_hash
            && index["status"] == "available"
            && old.report == *report
            && fs::read_to_string(&report_path).is_ok_and(|text| digest(&text) == old.report_hash);
        old.status = if unchanged { "done" } else { "pending" }.into();
        old.report = report.clone();
        entries.push(Entry {
            skill: skill.clone(),
            report: report_path,
            status: old.status.clone(),
            selected: selected.contains(skill),
        });
    }
    let plan_dir_root = inside(root, ".cache/plans")?;
    fs::create_dir_all(&plan_dir_root)?;
    let plan_dir = tempfile::Builder::new()
        .prefix("run-")
        .tempdir_in(&plan_dir_root)?
        .keep();
    let id = plan_dir
        .file_name()
        .ok_or("PLANのパスが不正です")?
        .to_string_lossy()
        .into_owned();
    let plan_file = plan_dir.join("plan.json");
    let index_file = plan_dir.join("github-index.json");
    let plan = Plan {
        version: VERSION,
        id: id.clone(),
        created_at: timestamp(),
        url: options.url.clone(),
        owner: target.owner.clone(),
        repo: target.repo.clone(),
        commit: commit.clone(),
        scope: scope.clone(),
        target: path,
        cache: cache.to_path_buf(),
        destination: destination.clone(),
        state_file: state_file.clone(),
        plan_file: plan_file.clone(),
        github_index: index_file.clone(),
        index_status: index["status"].as_str().unwrap_or("unavailable").into(),
        index_hash,
        approved: options.no_confirm,
        confirmation: if options.no_confirm {
            "skipped-by-user"
        } else {
            "required"
        }
        .into(),
        files,
        skills: entries,
    };
    state.version = VERSION;
    state.active_plan = id;
    state.inventory = all_skills;
    state.removed = state
        .skills
        .keys()
        .filter(|s| !state.inventory.contains(s))
        .cloned()
        .collect();
    write_json(&index_file, &index)?;
    write_json(&plan_file, &plan)?;
    write_json(&state_file, &state)?;
    Ok(
        json!({"plan_file": plan_file, "commit": commit, "scope": scope, "total_skills": state.inventory.len(),
        "selected_skills": selected.len(), "pending": plan.skills.iter().filter(|e| e.selected && e.status == "pending").map(|e| &e.skill).collect::<Vec<_>>(),
        "approved": plan.approved, "index_status": plan.index_status, "warning": index["error"], "destination": destination}),
    )
}

fn load_active(path: &Path) -> Result<(Plan, State)> {
    let plan: Plan = read_json(path)?;
    let state: State = read_json(&plan.state_file)?;
    if plan.version != VERSION || state.version != VERSION {
        return Err("PLANまたは状態ファイルのバージョンが異なります".into());
    }
    if state.active_plan != plan.id {
        return Err("古いPLANです。同じリポジトリの最新PLANを使ってください".into());
    }
    Ok((plan, state))
}

pub fn approve(path: &Path) -> Result<Value> {
    let (mut plan, _) = load_active(path)?;
    plan.approved = true;
    plan.confirmation = "user-approved".into();
    write_json(path, &plan)?;
    Ok(json!({"approved": true, "plan_file": path}))
}

fn ensure_report(path: &Path) -> Result<String> {
    let text = fs::read_to_string(path)
        .map_err(|_| format!("分析ファイルを先に保存してください: {}", path.display()))?;
    if text.trim().is_empty() {
        return Err(format!("分析ファイルが空です: {}", path.display()).into());
    }
    Ok(text)
}

pub fn complete(
    path: &Path,
    skill: Option<&str>,
    repository: bool,
    dependencies: &[String],
) -> Result<Value> {
    let (plan, mut state) = load_active(path)?;
    if !plan.approved {
        return Err("分析方針が未承認です。ユーザーのOK後にapproveを実行してください".into());
    }
    let report = if repository {
        if plan
            .skills
            .iter()
            .any(|e| e.selected && state.skills[&e.skill].status != "done")
        {
            return Err("個別分析が未完了です".into());
        }
        let report = inside(&plan.destination, "repository-analysis.md")?;
        let text = ensure_report(&report)?;
        state.repository = Some(
            json!({"commit": plan.commit, "analyzed_at": timestamp(), "scope": plan.scope,
            "skills": plan.skills.iter().filter(|e| e.selected).map(|e| &e.skill).collect::<Vec<_>>(), "report_hash": digest(&text)}),
        );
        report
    } else {
        let skill = skill.ok_or("--skillか--repositoryを指定してください")?;
        if !plan.skills.iter().any(|e| e.skill == skill && e.selected) {
            return Err("このPLANの分析対象ではないスキルです".into());
        }
        let dependencies: Vec<String> = dependencies
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        if dependencies.iter().any(|p| !plan.files.contains_key(p)) {
            return Err("コミットに存在しない依存ファイルです".into());
        }
        let current = state
            .skills
            .get_mut(skill)
            .ok_or("状態ファイルに対象スキルがありません")?;
        let report = inside(&plan.destination, &current.report)?;
        let text = ensure_report(&report)?;
        current.source_signature = source_signature(
            &plan.cache,
            &plan.commit,
            &plan.files,
            skill,
            &state.inventory,
            &dependencies,
        )?;
        current.status = "done".into();
        current.analyzed_commit = Some(plan.commit.clone());
        current.analyzed_at = Some(timestamp());
        current.index_hash = plan.index_hash.clone();
        current.dependencies = dependencies;
        current.report_hash = digest(&text);
        report
    };
    write_json(&plan.state_file, &state)?;
    Ok(
        json!({"saved": report, "done": plan.skills.iter().filter(|e| e.selected && state.skills[&e.skill].status == "done").count(),
        "total": plan.skills.iter().filter(|e| e.selected).count()}),
    )
}
