use serde_json::{Value, json};
use skill_anatomy::{
    Plan, PrepareOptions, State, approve, complete, discover, inside, parse_url, prepare_snapshot,
    report_paths,
};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

struct Fixture {
    _temp: tempfile::TempDir,
    source: PathBuf,
    root: PathBuf,
    index: Value,
}

impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().canonicalize().unwrap();
        let source = base.join("source");
        let root = base.join("tool");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&root).unwrap();
        let fixture = Self {
            _temp: temp,
            source,
            root,
            index: json!({"status": "available", "items": []}),
        };
        fixture.git(&["init", "-b", "main"]);
        fixture.git(&["config", "user.email", "fixture@example.invalid"]);
        fixture.git(&["config", "user.name", "Fixture"]);
        fixture.write("README.md", "# Fixture\n");
        for name in ["review", "testing", "writing"] {
            fixture.write(
                &format!("skills/{name}/SKILL.md"),
                &format!("---\nname: {name}\ndescription: fixture\n---\n# {name}\n"),
            );
        }
        fixture.write("skills/testing/references/shared.md", "First version\n");
        fixture.commit("Initial skills");
        fixture
    }

    fn git(&self, args: &[&str]) -> String {
        let output = Command::new("git")
            .arg("-C")
            .arg(&self.source)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap().trim().into()
    }

    fn write(&self, path: &str, text: &str) {
        let path = self.source.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    fn commit(&self, message: &str) {
        self.git(&["add", "."]);
        self.git(&["commit", "-m", message]);
    }

    fn prepare(&self, suffix: &str, no_confirm: bool, refresh: bool) -> (PathBuf, Plan, Value) {
        let options = PrepareOptions {
            url: format!("https://github.com/Alice/Agent-Skills{suffix}"),
            no_confirm,
            refresh,
            tool_root: self.root.clone(),
        };
        let target = parse_url(&options.url).unwrap();
        let value = prepare_snapshot(
            &options,
            &target,
            &self.root,
            &self.source.join(".git"),
            "refs/heads/main",
            self.index.clone(),
        )
        .unwrap();
        let path = PathBuf::from(value["plan_file"].as_str().unwrap());
        let plan = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        (path, plan, value)
    }

    fn finish(
        &self,
        path: &Path,
        plan: &Plan,
        skill: &str,
        deps: &[&str],
    ) -> skill_anatomy::Result<Value> {
        let entry = plan.skills.iter().find(|e| e.skill == skill).unwrap();
        fs::create_dir_all(entry.report.parent().unwrap()).unwrap();
        fs::write(&entry.report, "# テスト用分析\nソースに基づく説明。\n").unwrap();
        complete(
            path,
            Some(skill),
            false,
            &deps.iter().map(|d| d.to_string()).collect::<Vec<_>>(),
        )
    }

    fn finish_all(&self) -> (PathBuf, Plan) {
        let (path, plan, _) = self.prepare("", true, false);
        for entry in &plan.skills {
            self.finish(&path, &plan, &entry.skill, &[]).unwrap();
        }
        (path, plan)
    }
}

#[test]
fn confirmation_gate_and_missing_report() {
    let f = Fixture::new();
    let (path, plan, result) = f.prepare("", false, false);
    assert_eq!(result["approved"], false);
    assert!(
        f.finish(&path, &plan, "skills/review/SKILL.md", &[])
            .unwrap_err()
            .to_string()
            .contains("未承認")
    );
    approve(&path).unwrap();
    assert!(
        complete(&path, Some("skills/testing/SKILL.md"), false, &[])
            .unwrap_err()
            .to_string()
            .contains("先に保存")
    );
    assert_eq!(
        f.finish(&path, &plan, "skills/review/SKILL.md", &[])
            .unwrap()["done"],
        1
    );
}

#[test]
fn repo_tree_blob_slash_branch_and_commit_urls() {
    let f = Fixture::new();
    f.git(&["branch", "feature/docs"]);
    let sha = f.git(&["rev-parse", "HEAD"]);
    let commit_url = format!("/blob/{sha}/skills/review/SKILL.md");
    for suffix in [
        "/tree/main/skills/review",
        "/blob/main/skills/review/SKILL.md",
        "/tree/feature/docs/skills/review",
        &commit_url,
    ] {
        let (_, plan, result) = f.prepare(suffix, false, false);
        assert_eq!(result["scope"], "skill");
        assert_eq!(result["pending"], json!(["skills/review/SKILL.md"]));
        assert_eq!(plan.commit, sha);
    }
    assert_eq!(
        f.prepare("/tree/main/skills", false, false).2["selected_skills"],
        3
    );
}

