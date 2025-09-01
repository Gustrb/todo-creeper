// Test script for issue creation logic
const mockTodo = {
  file: 'src/utils.js',
  line: 15,
  content: '// TODO: Implement error handling',
  type: 'TODO'
};

const mockContext = {
  repo: { owner: 'testuser', repo: 'testrepo' },
  eventName: 'pull_request',
  payload: {
    pull_request: {
      number: 123,
      user: { login: 'testuser' }
    }
  }
};

// Mock the issue creation logic
function createIssueForTodo(todo, context, labels) {
  const title = `TODO: ${todo.content.trim().substring(0, 50)}${todo.content.length > 50 ? '...' : ''}`;
  
  const body = `## TODO Item

**File:** \`${todo.file}\`
**Line:** ${todo.line}
**Type:** ${todo.type}

**Content:**
\`\`\`
${todo.content.trim()}
\`\`\`

**Context:**
This TODO was automatically detected by the TODO Creeper action in pull request #${context.payload.pull_request.number}.

**Action Required:**
Please review this TODO and either:
1. Address the TODO item
2. Create a proper issue with more details
3. Remove the TODO if it's no longer needed

---
*This issue was automatically created by [TODO Creeper](https://github.com/Gustrb/todo-creeper)*`;

  return {
    title,
    body,
    labels,
    assignees: [context.payload.pull_request.user.login]
  };
}

// Test the issue creation
console.log('🧪 Testing issue creation logic...\n');

const issue = createIssueForTodo(mockTodo, mockContext, ['todo', 'enhancement']);

console.log('📝 Created Issue:');
console.log(`Title: ${issue.title}`);
console.log(`Labels: ${issue.labels.join(', ')}`);
console.log(`Assignees: ${issue.assignees.join(', ')}`);
console.log('\nBody Preview:');
console.log(issue.body.substring(0, 200) + '...');

console.log('\n✅ Issue creation logic test completed!');

