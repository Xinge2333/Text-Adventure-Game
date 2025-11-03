const FAVORITES_KEY = 'favorites';

export const storage = {
  getFavorites() {
    try {
      return wx.getStorageSync(FAVORITES_KEY) || [];
    } catch (error) {
      console.warn('Failed to read favorites', error);
      return [];
    }
  },

  setFavorites(favorites = []) {
    try {
      wx.setStorageSync(FAVORITES_KEY, favorites);
    } catch (error) {
      console.warn('Failed to write favorites', error);
    }
  }
};
