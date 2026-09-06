#!/usr/bin/env python3
"""
社媒数据收集脚本
支持多平台: Twitter, Reddit, YouTube
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timedelta


REQUEST_TIMEOUT = 30


class CollectorError(RuntimeError):
    """Raised when social data collection cannot continue safely."""


def load_requests():
    try:
        import requests
    except ImportError:
        raise CollectorError("requests required. Install: pip install requests")
    return requests


def parse_json_response(response, source):
    try:
        return response.json()
    except ValueError as exc:
        raise CollectorError(f"{source} returned invalid JSON") from exc


def fetch_twitter(query, days, bearer_token, requests_module=None):
    """从Twitter API获取数据"""
    requests = requests_module or load_requests()

    if not bearer_token:
        raise CollectorError("TWITTER_BEARER_TOKEN not set")

    headers = {"Authorization": f"Bearer {bearer_token}"}

    # 计算日期范围
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=days)

    # Twitter API v2 endpoint
    url = "https://api.twitter.com/2/tweets/search/recent"
    params = {
        "query": query,
        "start_time": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tweet.fields": "created_at,public_metrics,author_id"
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
    except OSError as exc:
        raise CollectorError(f"Twitter API request failed: {exc}") from exc

    if response.status_code != 200:
        raise CollectorError(f"Twitter API error {response.status_code}: {response.text}")

    data = parse_json_response(response, "Twitter API")

    # 转换为标准格式
    results = []
    for tweet in data.get("data", []):
        metrics = tweet.get("public_metrics", {})
        author_id = tweet.get("author_id", "")
        results.append({
            "platform": "twitter",
            "date": tweet.get("created_at", "")[:10],
            "mention": f"@{author_id}" if author_id else "",
            "author": author_id,
            "sentiment": "",  # 需要后续分析
            "engagement": metrics.get("like_count", 0) + metrics.get("retweet_count", 0),
            "content": tweet.get("text", "")[:200]  # 截断长文本
        })

    return results


def fetch_reddit(subreddits, query, client_id, client_secret, requests_module=None):
    """从Reddit API获取数据"""
    requests = requests_module or load_requests()

    if not client_id or not client_secret:
        raise CollectorError("Reddit credentials not set")

    # Reddit OAuth
    auth = requests.auth.HTTPBasicAuth(client_id, client_secret)
    data = {"grant_type": "client_credentials"}
    headers = {"User-Agent": "SocialDataCollector/1.0"}

    try:
        response = requests.post(
            "https://www.reddit.com/api/v1/access_token",
            auth=auth, data=data, headers=headers, timeout=REQUEST_TIMEOUT
        )
    except OSError as exc:
        raise CollectorError(f"Reddit OAuth request failed: {exc}") from exc

    if response.status_code != 200:
        raise CollectorError(f"Reddit OAuth error {response.status_code}: {response.text}")

    token = parse_json_response(response, "Reddit OAuth").get("access_token")
    if not token:
        raise CollectorError("Reddit OAuth response missing access_token")

    headers["Authorization"] = f"Bearer {token}"

    results = []
    for subreddit in [item.strip() for item in subreddits.split(",") if item.strip()]:
        url = f"https://oauth.reddit.com/r/{subreddit}/search"
        params = {"q": query, "limit": 100, "sort": "new"}

        try:
            response = requests.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        except OSError as exc:
            raise CollectorError(f"Reddit search request failed for r/{subreddit}: {exc}") from exc
        if response.status_code != 200:
            raise CollectorError(f"Reddit search error {response.status_code} for r/{subreddit}: {response.text}")

        posts = parse_json_response(response, "Reddit search").get("data", {}).get("children", [])

        for post in posts:
            p = post["data"]
            results.append({
                "platform": "reddit",
                "date": datetime.fromtimestamp(p["created_utc"]).strftime("%Y-%m-%d"),
                "mention": f"r/{subreddit}",
                "author": p["author"],
                "sentiment": "",
                "engagement": p["ups"] + p["num_comments"],
                "content": p["title"][:200]
            })

    return results


def save_to_csv(data, output_file):
    """保存数据到CSV"""
    if not data:
        print("Warning: No data collected")
        return

    fieldnames = ["platform", "date", "mention", "author", "sentiment", "engagement", "content"]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

    print(f"Saved {len(data)} records to {output_file}")


def main():
    parser = argparse.ArgumentParser(description='Collect social media data')
    parser.add_argument('--platform', choices=['twitter', 'reddit', 'youtube', 'all'],
                        required=True, help='Platform to collect from')
    parser.add_argument('--query', help='Search query')
    parser.add_argument('--subreddit', help='Subreddit(s) for Reddit, comma-separated')
    parser.add_argument('--days', type=int, default=7, help='Number of days to look back')
    parser.add_argument('--output', required=True, help='Output CSV file')

    args = parser.parse_args()

    all_data = []

    try:
        if args.platform == 'youtube':
            raise CollectorError("YouTube API collection is not implemented; use exported CSV or manual import")

        if args.platform in ['twitter', 'all']:
            print("Fetching from Twitter...")
            bearer_token = os.getenv('TWITTER_BEARER_TOKEN')
            if bearer_token:
                data = fetch_twitter(args.query, args.days, bearer_token)
                all_data.extend(data)
            else:
                print("Warning: TWITTER_BEARER_TOKEN not set, skipping Twitter")

        if args.platform in ['reddit', 'all']:
            print("Fetching from Reddit...")
            client_id = os.getenv('REDDIT_CLIENT_ID')
            client_secret = os.getenv('REDDIT_CLIENT_SECRET')
            if client_id and client_secret and args.subreddit:
                data = fetch_reddit(args.subreddit, args.query, client_id, client_secret)
                all_data.extend(data)
            else:
                print("Warning: Reddit credentials or subreddit not set, skipping Reddit")
    except CollectorError as exc:
        print(f"Error: {exc}")
        return 1

    save_to_csv(all_data, args.output)

    print("\nNote: Sentiment field is empty. Use the skill to analyze sentiment.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
