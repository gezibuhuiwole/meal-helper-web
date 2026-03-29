Page({
  data: {
    features: [
      {
        key: "order",
        title: "开始点餐",
        desc: "按餐次选择菜品，实时查看热量与金额",
        available: true
      },
      {
        key: "kitchen",
        title: "魔法厨房",
        desc: "根据现有食材寻找可做菜品",
        available: false
      }
    ]
  },

  handleFeatureTap(event) {
    const { available, key } = event.currentTarget.dataset;

    if (!available) {
      wx.showToast({
        title: "功能建设中",
        icon: "none"
      });
      return;
    }

    if (key === "order") {
      wx.navigateTo({
        url: "/pages/order/order"
      });
    }
  }
});
