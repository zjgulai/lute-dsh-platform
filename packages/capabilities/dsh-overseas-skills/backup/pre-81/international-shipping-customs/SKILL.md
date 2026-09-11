---
name: international-shipping-customs
title: "国际货运与清关"
description: "- Set up cross-border logistics including HS code classification, duties/taxes (DDP vs DDU) configuration, and customs documentation to ensure seamless global delivery."
category: fulfillment-shipping
risk: critical
source: curated
date_added: "2026-03-12"
tags: [international-shipping, customs, duties, taxes, restricted-items, cross-border, HS-codes, DDP, DDU]
triggers: ["international shipping", "customs forms", "duties and taxes", "cross-border shipping", "HS codes", "restricted items", "DDP DDU", "import duties"]
platforms: [shopify, woocommerce, bigcommerce, custom]
difficulty: advanced
disable-model-invocation: true
---


# Configure International Shipping and Customs

## Overview

International shipping requires precise data management to pass through global customs without delays or unexpected costs. This involves classifying products with HS (Harmonized System) codes, calculating "landed cost" (duties and taxes) at checkout, and generating accurate commercial invoices. While carrier aggregators (like ShipStation or Easyship) simplify label printing, the underlying data must be configured correctly in your ecommerce platform.

## When to Use This Skill

- When expanding from domestic-only sales to international markets.
- When offering **Delivered Duty Paid (DDP)** to show customers the full final cost at checkout and avoid "bill on delivery" surprises.
- When building a product catalog that requires standardized HS codes for tariff classification.
- When screening orders for restricted items (e.g., electronics with lithium batteries) before they reach the border.
- When automating the generation of Commercial Invoices and CN22/23 customs forms.

## Core Instructions

### Step 1: Platform-Native Customs Setup

| Platform | Native Configuration | Key Action |
|----------|----------------------|------------|
| **Shopify** | Shopify Markets | Go to **Settings → Markets** to enable international zones, local pricing, and duties collection. |
| **WooCommerce** | Shipping Settings | Configure **Shipping Zones** for international regions; use custom fields or plugins to store HS codes per product. |
| **BigCommerce** | Multi-Currency & Tax | Set up international currencies; enter HS codes in the **Customs Information** section of the product editor. |
| **Custom** | API-First | Build an integration to a duties-calculation service (e.g., Zonos or Avalara) and a label aggregator (e.g., EasyPost). |

### Step 2: Product Classification (HS Codes)

HS codes are 6–10 digit numbers used by customs to determine duty rates. Missing or incorrect codes lead to seizures or overpayment.

**Common HS Codes for Ecommerce:**
- `6109.10`: Cotton T-shirts
- `6404.11`: Athletic footwear
- `8471.30`: Laptops/Tablets
- `9503.00`: Toys/Games
- `3304.99`: Cosmetics/Skincare

**Tools for Lookup (by name):**
- **Zonos Hello**: Suggested HS codes based on descriptions.
- **Avalara TariffFinder**: Global tariff search.
- **Schedule B Search Engine**: Official US Census Bureau export classification.

### Step 3: DDP vs. DDU Strategy

- **DDP (Delivered Duty Paid)**: You collect duties/taxes at checkout and pay them to the carrier. This provides the best customer experience and highest conversion.
- **DDU (Delivered Duty Unpaid)**: The customer receives a bill from the carrier/customs before delivery. This often leads to high refusal rates and return shipping costs.

**International De Minimis Thresholds (Duty-Free Limits):**
- **USA**: $800
- **UK**: £135
- **EU**: €150 (VAT still applies from €0)
- **Australia**: AUD $1,000

### Step 4: Technical Restricted Items Screening (TypeScript)

For custom storefronts, use an HS-code-based screening layer to prevent prohibited exports.

```typescript
// Screen cart for restricted items before allowing checkout
async function screenForRestrictions(params: {
  orderLines: { productId: string; hsCode: string }[];
  destinationCountry: string;
}) {
  const blockedItems: string[] = [];

  // Define restricted HS prefixes by country
  const RESTRICTIONS: Record<string, string[]> = {
    AU: ['9305'],    // Firearm parts
    IN: ['2207'],    // Alcohol
    CN: ['8517'],    // Specific electronics requiring certification
  };

  const countryRestrictions = RESTRICTIONS[params.destinationCountry] || [];

  for (const line of params.orderLines) {
    const isBlocked = countryRestrictions.some(prefix => line.hsCode.startsWith(prefix));
    if (isBlocked) blockedItems.push(line.productId);
  }

  return { 
    allowed: blockedItems.length === 0, 
    blockedItems 
  };
}
```

## Deepening: Customs Documentation & Logistics

### Essential Customs Documentation
1. **Commercial Invoice**: The most important document. Must include:
   - Full Sender/Receiver details (including phone numbers).
   - Detailed item descriptions (e.g., "100% Cotton Men's T-shirt" rather than "Item #123").
   - HS Code and Country of Origin per line item.
   - Total declared value and currency.
2. **CN22/CN23**: Used for postal shipments (USPS, Royal Mail). CN22 is for values < $400; CN23 is for > $400.
3. **Certificate of Origin (COO)**: Required for certain trade agreements (like USMCA) to qualify for reduced duty rates.

### Carrier Selection Strategy
- **Express (DHL Express, FedEx, UPS)**: Best for DDP shipments and high-value goods. They handle their own customs brokerage, ensuring 3-5 day global delivery.
- **Postal (USPS, Royal Mail, La Poste)**: Cost-effective for low-value, lightweight items. Usually DDU only; slower clearance (7-21 days).
- **Hybrid (Passport, APC, DHL eCommerce)**: Specialized ecommerce carriers that batch shipments and pre-clear customs, offering a balance of cost and speed.

### Duty Drawback Eligibility
If an international customer returns an item, you may be eligible for a **Duty Drawback**—a refund of the duties paid upon import. This requires proof that the item was exported and subsequently re-imported as a return. Maintain digital records of both the original export commercial invoice and the return shipping label.

## Best Practices

- **Required Phone Numbers**: Make the phone number field mandatory for all international checkout addresses; carriers cannot clear customs without a recipient contact.
- **Generic Descriptions**: Use clear, simple descriptions (e.g., "Wooden kitchen chair") instead of marketing names (e.g., "The Artisan Throne") on customs forms.
- **Weight Accuracy**: Ensure product weights are accurate to within 10 grams in your platform; weight discrepancies between the label and the physical box can trigger customs audits.
- **Monitor Regulations**: Track changes like the EU’s Import One-Stop Shop (IOSS) requirements to ensure VAT compliance for low-value goods.

## Common Pitfalls

| Problem | Root Cause / Solution |
|---------|----------|
| **Customs Seizure** | Missing HS code or prohibited item. **Solution**: Use Step 4 screening logic at checkout. |
| **Duty Bill Surprise** | Using DDU without clear warnings. **Solution**: Switch to DDP or add a clear "Duties not included" notice at checkout. |
| **Returned to Sender** | Missing recipient phone number. **Solution**: Validate phone number presence for all non-domestic orders. |
| **Trade Agreement Denial** | Country of Origin (COO) mismatch. **Solution**: Ensure the `country_of_origin` field in your platform reflects the place of manufacture, not your warehouse location. |
