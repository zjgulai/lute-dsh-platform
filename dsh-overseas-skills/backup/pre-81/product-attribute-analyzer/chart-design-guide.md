# Chart Design Guide

Reading this guide is a commitment to code. If you read this file, you should write code and execute it in next steps.

## Tool Selection for Beauty and Efficiency

**General Principle**: Use Seaborn first, enhance with Matplotlib when needed.

**Why Seaborn is Preferred:**
- **Professional default aesthetics**: Modern color palettes and styling out-of-the-box
- **Less code, better results**: Automatic handling of grids, ticks, fonts, and spacing
- **Built-in statistical visualizations**: Native support for distributions, regressions, and confidence intervals
- **Color-blind friendly palettes**: Scientific color schemes like `viridis`, `coolwarm`, `Set2`

**Tool Selection Guide:**

| Chart Type | Recommended Tool | Reason |
|------------|-----------------|--------|
| **Trend lines** | `sns.lineplot()` | Auto confidence intervals, unified styling |
| **Bar charts** | `sns.barplot()` | Color gradients, error bars, cleaner defaults |
| **Heatmaps** | `sns.heatmap()` | Optimized annotations, colorbars, borders |
| **Distributions** | `sns.histplot()` / `sns.kdeplot()` | Statistical visualization done right |
| **Scatter plots** | `sns.scatterplot()` | Better marker styling and legend handling |
| **Pie charts** | `plt.pie()` | Seaborn doesn't support; use Matplotlib |
| **Radar charts** | `plt.polar()` | Seaborn doesn't support; use Matplotlib |

---

## Best Practice Pattern

```python
import seaborn as sns
import matplotlib.pyplot as plt

# 1. Set global theme (affects all subsequent charts)
# ✅ Recommended: Light background for versatility
sns.set_theme(style='whitegrid', palette='husl')

# For dark theme (use sparingly):
# sns.set_theme(style='dark', palette='bright')
# plt.style.use('dark_background')

# 2. Use seaborn for main chart
fig, ax = plt.subplots(figsize=(12, 6))
sns.lineplot(data=df, x='month', y='value', marker='o', linewidth=2.5, color='#1f77b4')

# 3. Use matplotlib for fine-tuning
ax.fill_between(df['month'], df['value'], alpha=0.3, color='#1f77b4')
ax.annotate('Peak', xy=(peak_x, peak_y), xytext=(10, 20),
            textcoords='offset points',
            arrowprops=dict(arrowstyle='->', color='black'),
            fontsize=10, fontweight='bold')

plt.title('Chart Title', fontsize=14, fontweight='bold', pad=15)
plt.tight_layout()
plt.savefig('chart.png', dpi=150, bbox_inches='tight', facecolor='white')
```

---

## ⚠️ Important: Seaborn API Updates (v0.12.0+)

When using `palette` with barplot/other categorical plots, you MUST assign `hue` to avoid deprecation warnings:

```python
# ❌ Deprecated (will be removed in v0.14.0)
sns.barplot(x=values, y=categories, palette='viridis')

# ✅ Correct - assign hue and disable legend
sns.barplot(x=values, y=categories, hue=categories, palette='viridis', legend=False)

# ✅ Or use data parameter with DataFrame
sns.barplot(data=df, x='value', y='category', hue='category', palette='viridis', legend=False)
```

This applies to: `barplot`, `boxplot`, `violinplot`, `stripplot`, `swarmplot`, etc.

---

## Popular Seaborn Palettes

- `'viridis'`: Perceptually uniform, color-blind friendly (blues to yellows)
- `'coolwarm'`: Diverging palette (blue-white-red)
- `'Set2'`: Qualitative, pastel colors for categories
- `'muted'`: Softer version of default colors
- `'husl'`: Evenly spaced hues, good for categorical data
- `'bright'`: Saturated colors (best with dark backgrounds)

---

## Theme Configuration Examples

