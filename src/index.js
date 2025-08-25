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

// Run the action
run();