#[test]
fn resume_and_update_only_changed_skill() {
    let f = Fixture::new();
    let (path, plan, _) = f.prepare("", true, false);
    f.finish(&path, &plan, "skills/review/SKILL.md", &[])
        .unwrap();
    let (path, plan, result) = f.prepare("", true, false);
    assert_eq!(result["pending"].as_array().unwrap().len(), 2);
    assert!(
        !result["pending"]
            .as_array()
            .unwrap()
            .contains(&json!("skills/review/SKILL.md"))
    );
    for e in &plan.skills {
        if e.status == "pending" {
            f.finish(&path, &plan, &e.skill, &[]).unwrap();
        }
    }
    f.write("skills/testing/SKILL.md", "# Updated testing\n");
    f.commit("Change testing only");
    assert_eq!(
        f.prepare("", false, false).2["pending"],
        json!(["skills/testing/SKILL.md"])
    );
}

#[test]
fn shared_file_invalidates_all() {
    let f = Fixture::new();
    f.finish_all();
    f.write("README.md", "# New shared instructions\n");
    f.commit("Update shared README");
    assert_eq!(
        f.prepare("", false, false).2["pending"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn cross_skill_dependency_deletion_is_detected() {
    let f = Fixture::new();
    let (path, plan, _) = f.prepare("", true, false);
    let dependency = "skills/testing/references/shared.md";
    for e in &plan.skills {
        let deps = if e.skill == "skills/review/SKILL.md" {
            vec![dependency]
        } else {
            vec![]
        };
        f.finish(&path, &plan, &e.skill, &deps).unwrap();
    }
    fs::remove_file(f.source.join(dependency)).unwrap();
    f.commit("Remove referenced resource");
    assert_eq!(
        f.prepare("", false, false).2["pending"],
        json!(["skills/review/SKILL.md", "skills/testing/SKILL.md"])
    );
}

#[test]
fn issue_change_and_api_unavailability_trigger_research() {
    let mut f = Fixture::new();
    f.finish_all();
    f.index = json!({"status": "available", "items": [{"number": 1, "updated_at": "2026-10-19T00:00:00Z"}]});
    assert_eq!(
        f.prepare("", false, false).2["pending"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    f.index = json!({"status": "unavailable", "items": [], "error": "rate limited"});
    let result = f.prepare("", false, false).2;
    assert_eq!(result["index_status"], "unavailable");
    assert_eq!(result["warning"], "rate limited");
}

#[test]
fn stale_plan_cannot_approve_or_complete() {
    let f = Fixture::new();
    let (old_path, old_plan, _) = f.prepare("", true, false);
    f.prepare("", false, false);
    assert!(
        approve(&old_path)
            .unwrap_err()
            .to_string()
            .contains("古いPLAN")
    );
    assert!(
        f.finish(&old_path, &old_plan, "skills/review/SKILL.md", &[])
            .unwrap_err()
            .to_string()
            .contains("古いPLAN")
    );
}

#[test]
fn repository_completion_requires_selected_reports() {
    let f = Fixture::new();
    let (path, plan, _) = f.prepare("", true, false);
    fs::write(
        plan.destination.join("repository-analysis.md"),
        "# 全体分析\n",
    )
    .unwrap();
    assert!(
        complete(&path, None, true, &[])
            .unwrap_err()
            .to_string()
            .contains("未完了")
    );
    for e in &plan.skills {
        f.finish(&path, &plan, &e.skill, &[]).unwrap();
    }
    assert_eq!(complete(&path, None, true, &[]).unwrap()["done"], 3);
}

#[test]
fn individual_scope_preserves_other_reports_and_inventory() {
    let f = Fixture::new();
    let (_, old) = f.finish_all();
    let before = fs::read(&old.skills[1].report).unwrap();
    let (_, plan, result) = f.prepare("/tree/main/skills/review", false, false);
    assert_eq!(result["selected_skills"], 1);
    assert_eq!(result["pending"], json!([]));
    assert_eq!(fs::read(&old.skills[1].report).unwrap(), before);
    assert_eq!(plan.skills.len(), 3);
}

#[test]
fn forced_refresh_survives_interruption() {
    let f = Fixture::new();
    f.finish_all();
    f.prepare("", false, true);
    assert_eq!(
        f.prepare("", false, false).2["pending"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn root_skill_and_duplicate_names_have_unique_reports() {
    let f = Fixture::new();
    f.write("SKILL.md", "# Root\n");
    f.write(".agents/skills/review/SKILL.md", "# Another review\n");
    f.commit("Add duplicate and root skills");
    let (_, plan, result) = f.prepare("", false, false);
    assert_eq!(result["total_skills"], 5);
    let names: std::collections::BTreeSet<_> = plan.skills.iter().map(|e| &e.report).collect();
    assert_eq!(names.len(), 5);
    assert!(names.iter().any(|p| p.ends_with("root.md")));
}

#[test]
fn removed_skills_retain_reports() {
    let f = Fixture::new();
    let (_, old) = f.finish_all();
    let report = &old
        .skills
        .iter()
        .find(|e| e.skill == "skills/review/SKILL.md")
        .unwrap()
        .report;
    fs::remove_file(f.source.join("skills/review/SKILL.md")).unwrap();
    f.commit("Remove review");
    let (_, plan, _) = f.prepare("", false, false);
    let state: State = serde_json::from_slice(&fs::read(&plan.state_file).unwrap()).unwrap();
    assert_eq!(state.removed, vec!["skills/review/SKILL.md"]);
    assert!(report.exists());
}

#[test]
fn missing_report_is_not_skipped() {
    let f = Fixture::new();
    let (_, plan) = f.finish_all();
    let report = &plan
        .skills
        .iter()
        .find(|e| e.skill == "skills/review/SKILL.md")
        .unwrap()
        .report;
    fs::remove_file(report).unwrap();
    assert_eq!(
        f.prepare("", false, false).2["pending"],
        json!(["skills/review/SKILL.md"])
    );
}

#[test]
fn unsafe_urls_and_non_skill_blob_are_rejected() {
    for url in [
        "http://github.com/a/b",
        "https://github.com.evil.test/a/b",
        "https://github.com/a/b/tree/main/%2e%2e/private",
        "https://github.com/a/b/issues/1",
        "https://github.com/a/..",
        "https://github.com:8443/a/b",
    ] {
        assert!(parse_url(url).is_err(), "{url}");
    }
    let files = BTreeMap::from([("skills/review/SKILL.md".into(), "blob-id".into())]);
    assert!(discover(&files, "README.md", "blob").is_err());
}

#[cfg(unix)]
#[test]
fn output_symlinks_cannot_escape_root() {
    let f = Fixture::new();
    std::os::unix::fs::symlink(&f.source, f.root.join("reports")).unwrap();
    assert!(
        inside(&f.root, "reports/alice/repo")
            .unwrap_err()
            .to_string()
            .contains("範囲外")
    );
}

#[test]
fn names_in_separate_namespaces_do_not_overwrite_each_other() {
    let mapping = report_paths(&[
        "skills/review/SKILL.md".into(),
        ".agents/skills/review/SKILL.md".into(),
        "skills/a/review/SKILL.md".into(),
    ]);
    assert_ne!(
        mapping["skills/review/SKILL.md"],
        mapping[".agents/skills/review/SKILL.md"]
    );
    assert_eq!(
        mapping["skills/a/review/SKILL.md"],
        "skill-analyses/a/review.md"
    );
}

#[test]
fn report_names_preserve_readable_skill_names() {
    let mapping = report_paths(&["skills/productivity/grill-me/SKILL.md".into()]);
    assert_eq!(
        mapping["skills/productivity/grill-me/SKILL.md"],
        "skill-analyses/productivity/grill-me.md"
    );
}

#[test]
fn binary_help_and_invalid_input_exit_codes() {
    let binary = env!("CARGO_BIN_EXE_skill-anatomy");
    assert!(
        Command::new(binary)
            .arg("--help")
            .output()
            .unwrap()
            .status
            .success()
    );
    let failed = Command::new(binary)
        .args(["prepare", "https://example.com/a/b"])
        .output()
        .unwrap();
    assert_eq!(failed.status.code(), Some(1));
    assert!(
        String::from_utf8(failed.stderr)
            .unwrap()
            .contains("github.com")
    );
}
