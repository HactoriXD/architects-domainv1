# Contributing to Architect's Domain

Thank you for your interest in improving Architect's Domain! This project is built for power users who value privacy, flexibility, and control over their AI workflows.

## How to Contribute

### Reporting Issues
- Use the GitHub Issues tab
- Include steps to reproduce, expected behavior, and screenshots if possible
- Label appropriately (`bug`, `enhancement`, `documentation`, `good first issue`)

### Suggesting Features
We love bold ideas! Open an issue with the `enhancement` label and describe:
- The problem it solves
- How it fits the local-first + BYOAK philosophy
- Any similar tools or prior art

### Code Contributions
1. Fork the repository
2. Create a feature branch from `main` (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test thoroughly (especially streaming, provider switching, and memory injection)
5. Submit a Pull Request

## Development Setup

```bash
git clone https://github.com/HactoriXD/architects-domain.git
cd architects-domain
node server.js
# Open http://localhost:3000
```

### Key Files
- `index.html` — Main application
- `scripts/` — Core logic (state, providers, streaming, memory, etc.)
- `styles/` — All CSS

### Code Style
- Vanilla JavaScript (no heavy frameworks)
- Keep modules small and focused
- Prefer clarity and hackability over clever abstractions
- Comment complex logic, especially around streaming and memory injection

## Good First Issues
Look for issues labeled `good first issue`. These are great for new contributors.

## License
By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?
Open a discussion or reach out via issues. We're building this together.

**Let's make the best local AI workstation possible.**