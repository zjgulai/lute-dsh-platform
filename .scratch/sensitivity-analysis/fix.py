import numpy as np
from scipy import stats
from scipy.optimize import brentq

nd, npos = 783, 560          # 非并列对数, 正向对数（来自上一步实测）
def pval(G):
    p = G/(1+G)
    mu, var = nd*p, nd*p*(1-p)
    return stats.norm.sf(((npos-0.5)-mu)/np.sqrt(var))

G = brentq(lambda g: pval(g)-0.05, 1.0001, 50.0)
print(f"Γ* = {G:.3f}   p(Γ*)={pval(G):.4f}  p(1)={pval(1.0):.3e}")
for g in [1.0,1.5,2.0,G,2.5,3.0]:
    print(f"  Γ={g:5.2f}  p={pval(g):.4f}   正差对占比上限={g/(1+g):.3f}")

# 反面口径：要让结论翻盘，未观测混淆需把 560/783=71.5% 的正向率拉到多少
print(f"\n实测正向率 = {npos/nd:.1%}")
# 若分析者认为未观测混淆最多使几率比为 Γ，则可见偏差倍数
print(f"Γ*={G:.2f} 等价于：处理组复购几率最多是对照组的 {G:.2f} 倍，而非 Γ=1（无混淆）")

# 部分 R2 口径 (Cinelli-Hazlett OVB): R2_Y~U 和 R2_T~U 同为 r 时
# 用 sign-test 的 Γ 反推：Γ = exp( beta_U_std * ... ) 近似；给出可比数量级
import math
# Γ 与 partial R2 的常用近似: Γ ≈ exp( 2 * rho ) 其中 rho 为标准化相关系数差
rho = math.log(G)/2
print(f"近似等价于标准化偏相关差 rho ≈ {rho:.3f}, partial R^2 ≈ {rho**2:.3f} ({rho**2*100:.1f}%)")

# 稳健性判定
print("\n判定:", "稳健" if G>=1.5 else ("边界稳健" if G>=1.2 else "不稳健"), f"(卡页口径 Γ>1.5 为高可信度)")
