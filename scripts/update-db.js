const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../json/repos-config.json');
const OUTPUT_PATH = path.join(__dirname, '../json/repos-database.json');
const PAYLOADS_PATH = path.join(__dirname, '../json/payloads.json');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  'User-Agent': 'PS5-Repository-List-Builder',
  ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {})
};

async function fetchGitHub(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Erreur API GitHub (${res.status} ${res.statusText}) pour l'URL : ${url}`);
  }
  return res.json();
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Fichier de configuration introuvable : ${CONFIG_PATH}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const categories = config.categories || [];
  const inputRepos = config.repos || [];

  const processedRepos = [];

  for (const item of inputRepos) {
    // Extraction owner et repo depuis l'URL GitHub
    const match = item.url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      console.warn(`URL GitHub invalide ignorée : ${item.url}`);
      continue;
    }

    const owner = match[1];
    const repoName = match[2].replace(/\.git\$/, '');
    console.log(`Traitement en cours : ${owner}/${repoName}...`);

    try {
      // 1. Récupération des données principales du dépôt
      const repoData = await fetchGitHub(`https://api.github.com/repos/${owner}/${repoName}`);

      // 2. Récupération du README brut
      let readme = '';
      try {
        const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/readme`, {
          headers: { ...headers, 'Accept': 'application/vnd.github.raw+json' }
        });
        if (readmeRes.ok) {
          readme = await readmeRes.text();
        }
      } catch (e) {
        console.warn(`-> Attention : Impossible de récupérer le README pour ${owner}/${repoName}`);
      }

      // 3. Récupération des commits récents
      let recentCommits = [];
      try {
        const commitsData = await fetchGitHub(`https://api.github.com/repos/${owner}/${repoName}/commits?per_page=10`);
        recentCommits = commitsData.map(c => ({
          sha: c.sha.substring(0, 7),
          message: c.commit.message.split('\n')[0],
          authorName: c.commit.author ? c.commit.author.name : 'Unknown',
          authorAvatar: c.author ? c.author.avatar_url : null,
          date: c.commit.author ? c.commit.author.date : new Date().toISOString(),
          url: c.html_url
        }));
      } catch (e) {
        console.warn(`-> Attention : Impossible de récupérer les commits pour ${owner}/${repoName}`);
      }

      // 4. Récupération de la dernière release et de ses assets
      let latestRelease = null;
      try {
        const releasesData = await fetchGitHub(`https://api.github.com/repos/${owner}/${repoName}/releases`);
        if (Array.isArray(releasesData) && releasesData.length > 0) {
          const rel = releasesData[0]; // La plus récente
          latestRelease = {
            id: rel.id,
            tagName: rel.tag_name,
            name: rel.name || rel.tag_name,
            publishedAt: rel.published_at,
            body: rel.body || '',
            htmlUrl: rel.html_url,
            assets: (rel.assets || []).map(a => ({
              id: a.id,
              name: a.name,
              size: a.size,
              downloadCount: a.download_count,
              downloadUrl: a.browser_download_url,
              contentType: a.content_type,
              updatedAt: a.updated_at
            }))
          };
        }
      } catch (e) {
        console.warn(`-> Attention : Aucune release trouvée pour ${owner}/${repoName}`);
      }

      // Calcul simple d'alerte (ex: commit dans les 3 derniers jours)
      let hasNewCommitsAlert = false;
      if (recentCommits.length > 0) {
        const lastCommitDate = new Date(recentCommits[0].date);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        hasNewCommitsAlert = lastCommitDate >= threeDaysAgo;
      }

      processedRepos.push({
        id: `repo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        url: item.url,
        owner: owner,
        ownerAvatar: repoData.owner ? repoData.owner.avatar_url : '',
        name: repoData.name,
        fullName: repoData.full_name,
        description: repoData.description || '',
        customNotes: item.customNotes || '',
        tags: item.tags || [],
        categoryId: item.categoryId || 'unassigned',
        stars: repoData.stargazers_count || 0,
        forks: repoData.forks_count || 0,
        openIssues: repoData.open_issues_count || 0,
        language: repoData.language || 'Unknown',
        license: repoData.license ? repoData.license.spdx_id || repoData.license.key : 'NOASSERTION',
        defaultBranch: repoData.default_branch || 'main',
        pushedAt: repoData.pushed_at,
        updatedAt: repoData.updated_at,
        htmlUrl: repoData.html_url,
        readme: readme,
        readmeFetchedAt: new Date().toISOString(),
        autoSaveAssets: false,
        hasNewCommitsAlert: hasNewCommitsAlert,
        recentCommits: recentCommits,
        latestRelease: latestRelease,
        lastCheckedAt: new Date().toISOString()
      });

    } catch (err) {
      console.error(`Erreur critique pour le dépôt ${item.url}:`, err.message);
    }
  }

  const databaseOutput = {
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    appName: "PS5-Repository-List",
    categories: categories,
    repos: processedRepos
  };

  // Écriture du fichier JSON final consommé par la page web
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(databaseOutput, null, 2), 'utf8');
  console.log(`Succès ! Base de données générée dans ${OUTPUT_PATH} (${processedRepos.length} dépôts intégrés).`);

  // 同步更新 PS5 插件专属 payloads.json 源
  if (fs.existsSync(PAYLOADS_PATH)) {
    try {
      const payloadsData = JSON.parse(fs.readFileSync(PAYLOADS_PATH, 'utf8'));
      if (Array.isArray(payloadsData.payloads)) {
        let syncedCount = 0;
        for (const item of payloadsData.payloads) {
          if (!item.source) continue;
          // 寻找匹配的仓库
          const matchedRepo = processedRepos.find(r => r.url && r.url.toLowerCase() === item.source.toLowerCase());
          if (matchedRepo && matchedRepo.latestRelease) {
            const rel = matchedRepo.latestRelease;
            const newVer = rel.tagName || rel.name;
            if (newVer && item.version !== newVer) {
              item.version = newVer;
              item.last_update = rel.publishedAt ? rel.publishedAt.split('T')[0] : new Date().toISOString().split('T')[0];
              // 如果有对应文件的 release 附件，更新直链
              if (Array.isArray(rel.assets) && rel.assets.length > 0) {
                const targetAsset = rel.assets.find(a => a.name === item.filename) || rel.assets.find(a => a.name.endsWith('.elf') || a.name.endsWith('.bin') || a.name.endsWith('.pkg')) || rel.assets[0];
                if (targetAsset && targetAsset.downloadUrl) {
                  item.url = targetAsset.downloadUrl;
                  item.source_direct = targetAsset.downloadUrl;
                }
              }
              syncedCount++;
            }
          }
        }
        fs.writeFileSync(PAYLOADS_PATH, JSON.stringify(payloadsData, null, 2), 'utf8');
        console.log(`同步更新 payloads.json 成功：更新了 ${syncedCount} 个插件条目。`);
      }
    } catch (e) {
      console.warn(`更新 payloads.json 时发生异常:`, e.message);
    }
  }
}

main();
