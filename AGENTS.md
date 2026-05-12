## Local Runtime

This project uses `nvm`, and the default frontend runtime is Node.js 22.

Before running commands in `frontend_react`, load nvm and select Node 22:

```sh
source ~/.nvm/nvm.sh
nvm use 22
```

Prefer running frontend commands from `frontend_react` after activating that version.

## Project Orientation

Before making frontend changes, use `docs/项目结构文档.md` to orient to the existing module layout, then use `rg` to find the exact implementation.

Common frontend anchors:

- AI chat: `frontend_react/src/components/AIChatWindow.tsx`
- Editor page shell: `frontend_react/src/views/EditorPage.tsx`
- Editor state and commands: `frontend_react/src/hooks/useEditor.tsx`
- Common select/dropdown: `frontend_react/src/components/common/Select.tsx`
- UI rules: `docs/UI设计规范文档.md`
