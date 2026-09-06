---
name: email-automation-flow-builder
title: "电子邮件自动化流程构建器"
description: "- Build automated email sequences for welcome, post-purchase, browse abandonment, and win-back to maximize customer lifetime value. 【需Klaviyo】"
disable-model-invocation: true
---


# Build Lifecycle Email Automation Flows


> ⚠️ **环境说明（DSH）**：本机未接入 Klaviyo。请产出完整的邮件流程文案与触发规则清单，由用户在 Klaviyo 后台搭建；勿调用 API。

## Overview

Lifecycle email automation uses behavioral triggers to send personalized messages at the exact moment a customer is most likely to engage. Unlike "blast" campaigns, automated flows achieve 3–5x higher open rates and drive consistent, hands-off revenue.

The goal of a lifecycle strategy is to move a customer through the stages of the funnel: from **Subscriber** (Welcome) to **Browser** (Abandonment) to **Buyer** (Post-Purchase) and finally to **Repeat Advocate** (Win-back).

## When to Use This Skill

- When a store has high traffic but low conversion (Browse Abandonment).
- When the "One-Time Buyer" rate is over 70% (Post-Purchase & Win-back).
- When manual email campaigns take too much team time for low return.
- When you need to scale personalized communication without increasing headcount.

## The Four Core Automation Flows

### 1. The Welcome Series
- **Goal**: Introduce the brand and convert the first-time subscriber into a buyer.
- **Trigger**: New subscriber joins the list (via popup or footer).
- **Structure**:
    - **Email 1 (Immediate)**: Deliver the incentive (e.g., 10% off), introduce the brand mission, and set expectations.
    - **Email 2 (Day 2)**: Showcase "Best Sellers" or "Customer Favorites" to build trust.
    - **Email 3 (Day 5)**: Social proof—user-generated content (UGC), reviews, or press mentions.
- **Exit Condition**: Exit flow if a purchase is made.

### 2. Browse Abandonment
- **Goal**: Re-engage high-intent visitors who viewed a product but didn't add to cart.
- **Trigger**: "Viewed Product" event (limited to known subscribers).
- **Structure**:
    - **Email 1 (30–60 Mins Later)**: A helpful nudge. "Still thinking about [Product Name]?" Include a large image of the item.
    - **Email 2 (24 Hours Later)**: Show alternative products in the same category in case the first one wasn't a perfect fit.
- **Nuance**: Set a "Frequency Cap" so this flow only triggers once every 7 days per user to avoid spamming.

### 3. Post-Purchase Nurture
- **Goal**: Reduce buyer's remorse, minimize returns, and encourage a second purchase.
- **Trigger**: "Placed Order" event.
- **Structure**:
    - **Email 1 (Immediate)**: Order confirmation with "How to use/style" or "Care instructions" content.
    - **Email 2 (Day 7)**: Check-in. "How is your [Product]?" Link to a help center or FAQ.
    - **Email 3 (Day 21)**: The Review Request. Incentivize with a small discount for their *next* order.
    - **Email 4 (Day 30–45)**: The "Next-Best-Product" cross-sell based on what they just bought.

### 4. The Win-Back / Re-engagement Flow
- **Goal**: Reactivate lapsed customers before they churn permanently.
- **Trigger**: 60, 90, or 120 days since the last purchase (category dependent).
- **Structure**:
    - **Email 1**: "We miss you." Show new arrivals since their last visit.
    - **Email 2**: "What's new?" Content-led update (blog post, new collection story).
    - **Email 3**: The "Last Chance" offer. A deeper discount (15–20%) with a 48-hour expiration.

## Logic and Filtering Best Practices

To ensure a professional customer experience, apply these universal filters to your flows:

1.  **The Master Exit Filter**: Every flow (except Post-Purchase) must have a filter: `"Has NOT placed an order since starting this flow"`. This prevents "Win-back" or "Browse" emails from being sent to someone who just bought.
2.  **Conditional Splits by Value**: Route high-LTV customers to a separate path with more personalized, non-discount-heavy messaging (e.g., a "VIP Concierge" email).
3.  **Smart Sending (Frequency Caps)**: Enable a 16–24 hour "Quiet Window." If a customer triggers a Browse Abandonment email but received a Weekly Newsletter 2 hours ago, the automated email should be skipped.

## Benchmarks for Success

Monitor these metrics within your Email Service Provider (ESP) to optimize performance:

| Flow Type | Revenue Per Recipient (RPR) | Target Open Rate | Target Click Rate |
|-----------|-----------------------------|------------------|-------------------|
| **Welcome Series** | $2.00 – $5.00 | 45% – 60% | 8% – 12% |
| **Browse Abandonment** | $1.50 – $4.00 | 40% – 50% | 10% – 15% |
| **Post-Purchase** | $0.50 – $1.50 | 50% – 70% | 5% – 8% |
| **Win-Back** | $0.20 – $0.80 | 25% – 35% | 2% – 5% |

## Deepening: Deliverability and Maintenance

### 1. The Suppression Strategy
Protect your sender reputation by "Sunsetting" unengaged profiles.
- **Rule**: If a contact hasn't opened an email in 180 days, move them to a "Sunset" segment.
- **Action**: Send one final "Re-permission" email ("Do you still want to hear from us?"). If no response, **suppress** them from all future sends. This ensures your emails land in the "Primary" tab for active users.

### 2. Frequency Caps (Inbox Fatigue)
High-volume stores must limit the number of touchpoints.
- **Implementation**: Set a Global Frequency Cap of no more than 4 emails per week per profile (including both automated flows and manual campaigns).

### 3. Technical Deliverability Checklist
Ensure these are configured in your domain settings to avoid the spam folder:
- **SPF (Sender Policy Framework)**: Authorizes your ESP to send on your behalf.
- **DKIM (DomainKeys Identified Mail)**: Digitally signs your emails to prove they haven't been tampered with.
- **DMARC**: Tells receiving servers how to handle emails that fail SPF or DKIM.
- **Dedicated Sending Domain**: As you scale (over 50k subscribers), move from a shared ESP domain to a private branded domain (e.g., `mail.yourbrand.com`).
