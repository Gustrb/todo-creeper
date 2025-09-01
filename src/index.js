const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    // Get inputs
    const token = core.getInput('token', { required: true });
    const threshold = parseInt(core.getInput('threshold', { required: false })) || 10;
    const excludePatterns = core.getInput('exclude-patterns', { required: false })
      .split(',')
      .map(pattern => pattern.trim())
      .filter(pattern => pattern.length > 0);
    const createIssues = core.getInput('create-issues', { required: false }) === 'true';
    const issueLabels = core.getInput('issue-labels', { required: false }) || 'todo,enhancement';

    // Initialize GitHub client
    const octokit = github.getOctokit(token);
    const context = github.context;

    core.info('🔍 Starting TODO scan...');

    // Get repository contents
    const { data: contents } = await octokit.rest.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: '',
      ref: context.sha
    });

    const todos = await scanForTodos(contents, octokit, context, excludePatterns);
    
    const todoCount = todos.length;
    const todoFiles = new Set(todos.map(todo => todo.file)).size;
    
    // Set outputs
    core.setOutput('todo-count', todoCount.toString());
    core.setOutput('todo-files', todoFiles.toString());
    core.setOutput('todo-details', JSON.stringify(todos));

    // Log results
    core.info(`📊 Found ${todoCount} TODOs across ${todoFiles} files`);
    
    if (todoCount > 0) {
      core.info('\n📝 TODO Details:');
      todos.forEach((todo, index) => {
        core.info(`${index + 1}. ${todo.file}:${todo.line} - ${todo.content.trim()}`);
      });
    }

    // Create issues for TODOs if requested
    let issuesCreated = 0;
    let issuesLinked = 0;
    
    core.info(`🔍 Event type: ${context.eventName}`);
    core.info(`🔍 Create issues enabled: ${createIssues}`);
    core.info(`🔍 Issue labels: ${issueLabels}`);
    
    if (createIssues) {
      // Check if we're in a PR context by looking for PR number in various places
      const prNumber = context.payload.pull_request?.number || 
                      context.payload.number || 
                      context.payload.issue?.number;
      
      core.info(`🔍 PR number detected: ${prNumber || 'none'}`);
      
      if (prNumber || context.eventName === 'pull_request') {
        core.info('\n🔗 Processing TODOs for issue creation...');
        const result = await processTodosForIssues(todos, octokit, context, issueLabels);
        issuesCreated = result.created;
        issuesLinked = result.linked;
        core.info(`📊 Issues created: ${issuesCreated}, Issues linked: ${issuesLinked}`);
      } else {
        core.warning('⚠️ Issue creation is enabled but no PR context detected. This usually means the action is running on a push event or manual trigger.');
        core.info('💡 To create issues, run this action on a pull_request event or ensure it has access to PR context.');
      }
    } else {
      core.info('ℹ️ Issue creation is disabled');
    }
    
    // Set additional outputs
    core.setOutput('issues-created', issuesCreated.toString());
    core.setOutput('issues-linked', issuesLinked.toString());
    core.info(`📤 Setting outputs - issues-created: ${issuesCreated}, issues-linked: ${issuesLinked}`);

    // Check threshold
    if (todoCount > threshold) {
      core.setFailed(`❌ Too many TODOs found: ${todoCount} (threshold: ${threshold})`);
    } else {
      core.info(`✅ TODO count (${todoCount}) is within threshold (${threshold})`);
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

async function scanForTodos(contents, octokit, context, excludePatterns, currentPath = '') {
  const todos = [];

  for (const item of contents) {
    const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
    
    // Skip excluded patterns
    if (excludePatterns.some(pattern => itemPath.includes(pattern))) {
      continue;
    }

    if (item.type === 'dir') {
      // Recursively scan directories
      try {
        const { data: dirContents } = await octokit.rest.repos.getContent({
          owner: context.repo.owner,
          repo: context.repo.repo,
          path: itemPath,
          ref: context.sha
        });
        const subTodos = await scanForTodos(dirContents, octokit, context, excludePatterns, itemPath);
        todos.push(...subTodos);
      } catch (error) {
        core.warning(`Failed to scan directory ${itemPath}: ${error.message}`);
      }
    } else if (item.type === 'file') {
      // Scan individual files
      const fileTodos = await scanFileForTodos(item, octokit, context);
      todos.push(...fileTodos);
    }
  }

  return todos;
}

async function scanFileForTodos(file, octokit, context) {
  const todos = [];
  
  // Only scan text files with common code extensions
  const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj', '.hs', '.ml', '.fs', '.vb', '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.yml', '.yaml', '.json', '.xml', '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte', '.md', '.txt'];
  
  const fileExtension = path.extname(file.name).toLowerCase();
  if (!codeExtensions.includes(fileExtension)) {
    return todos;
  }

  try {
    // Get file content
    const { data: fileContent } = await octokit.rest.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: file.path,
      ref: context.sha
    });

    if (fileContent.type === 'file' && fileContent.content) {
      // Decode content (GitHub API returns base64 encoded content)
      const content = Buffer.from(fileContent.content, 'base64').toString('utf-8');
      const lines = content.split('\n');

      // Scan each line for TODO patterns
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const todoPatterns = [
          /\/\/\s*TODO/i,
          /\/\*\s*TODO/i,
          /#\s*TODO/i,
          /<!--\s*TODO/i,
          /\/\/\s*FIXME/i,
          /\/\*\s*FIXME/i,
          /#\s*FIXME/i,
          /<!--\s*FIXME/i,
          /\/\/\s*HACK/i,
          /\/\*\s*HACK/i,
          /#\s*HACK/i,
          /<!--\s*HACK/i
        ];

        for (const pattern of todoPatterns) {
          if (pattern.test(line)) {
            todos.push({
              file: file.path,
              line: lineNumber,
              content: line.trim(),
              type: pattern.source.includes('TODO') ? 'TODO' : 
                    pattern.source.includes('FIXME') ? 'FIXME' : 'HACK'
            });
            break; // Only count each line once
          }
        }
      });
    }
  } catch (error) {
    core.warning(`Failed to scan file ${file.path}: ${error.message}`);
  }

  return todos;
}

