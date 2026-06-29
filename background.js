const EXTENSION_MAP = {
    "cpp": "cpp", "java": "java", "python": "py", "python3": "py", "c": "c",
    "csharp": "cs", "javascript": "js", "ruby": "rb", "swift": "swift", "golang": "go",
    "scala": "scala", "kotlin": "kt", "rust": "rs", "php": "php", "typescript": "ts",
    "racket": "rkt", "erlang": "erl", "elixir": "ex", "dart": "dart"
};

// Listen for submit request
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.method === 'POST' && details.url.includes('/submit/')) {
            const match = details.url.match(/\/problems\/([^/]+)\/submit/);
            if (match && match[1]) {
                const questionSlug = match[1];
                console.log(`LeetGit: Detected submission for ${questionSlug}. Waiting to check status...`);
                // Wait a few seconds for LeetCode to process the submission
                setTimeout(() => {
                    handleSubmission(questionSlug);
                }, 5000);
            }
        }
    },
    { urls: ['https://leetcode.com/problems/*/submit/'] }
);

async function handleSubmission(questionSlug) {
    try {
        const cookie = await new Promise(resolve => {
            chrome.cookies.get({ url: "https://leetcode.com", name: "csrftoken" }, resolve);
        });

        const headers = {
            "Content-Type": "application/json"
        };
        if (cookie && cookie.value) {
            headers["x-csrftoken"] = cookie.value;
        }

        // 1. Get latest submission ID
        const submissionsRes = await fetch("https://leetcode.com/graphql", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                operationName: "submissionList",
                variables: { questionSlug: questionSlug, offset: 0, limit: 1 },
                query: `query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
                    questionSubmissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
                        submissions {
                            id
                            statusDisplay
                        }
                    }
                }`
            })
        });
        const submissionsData = await submissionsRes.json();
        const submissions = submissionsData?.data?.questionSubmissionList?.submissions;
        
        if (!submissions || submissions.length === 0) {
            console.log("LeetGit: No submissions found.");
            return;
        }

        const latestSubmission = submissions[0];
        if (latestSubmission.statusDisplay !== "Accepted") {
            console.log("LeetGit: Latest submission is not Accepted. Status:", latestSubmission.statusDisplay);
            return;
        }

        // 2. Get submission details (code, language, topic tags)
        const detailsRes = await fetch("https://leetcode.com/graphql", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                operationName: "submissionDetails",
                variables: { submissionId: latestSubmission.id },
                query: `query submissionDetails($submissionId: Int!) {
                    submissionDetails(submissionId: $submissionId) {
                        code
                        lang { name }
                        question {
                            title
                            topicTags { name }
                        }
                    }
                }`
            })
        });
        const detailsData = await detailsRes.json();
        const details = detailsData?.data?.submissionDetails;

        if (!details) {
            console.error("LeetGit: Failed to fetch submission details.");
            return;
        }

        const code = details.code;
        const lang = details.lang.name;
        const title = details.question.title;
        let mainTopic = "Uncategorized";
        if (details.question.topicTags && details.question.topicTags.length > 0) {
            mainTopic = details.question.topicTags[0].name.replace(/ /g, '_');
        }

        const folderName = title.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/__+/g, '_');
        const ext = EXTENSION_MAP[lang] || "txt";
        const filePath = `${mainTopic}/${folderName}/solution.${ext}`;

        // 3. Upload to GitHub
        const settings = await new Promise((resolve) => {
            chrome.storage.session.get(['githubRepo', 'githubToken'], resolve);
        });

        if (!settings.githubToken || !settings.githubRepo) {
            console.error("LeetGit: GitHub Token or Repository not configured.");
            return;
        }

        await pushToGitHub(settings.githubToken, settings.githubRepo, filePath, code, `Add solution for ${title}`);
        console.log(`LeetGit: Successfully pushed ${title} to GitHub at ${filePath}`);

    } catch (e) {
        console.error("LeetGit: Error handling submission:", e);
    }
}

async function pushToGitHub(token, repo, path, content, message) {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json"
    };

    const encodedContent = btoa(unescape(encodeURIComponent(content)));
    let sha = null;
    
    const getRes = await fetch(apiUrl, { method: "GET", headers });
    if (getRes.status === 200) {
        const getData = await getRes.json();
        sha = getData.sha;
    }

    const body = { message: message, content: encodedContent };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiUrl, { method: "PUT", headers: headers, body: JSON.stringify(body) });
    if (!putRes.ok) {
        const errorData = await putRes.text();
        throw new Error(`GitHub API Error: ${putRes.status} - ${errorData}`);
    }
}
