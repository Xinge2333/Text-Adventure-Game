const getBaseTelemetryConfig = () => {
  const app = getApp();
  return {
    enabled: app?.globalData?.telemetryEnabled !== false,
    endpoint: '/telemetry/turns'
  };
};

export const submitTurnTelemetry = (payload) => {
  const { enabled, endpoint } = getBaseTelemetryConfig();
  if (!enabled) {
    return Promise.resolve();
  }

  const app = getApp();
  const baseUrl = app?.globalData?.apiBaseUrl || '';

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${endpoint}`,
      method: 'POST',
      data: payload,
      success: () => resolve(),
      fail: (error) => {
        console.warn('Telemetry submission failed', error);
        resolve();
      }
    });
  });
};
