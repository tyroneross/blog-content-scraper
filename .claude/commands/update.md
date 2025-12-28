---
description: "Update claude-code-debugger to the latest version"
allowed-tools: ["Bash"]
---

Check for and install updates to the debugging memory system:

```bash
npm view @tyroneross/claude-code-debugger version
npx @tyroneross/claude-code-debugger@latest --version
```

If a newer version is available, inform the user and suggest:

```bash
npm update @tyroneross/claude-code-debugger
```

Or for global installations:

```bash
npm update -g @tyroneross/claude-code-debugger
```
