---
name: inventory-demand-forecaster
title: "库存需求预测器"
description: "- Trigger: Predict future inventory needs and calculate reorder points using historical data and safety stock buffers to prevent stockouts."
category: business-operations
risk: safe
source: curated
date_added: "2026-03-12"
tags: [demand-forecasting, inventory-planning, seasonality, safety-stock, reorder-points, stockout-prevention]
platforms: [shopify, woocommerce, bigcommerce, custom]
difficulty: advanced
disable-model-invocation: true
---


# Forecast Inventory Demand and Safety Stock

## Overview

Demand forecasting uses historical sales data, seasonal patterns, and lead times to predict future inventory requirements. Effective forecasting ensures that capital is not tied up in excess stock while minimizing the risk of lost sales due to stockouts. This skill focuses on the mathematical foundations of inventory planning and platform-native tools for managing replenishment.

## When to Use This Skill

- When chronic stockouts or overstock situations indicate that current reorder points are inaccurate.
- When planning inventory for seasonal peaks (e.g., Q4 holiday season, back-to-school).
- When integrating supplier lead times into purchase order workflows.
- When you have at least 6 months of sales history to extract meaningful demand patterns.
- When launching new SKUs and needing a framework to estimate initial stock levels.

## Core Instructions

### Step 1: Data Quality and Preparation

Accurate forecasting depends on clean historical data. Before performing any calculations:

1.  **Exclude Cancelled/Refunded Orders:** Ensure these are removed from sales totals to avoid overestimating baseline demand.
2.  **Tag Abnormal Spikes:** Flag flash sales, influencer-driven spikes, or one-time promotional events as "outliers" so they don't inflate the baseline.
3.  **Minimum History:** 
    *   **6 Months:** Minimum required for basic seasonal detection.
    *   **12-24 Months:** Required for year-over-year (YoY) trend analysis.

### Step 2: Manual Calculation Formulas

Use these formulas to establish baseline reorder logic for any SKU.

#### 1. Average Daily Demand (ADD)
`ADD = Total units sold in period / Number of days in period`

#### 2. Safety Stock (SS)
Safety stock protects against variability in demand and lead time.
`Safety stock = (Maximum daily demand – Average daily demand) × Lead time in days`

#### 3. Reorder Point (ROP)
The inventory level at which a new purchase order should be placed.
`Reorder point = (Average daily demand × Lead time in days) + Safety stock`

**Full Example Calculation:**
*   Average daily demand = 5 units
*   Lead time = 14 days
*   Maximum daily demand = 8 units
*   **Safety stock** = (8 – 5) × 14 = 42 units
*   **Reorder point** = (5 × 14) + 42 = 112 units

### Step 3: Platform-Native Tools

#### Shopify
*   **Shopify Analytics:** Go to **Analytics → Reports → Inventory**.
*   **Days of Inventory Remaining Report:** Use this report to see how many days of stock are left based on current sell-through rates.
*   **Sales Over Time:** Group by product to identify monthly demand trends.

#### WooCommerce
*   **WooCommerce Analytics:** Go to **Analytics → Stock** to view current levels and low-stock indicators.
*   **Settings:** Configure low-stock thresholds in **WooCommerce → Settings → Products → Inventory**.

#### BigCommerce
*   **Built-in Alerts:** Go to **Products → [Product] → Inventory** and set "Low stock level" to receive email notifications when stock hits a specific threshold.

### Step 4: Seasonal Index Methodology

For seasonal products, apply a multiplier to the baseline forecast:
1.  **Calculate Monthly Average:** (Total Annual Sales / 12).
2.  **Calculate Seasonal Index:** (Sales for Month X / Monthly Average).
    *   *Example:* If Dec sales are 300 units and avg month is 100, the Dec Index is 3.0.
3.  **Apply to Forecast:** Multiply your expected ADD by the Seasonal Index for the upcoming period.

### Step 5: Decision Criteria & Deepening

#### ABC Inventory Classification
Not all SKUs deserve the same forecasting effort. Use the 80/20 rule:
*   **Class A (High Value):** Top 20% of SKUs generating 80% of revenue. Use tight safety stock and review weekly.
*   **Class B (Moderate):** Next 30% of SKUs generating 15% of revenue. Review bi-weekly.
*   **Class C (Low Value):** Remaining 50% of SKUs generating 5% of revenue. Use large safety buffers and review monthly.

#### Handling New SKUs (No History)
For products with no sales history, use the following hierarchy:
1.  **Proxy Data:** Use the historical ADD of a similar product in the same category.
2.  **Market Intelligence:** Estimate based on total addressable market and initial marketing spend.
3.  **Conservative Buffer:** Start with a small batch (e.g., 30 days of supply) and adjust after the first 14 days of live data.

#### Overstock vs. Understock Cost Calculation
Use this to determine how aggressive your safety stock should be:
*   **Cost of Understock (Stockout):** (Units Lost × Gross Margin per Unit) + Potential Customer Acquisition Cost (if they switch to a competitor).
*   **Cost of Overstock (Carrying):** (Average Inventory Value × Holding Rate [typically 15-25% per year]).
*   *Decision:* If Understock Cost > Overstock Cost, increase Service Level (Safety Stock).

## Best Practices

- **Account for Pending Orders:** Always subtract "Quantity on Purchase Order" from your "Recommended Order Quantity" to avoid double-ordering.
- **Lead Time Tracking:** Track actual vs. quoted lead times. If a supplier quotes 14 days but averages 20, use 20 in your ROP formula.
- **Service Level Targets:** Standardize service levels (e.g., 95% for top sellers, 85% for slow movers).

## Common Pitfalls

| Problem | Solution |
|---------|----------|
| Forecast ignores bulk returns | Use net sales (Sales - Returns) for ADD calculations to avoid over-ordering. |
| Promotion-driven spikes cause over-ordering | Manually "smooth" sales data during flash sale periods when calculating baseline ADD. |
| Supplier stockouts | Maintain higher safety stock for vendors with unreliable fulfillment history. |