```python
# ✅ Best for reports and presentations (DEFAULT CHOICE)
sns.set_theme(style='whitegrid', palette='husl')
# Clean white background with subtle grid

# ✅ Minimal clean look
sns.set_theme(style='white', palette='muted')
# Pure white, no grid

# ✅ Data-heavy scientific look
sns.set_theme(style='ticks', palette='Set2')
# White with axis ticks on all sides

# ⚠️ Dark theme (use only when appropriate)
sns.set_theme(style='dark', palette='bright')
plt.style.use('dark_background')
# Dark background - not print-friendly
```

---

## Chart Consolidation & Simplicity

- **Consolidate Curves**: Combine related data series (e.g., trends for 3 different products) into ONE chart to enable comparison. Do not generate separate charts for each item.
- **Avoid Trivial Charts**: If the data is simple (e.g., single comparison, few data points), use a Table or Text description instead of a chart.
- **File Structure**: Keep distinct *types* of analysis (e.g., Trend vs Price) in separate files, but within each analysis, consolidate data.

---

## Chart Type Selection by Data Purpose

| Data Type | Recommended Chart | When to Use |
|-----------|-------------------|-------------|
| Time series (trends) | Line chart with area fill | Google Trends, monthly sales, search volume over time |
| Part-to-whole | Pie chart or donut chart | Market share, review sentiment breakdown, feature distribution |
| Category comparison | Horizontal bar chart | Growth rates, ratings comparison (use color to encode positive/negative) |
| Multi-dimensional | Radar chart (polar) | Comparing products/categories across multiple attributes |
| Correlation | Scatter plot | Search volume vs. sales, price vs. rating |
| Distribution | Stacked area chart | Monthly category sales composition, market share evolution |

---

## Visual Styling Principles

### Background Theme Selection

| Background | When to Use | Pros | Cons |
|------------|------------|------|------|
| **White** (`default` or `'whitegrid'`) | Reports, presentations, printing | Professional, print-friendly, universal | May feel plain |
| **Light Gray** (`'whitegrid'` + custom) | Web dashboards, general use | Modern, easy on eyes | Requires good color contrast |
| **Dark** (`'dark_background'`) | Tech/data-heavy contexts, slides | Dramatic, highlights colors | Not print-friendly, hard to embed in documents |

**Recommendation**: 
- **Default to white/light backgrounds** for maximum versatility (embedding in reports, presentations, printing)
- Use dark backgrounds only when specifically requested or for pure-digital contexts

### Basic Styling Checklist

- Define a cohesive color palette: pick 5-6 distinct colors with good contrast
- Add area fill under line charts (`fill_between`) for visual weight
- Mark peak values with annotations and arrows to highlight key data points
- Use edge colors on markers/bars for better separation (white edge for dark bg, dark edge for light bg)
- Keep legends readable but not dominant
- Ensure text is legible against background (auto-handled by seaborn themes)

---

## Data Storytelling Elements

- Always include a title that states the insight, not just the data type (e.g., "1920s Gatsby Flapper +150% Growth" instead of "Growth Rate Chart")
- Use color encoding for meaning: green/teal for positive, red/coral for negative
- Add insight callouts in charts (e.g., "Peak: 72" annotation on trend line)
- For growth rate charts, add a zero-line reference and display percentage values on bars

---

## Chart-Specific Tips

- **Pie charts**: Use `explode` to highlight the largest segment; limit to 3-5 slices
- **Bar charts**: Sort by value for easier scanning; horizontal bars work better for long labels
- **Trend lines**: Use markers at data points; add a subtle shadow/glow effect for emphasis
- **Radar charts**: Normalize values to 0-1 scale for fair comparison across different metrics

---

## Chart Diversity Requirements

| Data Pattern | Method |
|--------------|--------|
| Market share / category distribution | `ax.pie(...)` |
| Multi-attribute comparison (3+ dimensions) | `polar=True` radar chart |
| Composition over time | `ax.stackplot(...)` |
| Correlation (x vs y) | `ax.scatter(...)` |
| Ranked comparison | `ax.barh(...)` |
| Time series trend | `ax.plot()` + `ax.fill_between(...)` |

**IMPORTANT**: Do NOT default to only bar/line charts. Apply as many chart types as the data supports (pie/radar/scatter/stackplot, etc.).

