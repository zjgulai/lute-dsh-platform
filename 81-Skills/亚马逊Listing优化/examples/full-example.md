# 完整示例：露营灯 Listing 优化（输入 → 输出）

## 输入

```yaml
产品: 便携式露营灯
目标市场: 美国站
核心卖点: 超轻量(180g)、USB-C快充、IPX7防水、3档亮度+SOS
目标关键词: camping lantern, portable light, outdoor lamp, rechargeable lantern
现有文案: 无（新品上架）
```

## 输出（完整 Listing）

### 标题（≤200 字符，前 80 字符放核心词+核心卖点）

```
Camping Lantern Rechargeable, Ultra-Light Portable LED Light with USB-C Fast Charging, IPX7 Waterproof, 3 Brightness Modes and SOS - for Hiking, Tent, Emergency
```

前 80 字符：`Camping Lantern Rechargeable, Ultra-Light Portable LED Light with USB-C Fast`（核心词 camping lantern + 核心卖点 rechargeable/ultra-light 已覆盖）。

### 五点描述（Bullet Points）

1. 【超轻便携】仅重 180g，单手可握，顶部挂钩可挂帐篷/树枝/背包，户外携带零负担。
2. 【快速充电】USB-C 接口约 2 小时充满，满电续航 12 小时，长夜露营不断光。
3. 【IPX7 全防水】整机可浸水，雨天、溪边、潮湿环境稳定工作。
4. 【多档调光】3 档亮度 + SOS 闪烁，从营帐照明到应急求救一灯搞定。
5. 【耐用可靠】航空铝合金外壳，抗摔耐磨，多环境经久耐用。

### 产品描述（A+ 建议）

```
Rechargeable camping lantern with 180g ultra-light body, USB-C fast charging, and IPX7 waterproof rating. Three brightness modes plus SOS for emergencies. Hang it in a tent, on a branch, or clip it to a backpack — reliable light for hiking, camping, and power outages.
```

### 后端搜索词（≤250 字节，不重复标题已埋词）

```
camping light outdoor lantern tent light emergency light power outage light hiking lantern backpacking light usb c lantern rechargeable flashlight
```

## 用 run.py 审计验证

```bash
python scripts/run.py --product-info product.json --listing-data listing.json --output audit.json
```

`scripts/core.py` 会对标题长度（≤200）、五点质量、后端词做结构化评分，输出 `overall_score` 与逐项 `warnings`。
