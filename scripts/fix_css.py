import re

with open('static/style.css', 'r') as f:
    css = f.read()

# 1. Replace the entire :root block
root_pattern = re.compile(r':root\s*\{[^}]+\}', re.MULTILINE | re.DOTALL)
new_root = """:root {
    /* Surfaces */
    --bg-primary: #f8fafc;
    --bg-secondary: #f1f5f9;
    --bg-elevated: #ffffff;
    --bg-card: #ffffff;
    --bg-card-hover: #f1f5f9;
    --bg-glass: rgba(255, 255, 255, 0.85);

    /* Borders */
    --border-subtle: #f1f5f9;
    --border-default: #e2e8f0;
    --border-hover: #cbd5e1;
    --border-focus: rgba(79, 70, 229, 0.4);

    /* Text */
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-tertiary: #94a3b8;
    --text-inverse: #ffffff;

    /* Accent — Indigo */
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --accent-muted: rgba(79, 70, 229, 0.08);
    --accent-glow: rgba(79, 70, 229, 0.15);

    /* Semantic */
    --success: #10b981;
    --success-muted: rgba(16, 185, 129, 0.1);
    --warning: #f59e0b;
    --warning-muted: rgba(245, 158, 11, 0.1);
    --danger: #ef4444;
    --danger-muted: rgba(239, 68, 68, 0.1);

    /* Gradients */
    --gradient-accent: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
    --gradient-surface: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025);
    --shadow-glow: 0 0 0 transparent; /* No glow */

    /* Typography */
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;

    /* Layout */
    --sidebar-width: 300px;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 20px;
    --radius-full: 9999px;

    /* Transitions */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --duration-fast: 150ms;
    --duration-normal: 250ms;
    --duration-slow: 400ms;
}"""
css = root_pattern.sub(new_root, css, count=1)

# 2. Replace hardcoded rgba(255, 255, 255, X) to dark matching for hover states/badges on light mode.
# E.g. background: rgba(255, 255, 255, 0.02); -> background: var(--bg-card-hover);
css = css.replace("rgba(255, 255, 255, 0.02)", "var(--bg-card-hover)")
css = css.replace("rgba(255, 255, 255, 0.04)", "var(--bg-secondary)")
css = css.replace("rgba(255, 255, 255, 0.05)", "var(--bg-secondary)")
css = css.replace("rgba(255, 255, 255, 0.08)", "rgba(0,0,0,0.1)")
css = css.replace("rgba(255, 255, 255, 0.15)", "rgba(0,0,0,0.2)")

css = css.replace("rgba(129, 140, 248, 0.2)", "rgba(79, 70, 229, 0.2)")
css = css.replace("rgba(129, 140, 248, 0.3)", "rgba(79, 70, 229, 0.3)")
css = css.replace("0 0 50px var(--accent-glow)", "0 10px 15px -3px var(--accent-muted)")
css = css.replace("0 0 60px var(--accent-glow)", "0 10px 15px -3px var(--accent-muted)")

# Fix shimmering strength-bar from white to accent
css = css.replace("rgba(255,255,255,0.2)", "rgba(255,255,255,0.4)") 

with open('static/style.css', 'w') as f:
    f.write(css)

print("style.css rewritten!")
