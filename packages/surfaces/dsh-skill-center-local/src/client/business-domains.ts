/**
 * Business domain grouping (LUTE skill center localization).
 *
 * The panel groups skills by business domain instead of the raw filesystem
 * source levels. The mapping is a static table keyed by skill `name`
 * (kebab-case, matching ~/.dsh/skills entries); unmapped skills fall into
 * the "other" bucket which keeps the raw source-level grouping as a fallback.
 */

export interface BusinessDomain {
  /** Stable domain key (also the locale key suffix, e.g. "domain.sourcing"). */
  key: string
  /** Emoji/icon shown before the domain title. */
  icon: string
  /** Order in the panel (ascending). */
  order: number
}

/** Panel domain list in display order. */
export const DOMAINS: BusinessDomain[] = [
  { key: 'sourcing', icon: '🛒', order: 0 },
  { key: 'research', icon: '🔍', order: 1 },
  { key: 'marketing', icon: '✍️', order: 2 },
  { key: 'operations', icon: '📦', order: 3 },
  { key: 'analytics', icon: '📊', order: 4 },
  { key: 'knowledge', icon: '🧠', order: 5 },
  { key: 'visual', icon: '🎨', order: 6 },
  { key: 'skill-tools', icon: '🛠️', order: 7 },
] as const

/** Unmapped skills land here (kept last). */
export const DOMAIN_OTHER = 'other'

/** skill name (kebab) -> domain key. */
const NAME_TO_DOMAIN: ReadonlyMap<string, string> = new Map<string, string>([
  // sourcing
  ['bestseller-pattern-decoder', 'sourcing'],
  ['cross-border-category-feasibility', 'sourcing'],
  ['cross-border-selection', 'sourcing'],
  ['market-insight-product-selection', 'sourcing'],
  ['market-viability-logic-auditor', 'sourcing'],
  ['product-attribute-analyzer', 'sourcing'],
  ['product-research-matrix', 'sourcing'],
  ['scenario-driven-product-scout', 'sourcing'],
  ['trend-stage-timing-analyzer', 'sourcing'],
  // research
  ['amazon-competitor-monitor', 'research'],
  ['amazon-sorftime-research', 'research'],
  ['brand-mention-tracking', 'research'],
  ['company-research', 'research'],
  ['competitor-alternative-analysis', 'research'],
  ['competitor-profiling', 'research'],
  ['cross-border-intel-radar', 'research'],
  ['customer-voice-analyzer', 'research'],
  ['icp-profiler', 'research'],
  ['jtbd-analyzer', 'research'],
  ['llm-tech-research', 'research'],
  ['single-post-intel-mining', 'research'],
  ['voc-sentiment-analyzer', 'research'],
  ['web-scraping-plan-designer', 'research'],
  // marketing
  ['amazon-ppc-campaign-manager', 'marketing'],
  ['brand-voice-glossary', 'marketing'],
  ['cold-email', 'marketing'],
  ['copywriting', 'marketing'],
  ['ecommerce-marketing', 'marketing'],
  ['ecommerce-seo-optimizer', 'marketing'],
  ['email-automation-flow-builder', 'marketing'],
  ['geo-optimizer', 'marketing'],
  ['marketing-content-suite', 'marketing'],
  ['multilingual-seo', 'marketing'],
  ['outreach-automation', 'marketing'],
  ['paid-advertising', 'marketing'],
  ['seo-competitor-analysis', 'marketing'],
  ['seo-controller', 'marketing'],
  ['seo-page-audit', 'marketing'],
  ['social-content', 'marketing'],
  // operations
  ['amazon-listing-expert', 'operations'],
  ['amz-product-optimizer', 'operations'],
  ['ecommerce-quarterly-strategy', 'operations'],
  ['etsy-seo-optimizer', 'operations'],
  ['gtm-strategy-planning', 'operations'],
  ['international-shipping-customs', 'operations'],
  ['inventory-demand-forecaster', 'operations'],
  ['launch-strategy', 'operations'],
  ['multi-platform-listing-generator', 'operations'],
  ['optimize-ecommerce-page-conversion', 'operations'],
  ['shipment-tracking', 'operations'],
  ['supplier-evaluation', 'operations'],
  ['supply-chain-controller', 'operations'],
  ['tech-pack-generator', 'operations'],
  // analytics
  ['ecommerce-analytics-controller', 'analytics'],
  ['ecommerce-business-insights', 'analytics'],
  ['ecommerce-csv-processing', 'analytics'],
  ['ecommerce-daily-report', 'analytics'],
  ['ecommerce-ml-modeling-advisor', 'analytics'],
  ['ecommerce-monthly-review', 'analytics'],
  ['ecommerce-price-monitor', 'analytics'],
  ['performance-tracking', 'analytics'],
  ['platform-price-monitor', 'analytics'],
  ['product-data-deep-analysis', 'analytics'],
  // knowledge
  ['anchor-text-splitter', 'knowledge'],
  ['file-history-manager', 'knowledge'],
  ['knowledge-extraction-expert', 'knowledge'],
  ['knowledge-similarity-analyzer', 'knowledge'],
  ['mece-knowledge-extractor', 'knowledge'],
  ['semantic-bucketer', 'knowledge'],
  ['semantic-density-analyzer', 'knowledge'],
  ['semantic-doc-chunker', 'knowledge'],
  ['terminology-standardizer', 'knowledge'],
  // visual
  ['ad-creative', 'visual'],
  ['ai-product-designer', 'visual'],
  ['brand-logo-designer', 'visual'],
  ['viral-video-analyzer', 'visual'],
  // skill-tools
  ['skill-creator', 'skill-tools'],
  ['skill-evaluator', 'skill-tools'],
  ['skill-family-manager', 'skill-tools'],
  ['skill-optimizer', 'skill-tools'],
  ['skill-structure-doctor', 'skill-tools'],
])

/**
 * Resolve the business domain for a skill name; unmapped names return
 * DOMAIN_OTHER. Unknown names can still be passed in and will land in
 * "other" so the panel never drops a skill.
 */
export function domainOf(name: string): string {
  return NAME_TO_DOMAIN.get(name) ?? DOMAIN_OTHER
}
