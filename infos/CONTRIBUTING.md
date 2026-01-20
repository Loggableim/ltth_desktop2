# Contributing to LTTH

Thank you for considering contributing to PupCid's Little TikTool Helper! This document provides guidelines for contributing to the project.

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Code Style & Standards](#code-style--standards)
5. [Git Workflow](#git-workflow)
6. [Commit Conventions](#commit-conventions)
7. [Pull Request Process](#pull-request-process)
8. [Testing Guidelines](#testing-guidelines)
9. [Documentation Requirements](#documentation-requirements)
10. [Common Mistakes to Avoid](#common-mistakes-to-avoid)

---

## 🤝 Code of Conduct

### Our Pledge

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other community members

### Our Standards

**Positive behavior:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior:**
- Trolling, insulting/derogatory comments
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x, 20.x, or 22.x
- npm (comes with Node.js)
- Git
- Text editor (VS Code recommended)
- Basic JavaScript knowledge
- Familiarity with Node.js and Express.js

### First Steps

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/ltth_desktop2.git
   cd ltth_desktop2
   ```
3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/Loggableim/ltth_desktop2.git
   ```
4. **Install dependencies:**
   ```bash
   cd app
   npm install
   ```
5. **Read the documentation:**
   - `/infos/llm_start_here.md` - Start here!
   - `/infos/DEVELOPMENT.md` - Development guide
   - `/.github/copilot-instructions.md` - Coding standards

---

## 💻 Development Setup

See `/infos/DEVELOPMENT.md` for complete setup instructions.

**Quick setup:**
```bash
cd app
npm install
cp .env.example .env
npm run dev
```

---

## 📝 Code Style & Standards

### General Rules

- **Language:** Code and comments in **English**, UI/documentation in **German**
- **Indentation:** 2 spaces (NO tabs)
- **Quotes:** Single quotes for strings
- **Line Length:** No strict limit, but keep lines readable
- **Semicolons:** Use consistently
- **ES6+:** Use modern JavaScript features

### Naming Conventions

```javascript
// Variables & Functions: camelCase
const userName = 'john';
function getUserData() { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_ENDPOINT = 'https://api.example.com';

// Classes: PascalCase
class UserManager { }
class PluginLoader { }

// Private Methods/Properties: Prefix with _
class MyClass {
  _privateMethod() { }
  _privateProperty = 'secret';
}

// Files: kebab-case
// user-manager.js, plugin-loader.js, tiktok-connector.js
```

### Logging

**ALWAYS** use Winston logger, **NEVER** use `console.log` in production code:

```javascript
const logger = require('./modules/logger');

// Correct
logger.info('Server started on port 3000');
logger.warn('TTS queue is full');
logger.error('Database connection failed', error);
logger.debug('Processing gift event', giftData);

// WRONG - Never do this!
console.log('Something happened');
```

### Error Handling

**ALWAYS** wrap async operations in try-catch blocks:

```javascript
async function myAsyncFunction() {
  try {
    const result = await someAsyncOperation();
    return result;
  } catch (error) {
    logger.error('Operation failed:', error);
    throw error; // Or return null, depending on use case
  }
}
```

### Configuration

**ALWAYS** set default values when configuration is missing:

```javascript
async init() {
  const defaultConfig = {
    enabled: true,
    threshold: 100,
    sounds: []
  };
  
  let config = this.api.getConfig('myPluginConfig');
  if (!config) {
    config = defaultConfig;
    this.api.setConfig('myPluginConfig', config);
  }
  
  this.config = { ...defaultConfig, ...config };
}
```

### Comments & Documentation

**JSDoc for public APIs:**
```javascript
/**
 * Connects to TikTok LIVE
 *
 * @param {string} username - TikTok username (without @)
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.processInitialData=true] - Process initial data
 * @returns {Promise<boolean>} - true on success, false on error
 * @throws {Error} - If username is invalid
 * @example
 * await connectToTikTok('user123');
 */
async function connectToTikTok(username, options = {}) {
  // ...
}
```

### Code Quality Checklist

Before submitting code:

- ✅ Winston logger used (no console.log)
- ✅ Error handling with try-catch
- ✅ Input validation and sanitization
- ✅ Configuration defaults set
- ✅ JSDoc comments added for public APIs
- ✅ Code follows style guidelines (2 spaces, single quotes)
- ✅ No secrets or API keys committed
- ✅ No breaking changes to plugin API

---

## 🌿 Git Workflow

### Branch Strategy

**Main Branch:**
- `main` - Production-ready code
- Protected, only via pull request

**Feature Branches:**
- `feature/<feature-name>` - New features
- `fix/<bug-name>` - Bug fixes
- `refactor/<component>` - Refactoring
- `docs/<section>` - Documentation

**Examples:**
```bash
feature/multi-language-support
fix/tts-queue-overflow
refactor/database-manager
docs/api-reference
```

### Workflow Steps

**1. Create feature branch:**
```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/my-new-feature
```

**2. Make changes:**
```bash
# Make your changes
# Test thoroughly

# Commit
git add .
git commit -m "Add: My new feature"
```

**3. Keep branch up to date:**
```bash
# Fetch upstream changes
git fetch upstream

# Merge main into your branch
git merge upstream/main

# Resolve conflicts if any
# Test again after merge!
```

**4. Push to your fork:**
```bash
git push origin feature/my-new-feature
```

**5. Open pull request:**
- Go to GitHub
- Click "Compare & Pull Request"
- Fill out PR template (see below)
- Submit for review

**6. Address review feedback:**
```bash
# Make requested changes
git add .
git commit -m "Update: Address review feedback"
git push origin feature/my-new-feature
```

**7. After merge, cleanup:**
```bash
git checkout main
git pull upstream main
git branch -d feature/my-new-feature
```

---

## 📝 Commit Conventions

### Format

```
<Type>: <Short description> (max 72 characters)

<Optional body: Detailed description>
- What was changed?
- Why was it changed?
- How was it implemented?

<Optional footer>
- Breaking changes: BREAKING CHANGE: ...
- Issue references: Closes #123
```

### Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `Add` | New features added | `Add: Multi-language support` |
| `Update` | Existing features extended | `Update: TTS with 20 new voices` |
| `Fix` | Bug fixes | `Fix: TTS queue overflow` |
| `Refactor` | Code refactoring (no functional change) | `Refactor: Database module` |
| `Docs` | Documentation | `Docs: Update API reference` |
| `Test` | Tests added/changed | `Test: Add unit tests for flows` |
| `Chore` | Build/CI changes | `Chore: Update dependencies` |
| `Style` | Code formatting | `Style: Fix indentation` |
| `Perf` | Performance improvements | `Perf: Optimize database queries` |

### Examples

**Good commits:**
```bash
git commit -m "Add: OSC-Bridge plugin for VRChat integration"

git commit -m "Fix: TTS queue overflow when 100+ messages
- Added max queue size limit (100 items)
- Oldest items are dropped when queue is full
- Added warning log when queue limit reached"

git commit -m "Update: Multi-Cam plugin with macro system
- Added macro support for multi-step actions
- Added cooldown system (per-user, global)
- Added safety limits (max switches per 30s)

Closes #42"
```

**Bad commits:**
```bash
git commit -m "fixes"  # Too short, no type
git commit -m "updated stuff"  # Too vague
git commit -m "asdfasdf"  # Meaningless
```

### Atomic Commits

**Rule:** One commit = One logical change

**Good:**
```bash
# Commit 1: Feature
git commit -m "Add: Google TTS support"

# Commit 2: Documentation
git commit -m "Docs: Update TTS configuration"
```

**Bad:**
```bash
# Everything in one commit
git commit -m "Add Google TTS and update docs and fix bug and refactor"
```

---

## 🔀 Pull Request Process

### PR Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bugfix (non-breaking change)
- [ ] New Feature (non-breaking change)
- [ ] Breaking Change (fix/feature with breaking changes)
- [ ] Documentation

## Changes in Detail
- Change 1
- Change 2
- Change 3

## Testing
How was this tested?
- [ ] Manual tests performed
- [ ] All existing tests pass
- [ ] New tests added

## Screenshots (if UI changes)
![Screenshot](url)

## Checklist
- [ ] Code follows project style guide
- [ ] Self-review performed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No warnings generated
- [ ] CHANGELOG.md updated (if necessary)

## Related Issues
Closes #123
```

### Review Criteria

**Code Quality:**
- ✅ Code is readable and well-documented
- ✅ No obvious bugs
- ✅ Error handling present
- ✅ Logging consistent

**Functionality:**
- ✅ Feature works as described
- ✅ No breaking changes (or documented)
- ✅ Edge cases considered

**Tests:**
- ✅ Manually tested
- ✅ Existing features not broken

**Documentation:**
- ✅ README/Wiki updated
- ✅ CHANGELOG updated
- ✅ Code comments present

---

## 🧪 Testing Guidelines

See `/infos/TESTING.md` for complete guidelines.

**Before submitting PR:**

1. **Manual Testing:**
   - Test the specific feature you changed
   - Test related features that might be affected
   - Test in a clean environment if possible

2. **Automated Tests (if infrastructure exists):**
   ```bash
   cd app
   npm test
   ```

3. **Verify no regressions:**
   - Existing features still work
   - No new errors in console
   - No performance degradation

---

## 📚 Documentation Requirements

### Code Documentation

**Add JSDoc comments for:**
- Public functions and classes
- Complex algorithms
- Non-obvious decisions

### Update Documentation

**When adding new features:**
1. Update `app/CHANGELOG.md`
2. Update `README.md` (if user-facing)
3. Update `app/wiki/` (if user-facing)
4. Add inline code comments for complex logic

**When fixing bugs:**
1. Update `app/CHANGELOG.md`
2. Add comments explaining the fix (if complex)

### CHANGELOG Format

```markdown
## [1.0.3] - 2025-11-12

### Added
- OSC-Bridge Plugin for VRChat integration
- Multi-Cam Switcher with macro system

### Changed
- TTS-Plugin: 20 new voices added
- Flow-Engine: Performance improvements

### Fixed
- TTS-Queue-Overflow when 100+ messages
- OBS-WebSocket-Reconnect bug
```

---

## 🚫 Common Mistakes to Avoid

### Never Do These Things

**1. Never Remove Features:**
- Don't delete existing functionality
- Don't break backward compatibility
- Only add features or fix bugs

**2. Never Use console.log:**
- Always use Winston logger
- `logger.info()`, `logger.error()`, etc.

**3. Never Commit Secrets:**
- No API keys, passwords, or tokens
- Use `.env` files for sensitive data
- Check `.gitignore` before committing

**4. Never Break Plugin System:**
- Don't change plugin lifecycle
- Don't modify PluginAPI without updating all plugins
- Document all API changes in CHANGELOG

**5. Never Leave Placeholders:**
- No TODOs in production code
- No commented-out code without explanation
- All code must be production-ready

**6. Never Skip Testing:**
- Test your changes thoroughly
- Test related features
- Test in clean environment

**7. Never Ignore Existing Patterns:**
- Follow existing code structure
- Use same naming conventions
- Match existing style

---

## 💡 Tips for Success

### Before You Start

1. **Read the documentation:**
   - `/infos/llm_start_here.md`
   - `/infos/ARCHITECTURE.md`
   - `/.github/copilot-instructions.md`

2. **Understand the codebase:**
   - Browse existing code
   - Look at similar features
   - Check plugin examples

3. **Check existing issues:**
   - Maybe someone already working on it
   - Maybe there's discussion about approach

### While Working

1. **Keep it simple:**
   - Make minimal changes
   - Follow existing patterns
   - Don't over-engineer

2. **Test frequently:**
   - Test as you code
   - Test edge cases
   - Test error conditions

3. **Document as you go:**
   - Add comments for complex code
   - Update relevant docs
   - Keep CHANGELOG up to date

### Before Submitting

1. **Self-review your code:**
   - Read through all changes
   - Check for typos and mistakes
   - Ensure style consistency

2. **Test thoroughly:**
   - Manual testing
   - Automated tests (if available)
   - Test in clean environment

3. **Update documentation:**
   - CHANGELOG.md
   - Code comments
   - User documentation (if needed)

---

## 🎯 Types of Contributions

### Bug Fixes

1. Search issues to see if already reported
2. Create issue if not exists
3. Fork and create fix branch
4. Write test to reproduce bug (if possible)
5. Fix the bug
6. Verify fix works
7. Submit PR with clear description

### New Features

1. Open issue to discuss feature first
2. Wait for approval/feedback
3. Fork and create feature branch
4. Implement feature following guidelines
5. Add tests if infrastructure exists
6. Update documentation
7. Submit PR with screenshots/examples

### Documentation

1. Fork repository
2. Make documentation changes
3. Check for broken links
4. Test code examples
5. Submit PR

### Plugin Development

1. Read `/infos/PLUGIN_DEVELOPMENT.md`
2. Follow plugin structure guidelines
3. Test plugin thoroughly
4. Add README.md for plugin
5. Submit PR or publish separately

---

## 📞 Questions or Issues?

- **Email:** loggableim@gmail.com
- **GitHub Issues:** https://github.com/Loggableim/ltth_desktop2/issues

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the CC-BY-NC-4.0 license.

---

Thank you for contributing to LTTH! Your contributions help make this tool better for everyone. 🚀
