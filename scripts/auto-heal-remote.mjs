#!/usr/bin/env node
// Public, billing-free runner for the private data/mapping repo's daily
// self-healing audit.
//
// Why this repo is split from the data: GitHub Actions on a PRIVATE repo
// draws from the account's paid Actions-minutes quota, which is blocked
// whenever the account's billing has an issue (failed payment / spending
// limit) -- that's exactly what happened when the equivalent workflow was
// tried directly inside the private vivekearthz/lovable-repository-audit
// repo. Actions on a PUBLIC repo are always free, regardless of account
// billing status. But the private repo's data -- the account's actual
// repo names and the Lovable project mapping -- must never be committed
// into a public repo's git history, which is permanent and world-visible
// the moment it's pushed.
//
// This script resolves that by never storing any of that data locally in
// THIS repo. Every read and write of lovable-mapping.json,
// repo-inventory.json, needs-review.json, and the daily log goes straight
// to/from the private DATA_REPO over the GitHub Contents API, in memory,
// for the duration of a single Actions run. Nothing sensitive is ever
// written to disk in this checkout or committed here.
//
// This does not fix the underlying account billing issue -- it only
// routes this one automation around its effect. Any other private-repo
// Actions workflow, Codespaces, or other paid feature on the account will
// still be blocked until the actual payment/spending-limit problem is
// resolved at github.com/settings/billing.
//
// Usage: node scripts/auto-heal-remote.mjs [--dry-run]
// Env:
//   GH_PERSONAL_ACCESS_TOKEN   required
//   DATA_REPO                  "owner/repo" of the private data repo, e.g.
//                              vivekearthz/lovable-repository-audit

const TOKEN = process.env.GH_PERSONAL_ACCESS_TOKEN;
const DATA_REPO = process.env.DATA_REPO;
const DRY_RUN = process.argv.includes("--dry-run");

if (!TOKEN || !DATA_REPO) {
  console.error("GH_PERSONAL_ACCESS_TOKEN and DATA_REPO must both be set.");
  process.exit(2);
}

async function githubApi(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lovable-audit-scheduler",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 404) return { status: 404 };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${path} returned HTTP ${res.status}: ${body}`);
  }
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

async function getRemoteFile(path) {
  const { status, body } = await githubApi(`/repos/${DATA_REPO}/contents/${path}`);
  if (status === 404) return { content: null, sha: null };
  const content = Buffer.from(body.content, "base64").toString("utf8");
  return { content: JSON.parse(content), sha: body.sha };
}

async function putRemoteFile(path, data, sha, message) {
  await githubApi(`/repos/${DATA_REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
}

async function listAllRepos() {
  const repos = [];
  for (let page = 1; page <= 30; page++) {
    const { body } = await githubApi(`/user/repos?per_page=100&page=${page}&sort=full_name&affiliation=owner`);
    if (!Array.isArray(body) || body.length === 0) break;
    repos.push(...body);
    if (body.length < 100) break;
  }
  return repos;
}

function baseName(name) {
  const m = name.match(/^(.*?)-?[0-9a-f]{8}$/i);
  if (m && name.length - m[1].length <= 9) return m[1] || name;
  return name;
}

function normalizeRepo(name, owner) {
  let n = String(name).trim().replace(/^https?:\/\/github\.com\//i, "");
  if (!n.includes("/")) n = `${owner}/${n}`;
  return n.toLowerCase();
}

async function archiveAndRename(fullName, dateStamp) {
  const [owner, repo] = fullName.split("/");
  const newName = `old-${dateStamp}-${repo}`;
  await githubApi(`/repos/${owner}/${repo}`, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  });
  await githubApi(`/repos/${owner}/${newName}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  });
  return `${owner}/${newName}`;
}

