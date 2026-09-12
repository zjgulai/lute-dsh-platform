# Rosenbaum bounds sensitivity analysis for the "free sample -> repurchase +12%" PSM conclusion
import numpy as np
from scipy import stats
from scipy.optimize import brentq
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import NearestNeighbors

rng = np.random.default_rng(2024)
n = 6000

# ---- covariates (observable) ----
order_value = rng.lognormal(4.5, 0.8, n)          # 客单价
baby_age    = rng.integers(1, 24, n)              # 月龄
hist_orders = rng.poisson(2, n)                   # 历史订单数

# ---- unobserved confounder: 客户忠诚度/loyalty ----
loyalty = rng.normal(0, 1, n)

log_odds = (0.6*(order_value > 200) + 0.4*(hist_orders > 2) + 0.7*loyalty - 0.9)
e = 1/(1+np.exp(-log_odds))
T = (rng.uniform(0, 1, n) < e).astype(int)

tau = 0.12                                        # 真实因果效应（业务口径 +12%）
base = 0.15 + 0.06*loyalty + 0.03*(hist_orders > 2)
Y0 = (rng.uniform(0, 1, n) < np.clip(base, 0, 1)).astype(int)
Y1 = (rng.uniform(0, 1, n) < np.clip(base + tau, 0, 1)).astype(int)
Y  = T*Y1 + (1-T)*Y0

X = np.column_stack([np.log(order_value), baby_age, hist_orders])
print(f"n={n} 赠品率={T.mean():.2%} 复购率={Y.mean():.2%}")
print(f"Naive 差值 = {Y[T==1].mean()-Y[T==0].mean():+.4f}")

# ---- Step1: PSM 1:1 最近邻（卡钳 0.2*logit sd）----
ps = LogisticRegression(max_iter=2000).fit(X, T).predict_proba(X)[:, 1]
lt = np.log(ps/(1-ps)); cal = 0.2*np.std(lt)
ti = np.where(T == 1)[0]
ci = T == 0
ctrl = np.where(ci)[0]
nn = NearestNeighbors(n_neighbors=1).fit(lt[ctrl].reshape(-1, 1))
d, m = nn.kneighbors(lt[ti].reshape(-1, 1))
keep = d.flatten() <= cal
pair_t, pair_c = ti[keep], ctrl[m.flatten()[keep]]
print(f"匹配成功对数 = {len(pair_t)} (剔除 {len(ti)-len(pair_t)} 条无共同支撑)")

# ---- 平衡性：标准化均值差 ----
names = ["log客单价", "月龄", "历史订单数"]
print("\n[平衡性] 匹配前后标准化均值差 %")
smd_before = (X[pair_t].mean(0)-X[pair_c].mean(0))/np.sqrt((X[pair_t].var(0)+X[pair_c].var(0))/2)
# 匹配前 = 全体处理 vs 全体对照
Xall_t, Xall_c = X[T == 1], X[T == 0]
smd_raw = (Xall_t.mean(0)-Xall_c.mean(0))/np.sqrt((Xall_t.var(0)+Xall_c.var(0))/2)
for nm, a, b in zip(names, smd_raw*100, smd_before*100):
    print(f"  {nm:>10}: 匹配前 {a:+7.2f}  ->  匹配后 {b:+7.2f}")

D = Y[pair_t] - Y[pair_c]
nd = len(D)
print(f"\n[效应] 匹配后 ATE = {D.mean():+.4f}  (真实 {tau:+.4f})")

# ---- Step2: 基准显著性检验（Wilcoxon 符号秩 + 符号检验）----
w = stats.wilcoxon(D, alternative="greater")
print(f"[基准] Wilcoxon 符号秩 p = {w.pvalue:.3e}   |  符号检验 p = {stats.binomtest((D>0).sum(), nd, 0.5, 'greater').pvalue:.3e}")
print(f"        正差对 = {(D>0).sum()}, 负差对 = {(D<0).sum()}, 并列 = {(D==0).sum()}")

# ---- Step3: Rosenbaum 符号检验界（Worst-case, 单侧）----
def p_plus(G):
    return G/(1+G)   # 差异化可忽略时，worst-case 下 i 对为正的概率上界

def pval_sign(G):
    p = p_plus(G)
    mu, var = nd*p, nd*p*(1-p)
    z = ((D > 0).sum() - 0.5) - mu
    return stats.norm.sf(z/np.sqrt(var))

def halfwidth(G):
    """Hodges-Lehmann 型区间下界（worst-case 期望）"""
    p = p_plus(G)
    mu = nd*p
    # 用正态近似给出符号检验的反转区间下界
    z = stats.norm.ppf(0.975)
    return mu - z*np.sqrt(nd*p*(1-p))

Gstar = brentq(lambda G: pval_sign(G)-0.05, 1.0001, 20.0)
lb1 = halfwidth(1.0)
# 找 HL 型下界穿过 0 的 Γ
def lb_cross(G):
    return halfwidth(G) - (D > 0).sum()   # 用正差对数量刻度近似
Gstar_ci = brentq(lambda G: halfwidth(G) - (D > 0).sum(), 1.0001, 20.0) if halfwidth(1.0) > (D>0).sum() else float('nan')

print(f"\n[Step3] Γ* (符号检验在 α=0.05 单侧失去显著的临界值) = {Gstar:.3f}")
print(f"        检验: p(Γ={Gstar:.3f}) = {pval_sign(Gstar):.4f} ; p(Γ=1) = {pval_sign(1.0):.3e}")

# Γ 的含义：处理组/对照组的处理几率之比（倍数）
for G in [1.0, Gstar, 1.5, 2.0, 2.5]:
    print(f"  Γ={G:>4.2f} -> p={pval_sign(G):.4f}  处理几率最多为对照的 {G:.2f} 倍")

# ---- Step4: 若结论被推翻，需要多强的混淆？反推 Oster δ / 部分 R2 ----
# 简化：Γ 对应"未观测变量使处理几率翻倍"的倍数
print(f"\n[解读] 需要未观测混淆使'收到赠品'的几率相对 odds 达到 {Gstar:.2f} 倍，才能把 p 拉到 0.05 以上。")
