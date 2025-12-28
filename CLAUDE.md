

## Debugging Memory

This project uses @tyroneross/claude-code-debugger for debugging memory.

**Automatic behavior:**
- Past debugging sessions are stored and indexed
- Similar incidents surface automatically when investigating bugs
- Patterns are extracted from repeated issues

**Commands:**
- `/debugger "symptom"` - Search past bugs for similar issues
- `/debugger` - Show recent bugs, pick one to debug
- `/debugger-status` - Show memory statistics
- `/debugger-scan` - Scan recent sessions for debugging work

The system learns from your debugging sessions automatically.