async function main() {
  const { content: mapping, sha: mappingSha } = await getRemoteFile("lovable-mapping.json");
  if (!mapping) {
    console.error(
      `lovable-mapping.json not found in ${DATA_REPO} -- run the one-time manual ` +
        "setup there before enabling this scheduler."
    );
    process.exit(2);
  }

  const repos = await listAllRepos();
  const owner = repos[0]?.full_name.split("/")[0] ?? "";
  const clusters = new Map();
  for (const r of repos) {
    if (r.archived) continue;
    const key = baseName(r.name).toLowerCase();
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(r);
  }

  const mappingByProject = new Map(mapping.map((m) => [m.project_name.toLowerCase(), m]));
  const dateStamp = new Date().toISOString().slice(0, 10).split("-").reverse().join("");

  const actions = [];
  const needsReview = [];
  let mappingChanged = false;

  for (const [base, list] of clusters) {
    if (list.length < 2) continue;
    const known = mappingByProject.get(base);

    if (!known) {
      needsReview.push({
        baseName: base,
        repos: list.map((r) => r.full_name),
        reason: "No entry in lovable-mapping.json -- needs a one-time manual decision.",
      });
      continue;
    }

    const knownRepoName = normalizeRepo(known.current_repo, owner);
    const byCreated = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const newest = byCreated[0];

    let keepRepo = list.find((r) => r.full_name.toLowerCase() === knownRepoName);
    if (!keepRepo) {
      keepRepo = newest;
      needsReview.push({
        baseName: base,
        reason: `Previously mapped repo "${known.current_repo}" no longer found unarchived. Falling back to newest-created (${newest.full_name}) -- please verify.`,
      });
    } else if (new Date(newest.created_at) > new Date(keepRepo.created_at)) {
      actions.push({ type: "promote", baseName: base, from: keepRepo.full_name, to: newest.full_name });
      known.current_repo = newest.full_name;
      known.notes = `auto-promoted by lovable-audit-scheduler on ${new Date().toISOString()}`;
      mappingChanged = true;
      keepRepo = newest;
    }

    for (const r of list) {
      if (r.full_name === keepRepo.full_name) continue;
      if (DRY_RUN) {
        actions.push({ type: "would-archive", baseName: base, repo: r.full_name });
        continue;
      }
      try {
        const archivedAs = await archiveAndRename(r.full_name, dateStamp);
        actions.push({ type: "archived", baseName: base, repo: r.full_name, archivedAs });
      } catch (err) {
        actions.push({ type: "failed", baseName: base, repo: r.full_name, error: err.message });
      }
    }
  }

  const summary = {
    runAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    runner: "public lovable-audit-scheduler repo (billing-free)",
    totalRepos: repos.length,
    clustersProcessed: [...clusters.values()].filter((v) => v.length > 1).length,
    promotions: actions.filter((a) => a.type === "promote").length,
    archived: actions.filter((a) => a.type === "archived").length,
    failed: actions.filter((a) => a.type === "failed").length,
    needsReview: needsReview.length,
    actions,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!DRY_RUN) {
    if (mappingChanged) {
      await putRemoteFile(
        "lovable-mapping.json",
        mapping,
        mappingSha,
        `Auto-heal: ${actions.filter((a) => a.type === "promote").length} promotion(s), ${new Date().toISOString().slice(0, 10)}`
      );
    }
    const { sha: reviewSha } = await getRemoteFile("needs-review.json");
    await putRemoteFile("needs-review.json", needsReview, reviewSha, "Update needs-review.json");

    const logPath = `logs/${new Date().toISOString().slice(0, 10)}.json`;
    const { sha: logSha } = await getRemoteFile(logPath);
    await putRemoteFile(logPath, summary, logSha, `Daily audit log ${new Date().toISOString().slice(0, 10)}`);
  }

  if (needsReview.length > 0) {
    await manageTrackingIssue(needsReview);
  } else {
    await closeTrackingIssueIfHealthy();
  }

  if (summary.failed > 0) process.exitCode = 1;
}

async function findTrackingIssue() {
  const { body } = await githubApi(
    `/repos/${DATA_REPO}/issues?state=open&labels=needs-mapping`
  );
  return Array.isArray(body) && body.length > 0 ? body[0] : null;
}

async function manageTrackingIssue(needsReview) {
  const body = [
    `${needsReview.length} project cluster(s) have no entry in lovable-mapping.json ` +
      `and were left untouched as of ${new Date().toISOString()}.`,
    "",
    "For each: open the project in Lovable -> Settings -> GitHub, note its " +
      "real connected repo, add it to lovable-mapping.json in this repo, commit. " +
      "The next scheduled run will pick it up automatically from then on.",
    "",
    "```json",
    JSON.stringify(needsReview, null, 2),
    "```",
  ].join("\n");

  const existing = await findTrackingIssue();
  if (existing) {
    await githubApi(`/repos/${DATA_REPO}/issues/${existing.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  } else {
    await githubApi(`/repos/${DATA_REPO}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: "🔎 New unmapped project clusters need a one-time manual mapping",
        body,
        labels: ["needs-mapping"],
      }),
    });
  }
}

async function closeTrackingIssueIfHealthy() {
  const existing = await findTrackingIssue();
  if (!existing) return;
  await githubApi(`/repos/${DATA_REPO}/issues/${existing.number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: `✅ No unmapped clusters as of ${new Date().toISOString()}.` }),
  });
  await githubApi(`/repos/${DATA_REPO}/issues/${existing.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
