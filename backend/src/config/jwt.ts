export const jwtConfig = {
  accessSecret: process.env.JWT_SECRET || "default_dev_access_secret_change_in_prod",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "default_dev_refresh_secret_change_in_prod",
  accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  refreshDurationDays: 7,
};
