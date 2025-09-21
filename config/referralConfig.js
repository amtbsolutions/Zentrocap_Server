// Central place for Refer & Earn settings with env-driven overrides
export const getMinRedeemAmount = () => {
  const v = Number(process.env.MIN_REDEEM_AMOUNT_INR || process.env.MIN_REDEEM || 250);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 250;
};

export const getRedeemCooldownSeconds = () => {
  const v = Number(process.env.REDEEM_COOLDOWN_SECONDS || process.env.REFERRAL_REDEEM_COOLDOWN || 60);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 60;
};

export default { getMinRedeemAmount, getRedeemCooldownSeconds };