async function processTodosForIssues(todos, octokit, context, issueLabels) {
  const labels = issueLabels.split(',').map(label => label.trim());
  let created = 0;
  let linked = 0;
  
  core.info(`🔍 Processing ${todos.length} TODOs for issue creation...`);
  
  for (const todo of todos) {
    try {
      core.info(`🔍 Processing TODO: ${todo.file}:${todo.line} - ${todo.content.trim()}`);
      
      // Check if TODO already has an associated issue
      const existingIssue = await findExistingIssue(todo, octokit, context);
      
      if (existingIssue) {
        core.info(`🔗 TODO in ${todo.file}:${todo.line} already has issue #${existingIssue.number}`);
        linked++;
      } else {
        // Create new issue for this TODO
        core.info(`📝 Creating new issue for TODO in ${todo.file}:${todo.line}`);
        const issue = await createIssueForTodo(todo, octokit, context, labels);
        core.info(`✅ Created issue #${issue.number} for TODO in ${todo.file}:${todo.line}`);
        created++;
      }
    } catch (error) {
      core.warning(`Failed to process TODO in ${todo.file}:${todo.line}: ${error.message}`);
    }
  }
  
  core.info(`📊 Processed ${todos.length} TODOs: ${created} created, ${linked} linked`);
  return { created, linked };
}

async function findExistingIssue(todo, octokit, context) {
  try {
    // Search for existing issues that might be related to this TODO
    const searchQuery = `repo:${context.repo.owner}/${context.repo.repo} "${todo.content.trim()}" is:issue`;
    
    const { data: searchResults } = await octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      per_page: 10
    });

    // Look for issues with similar content or file references
    for (const issue of searchResults.items) {
      if (issue.body && (
        issue.body.includes(todo.file) ||
        issue.body.includes(todo.content.trim()) ||
        issue.title.toLowerCase().includes('todo') ||
        issue.title.toLowerCase().includes('fixme') ||
        issue.title.toLowerCase().includes('hack')
      )) {
        return issue;
      }
    }

    // Also check for issues with file path in title or body
    const fileSearchQuery = `repo:${context.repo.owner}/${context.repo.repo} "${todo.file}" is:issue`;
    const { data: fileSearchResults } = await octokit.rest.search.issuesAndPullRequests({
      q: fileSearchQuery,
      per_page: 10
    });

    for (const issue of fileSearchResults.items) {
      if (issue.body && issue.body.includes(todo.content.trim())) {
        return issue;
      }
    }

    return null;
  } catch (error) {
    core.warning(`Failed to search for existing issues: ${error.message}`);
    return null;
  }
}

async function createIssueForTodo(todo, octokit, context, labels) {
  const title = `TODO: ${todo.content.trim().substring(0, 50)}${todo.content.length > 50 ? '...' : ''}`;
  
  let contextInfo = '';
  let assignees = [];
  
  // Try to get PR number from various sources
  const prNumber = context.payload.pull_request?.number || 
                  context.payload.number || 
                  context.payload.issue?.number;
  
  if (prNumber) {
    contextInfo = `This TODO was automatically detected by the TODO Creeper action in pull request #${prNumber}.`;
    // Try to get the PR author
    const prAuthor = context.payload.pull_request?.user?.login || 
                    context.payload.sender?.login;
    if (prAuthor) {
      assignees = [prAuthor];
    }
  } else if (context.eventName === 'push') {
    contextInfo = `This TODO was automatically detected by the TODO Creeper action in commit ${context.sha.substring(0, 7)} on branch ${context.ref.replace('refs/heads/', '')}.`;
  } else {
    contextInfo = `This TODO was automatically detected by the TODO Creeper action.`;
  }
  
  const body = `## TODO Item

**File:** \`${todo.file}\`
**Line:** ${todo.line}
**Type:** ${todo.type}

**Content:**
\`\`\`
${todo.content.trim()}
\`\`\`

**Context:**
${contextInfo}

**Action Required:**
Please review this TODO and either:
1. Address the TODO item
2. Create a proper issue with more details
3. Remove the TODO if it's no longer needed

---
*This issue was automatically created by [TODO Creeper](https://github.com/Gustrb/todo-creeper)*`;

  const issueData = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    title: title,
    body: body,
    labels: labels
  };
  
  // Only add assignees if we have them
  if (assignees.length > 0) {
    issueData.assignees = assignees;
  }

  const { data: issue } = await octokit.rest.issues.create(issueData);

  return issue;
}

// Run the action
run();
